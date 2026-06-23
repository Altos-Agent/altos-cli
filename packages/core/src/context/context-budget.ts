// @altos/core - Context Budget Manager
// Tracks estimated token usage across all context dimensions and
// triggers auto-compaction at configurable thresholds.

import type { AgentEvent } from "../events/types.js";

// =============================================================================
// Budget Tracking Types
// =============================================================================

/**
 * A single dimension of context that contributes to total token budget.
 */
export interface BudgetDimension {
  name: string;
  /** Estimated tokens (input side) */
  inputTokens: number;
  /** Estimated tokens (output side, for tool results etc.) */
  outputTokens: number;
  /** Raw byte size of the source */
  byteSize: number;
}

/**
 * Full snapshot of the context budget at a point in time.
 */
export interface ContextBudgetSnapshot {
  /** All tracked dimensions */
  dimensions: BudgetDimension[];
  /** Sum of all input tokens across dimensions */
  totalInputTokens: number;
  /** Sum of all output tokens across dimensions */
  totalOutputTokens: number;
  /** Total events tracked */
  eventCount: number;
  /** Current budget usage as a fraction [0, 1] */
  usageRatio: number;
  /** Timestamp of this snapshot */
  timestamp: number;
}

/**
 * Budget threshold configuration.
 */
export interface BudgetThresholds {
  /** Warning threshold [0, 1] — emits a warning event */
  warnAt: number;
  /** Soft compact threshold [0, 1] — triggers voluntary compaction */
  softCompactAt: number;
  /** Hard compact threshold [0, 1] — forces compaction before next model call */
  hardCompactAt: number;
  /** Block threshold [0, 1] — blocks model calls until compaction succeeds */
  blockAt: number;
}

/**
 * Budget status indicating what action should be taken.
 */
export type BudgetStatus =
  | { level: "ok"; usageRatio: number }
  | { level: "warn"; usageRatio: number; message: string }
  | { level: "soft_compact"; usageRatio: number; message: string }
  | { level: "hard_compact"; usageRatio: number; message: string }
  | { level: "blocked"; usageRatio: number; message: string };

// =============================================================================
// Token Estimation
// =============================================================================

/**
 * Rough token estimation: ~4 characters per token for English text.
 * This is a conservative estimate that errs on the side of over-counting.
 */
const CHARS_PER_TOKEN = 4;

/**
 * Estimate tokens from character count.
 */
export function estimateTokensFromChars(chars: number): number {
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

/**
 * Estimate tokens from a string.
 */
export function estimateTokensFromString(text: string): number {
  return estimateTokensFromChars(text.length);
}

/**
 * Estimate tokens from a JSON-serializable value (rough upper bound).
 */
export function estimateTokensFromValue(value: unknown): number {
  return estimateTokensFromChars(JSON.stringify(value).length);
}

// =============================================================================
// Default Thresholds
// =============================================================================

export const DEFAULT_THRESHOLDS: BudgetThresholds = {
  warnAt: 0.7,
  softCompactAt: 0.8,
  hardCompactAt: 0.9,
  blockAt: 0.97,
};

// =============================================================================
// ContextBudgetManager
// =============================================================================

/**
 * ContextBudgetManager tracks context budget across all dimensions
 * and determines when compaction should be triggered.
 *
 * Dimensions tracked:
 * - estimated input tokens (messages sent to the model)
 * - estimated output tokens (model responses + tool results)
 * - event count (raw event volume)
 * - tool output size (size of tool call results)
 * - selected file context size (files read/displayed to the model)
 * - repo map size (repository structure overview)
 * - memory context size (retrieved memories/search results)
 *
 * The manager compares total estimated tokens against maxContextTokens
 * (typically the model's context window limit) and reports status.
 */
export class ContextBudgetManager {
  private maxContextTokens: number;
  private thresholds: BudgetThresholds;
  private dimensions: Map<string, BudgetDimension> = new Map();
  private eventCount = 0;
  private isCompactionBlocked = false;
  private lastStatus: BudgetStatus = { level: "ok", usageRatio: 0 };

  constructor(
    maxContextTokens = 100_000,
    thresholds: Partial<BudgetThresholds> = {},
  ) {
    this.maxContextTokens = maxContextTokens;
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  /**
   * Update the max context token limit.
   */
  setMaxContextTokens(tokens: number): void {
    this.maxContextTokens = tokens;
  }

  /**
   * Update threshold configuration.
   */
  setThresholds(thresholds: Partial<BudgetThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  /**
   * Get current thresholds.
   */
  getThresholds(): BudgetThresholds {
    return { ...this.thresholds };
  }

  // ---------------------------------------------------------------------------
  // Dimension Tracking
  // ---------------------------------------------------------------------------

  /**
   * Update or set a dimension's measurements.
   * If the dimension already exists, it will be overwritten.
   */
  setDimension(name: string, inputTokens: number, outputTokens: number, byteSize: number): void {
    this.dimensions.set(name, {
      name,
      inputTokens,
      outputTokens,
      byteSize,
    });
  }

  /**
   * Update just the byte size of a dimension (input tokens will be re-estimated).
   */
  updateDimensionSize(name: string, byteSize: number): void {
    const existing = this.dimensions.get(name);
    if (existing) {
      this.dimensions.set(name, {
        ...existing,
        byteSize,
        inputTokens: estimateTokensFromChars(byteSize),
      });
    }
  }

  /**
   * Remove a dimension from tracking.
   */
  removeDimension(name: string): void {
    this.dimensions.delete(name);
  }

  /**
   * Get a specific dimension.
   */
  getDimension(name: string): BudgetDimension | undefined {
    return this.dimensions.get(name);
  }

  // ---------------------------------------------------------------------------
  // Budget Snapshot
  // ---------------------------------------------------------------------------

  /**
   * Get a full snapshot of the current budget state.
   */
  snapshot(): ContextBudgetSnapshot {
    const dims = [...this.dimensions.values()];
    const totalInputTokens = dims.reduce((sum, d) => sum + d.inputTokens, 0);
    const totalOutputTokens = dims.reduce((sum, d) => sum + d.outputTokens, 0);
    // Use input tokens as the primary budget metric
    const usageRatio = Math.min(1, totalInputTokens / this.maxContextTokens);

    return {
      dimensions: dims,
      totalInputTokens,
      totalOutputTokens,
      eventCount: this.eventCount,
      usageRatio,
      timestamp: Date.now(),
    };
  }

  // ---------------------------------------------------------------------------
  // Status Evaluation
  // ---------------------------------------------------------------------------

  /**
   * Get current budget status and recommended action.
   * This is the primary method for checking if compaction is needed.
   */
  getStatus(): BudgetStatus {
    const snap = this.snapshot();
    const u = snap.usageRatio;

    // If blocked and we're below hard threshold, unblock
    if (this.isCompactionBlocked && u < this.thresholds.hardCompactAt) {
      this.isCompactionBlocked = false;
    }

    if (u >= this.thresholds.blockAt) {
      this.isCompactionBlocked = true;
      this.lastStatus = {
        level: "blocked",
        usageRatio: u,
        message: `Context at ${(u * 100).toFixed(1)}% — model calls blocked until compaction succeeds`,
      };
      return this.lastStatus;
    }

    if (u >= this.thresholds.hardCompactAt) {
      this.lastStatus = {
        level: "hard_compact",
        usageRatio: u,
        message: `Context at ${(u * 100).toFixed(1)}% — compaction required before next model call`,
      };
      return this.lastStatus;
    }

    if (u >= this.thresholds.softCompactAt) {
      this.lastStatus = {
        level: "soft_compact",
        usageRatio: u,
        message: `Context at ${(u * 100).toFixed(1)}% — voluntary compaction recommended`,
      };
      return this.lastStatus;
    }

    if (u >= this.thresholds.warnAt) {
      this.lastStatus = {
        level: "warn",
        usageRatio: u,
        message: `Context at ${(u * 100).toFixed(1)}% — budget pressure building`,
      };
      return this.lastStatus;
    }

    this.lastStatus = { level: "ok", usageRatio: u };
    return this.lastStatus;
  }

  /**
   * Check if a model call can proceed given current budget.
   * Returns false if blocked.
   */
  canCallModel(): boolean {
    const status = this.getStatus();
    return status.level !== "blocked";
  }

  /**
   * Check if compaction is required (hard threshold or blocked).
   */
  isCompactionRequired(): boolean {
    const status = this.getStatus();
    return status.level === "hard_compact" || status.level === "blocked";
  }

  /**
   * Check if compaction is recommended (soft threshold or higher).
   */
  isCompactionRecommended(): boolean {
    const status = this.getStatus();
    return (
      status.level === "soft_compact" ||
      status.level === "hard_compact" ||
      status.level === "blocked"
    );
  }

  // ---------------------------------------------------------------------------
  // Event Tracking Helpers
  // ---------------------------------------------------------------------------

  /**
   * Record that an event was added to the session.
   * Updates event count dimension.
   */
  recordEvent(_event: AgentEvent): void {
    this.eventCount++;
    // Update event count dimension
    this.setDimension(
      "event_count",
      this.eventCount * 10, // rough: 10 tokens per event metadata overhead
      0,
      this.eventCount,
    );
  }

  /**
   * Reset the compaction blocked flag (call after successful compaction).
   */
  unblockCompaction(): void {
    this.isCompactionBlocked = false;
  }

  // ---------------------------------------------------------------------------
  // Convenience: Update from Session Events
  // ---------------------------------------------------------------------------

  /**
   * Update all budget dimensions based on the current session event list.
   * Call this before each model invocation to get accurate budget state.
   */
  updateFromEvents(events: AgentEvent[]): void {
    this.eventCount = events.length;

    // Estimate input tokens from user/assistant messages
    let inputChars = 0;
    let outputChars = 0;
    let toolOutputChars = 0;
    let fileContextChars = 0;

    for (const event of events) {
      switch (event.type) {
        case "user_message":
        case "assistant_message":
          inputChars += JSON.stringify(event.payload).length;
          break;
        case "assistant_delta":
          outputChars += event.payload.delta.length;
          break;
        case "tool_call_completed": {
          const result = event.payload.result;
          const resultStr = JSON.stringify(result);
          toolOutputChars += resultStr.length;
          // If it's a file operation, count toward file context
          const toolName = event.payload.toolCall.name;
          if (
            toolName === "apply_patch" ||
            toolName === "write_file" ||
            toolName === "read_file" ||
            toolName === "edit_file"
          ) {
            fileContextChars += resultStr.length;
          }
          break;
        }
        case "tool_call_failed":
          toolOutputChars += JSON.stringify(event.payload).length;
          break;
        default:
          // Other events: minimal overhead
          inputChars += 50;
          break;
      }
    }

    this.setDimension("messages", estimateTokensFromChars(inputChars), estimateTokensFromChars(outputChars), inputChars);
    this.setDimension("tool_outputs", estimateTokensFromChars(toolOutputChars) / 2, estimateTokensFromChars(toolOutputChars) / 2, toolOutputChars);
    this.setDimension("event_count", this.eventCount * 10, 0, this.eventCount);
    this.setDimension("file_context", estimateTokensFromChars(fileContextChars), 0, fileContextChars);
  }
}
