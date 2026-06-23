// @altos/core - Auto Compactor
// Summarizes old assistant/user/tool events while preserving critical data.
// Used by the ContextBudgetManager to reclaim context budget.

import type {
  AgentEvent,
} from "../events/types.js";

// =============================================================================
// Preservation Rules
// =============================================================================

/**
 * Data that must be preserved during compaction.
 */
export interface PreservedData {
  /** Key decisions extracted from assistant messages */
  decisions: string[];
  /** Files that were modified */
  fileChanges: string[];
  /** Test results */
  testResults: string[];
  /** Permission grants */
  permissionGrants: string[];
  /** Permission denials */
  permissionDenials: string[];
  /** Error events that occurred */
  errors: string[];
  /** Current working plan/goals */
  currentPlan?: string;
  /** Unresolved TODOs from discussions */
  unresolvedTodos: string[];
  /** User-provided constraints or instructions */
  constraints: string[];
}

/**
 * A summarized event that replaces a range of original events.
 */
export interface SummarizedEvent {
  type: "session_summary";
  sessionId: string;
  sequence: number;
  timestamp: number;
  payload: {
    /** Markdown summary of the compacted events */
    summary: string;
    /** What was preserved from the original events */
    preserved: PreservedData;
    /** Event count that was compacted */
    originalCount: number;
    /** Sequence range that was compacted */
    fromSequence: number;
    toSequence: number;
  };
}

// =============================================================================
// Decision Extraction Patterns
// =============================================================================

const DECISION_PATTERNS = [
  /I will/i,
  /I decided/i,
  /Choosing/i,
  /I'll proceed with/i,
  /The approach is to/i,
  /Selected:/i,
  /Chosen:/i,
  /Decision:/i,
  /Choosing option \d/i,
  /I'll use/i,
  /Going with/i,
  /Going to use/i,
  /Let me use/i,
  /Best approach is/i,
  /I believe we should/i,
  /We should/i,
  /I'll go with/i,
];

const TODO_PATTERNS = [
  /TODO:/i,
  /needs to be done/i,
  /still need to/i,
  /remaining/i,
  /outstanding/i,
  /not yet done/i,
  /pending/i,
  /to do/i,
];

const CONSTRAINT_PATTERNS = [
  /must not/i,
  /cannot/i,
  /should not/i,
  /do not/i,
  /must only/i,
  /only use/i,
  /the user requested/i,
  /the user wants/i,
  /the user said/i,
  /important:/i,
  /note that/i,
  /please do not/i,
  /please ensure/i,
  /must ensure/i,
];

// =============================================================================
// AutoCompactor
// =============================================================================

/**
 * AutoCompactor summarizes old events in a session while preserving
 * critical decisions, file changes, test results, and permissions.
 */
export class AutoCompactor {
  constructor(
    public readonly maxSummaryTokens = 4000,
    public readonly redactSecrets = true,
  ) {}

  /**
   * Compact a range of events into a summary event.
   *
   * @param events The events to compact (should be a contiguous range)
   * @param sessionId The session these events belong to
   * @param fromSequence Starting sequence number (inclusive)
   * @param toSequence Ending sequence number (inclusive)
   * @returns A single SummarizedEvent that replaces the range
   */
  async compact(
    events: AgentEvent[],
    sessionId: string,
    fromSequence: number,
    toSequence: number,
  ): Promise<SummarizedEvent> {
    // Filter to the range
    const rangeEvents = events.filter(
      (e) => e.sequence >= fromSequence && e.sequence <= toSequence,
    );

    // Extract preserved data
    const preserved = this.extractPreservedData(rangeEvents);

    // Generate markdown summary
    const summary = await this.generateSummary(rangeEvents, preserved);

    return {
      type: "session_summary",
      sessionId,
      sequence: toSequence,
      timestamp: Date.now(),
      payload: {
        summary,
        preserved,
        originalCount: rangeEvents.length,
        fromSequence,
        toSequence,
      },
    };
  }

  /**
   * Extract all preserved data from events.
   */
  extractPreservedData(events: AgentEvent[]): PreservedData {
    const decisions: string[] = [];
    const fileChanges: string[] = [];
    const testResults: string[] = [];
    const permissionGrants: string[] = [];
    const permissionDenials: string[] = [];
    const errors: string[] = [];
    const unresolvedTodos: string[] = [];
    const constraints: string[] = [];

    for (const event of events) {
      switch (event.type) {
        case "assistant_message": {
          const content = this.getTextContent(event.payload.content);
          if (!content) break;

          // Extract decisions
          if (DECISION_PATTERNS.some((p) => p.test(content))) {
            decisions.push(this.truncate(content, 250));
          }

          // Extract TODOs
          if (TODO_PATTERNS.some((p) => p.test(content))) {
            unresolvedTodos.push(this.truncate(content, 200));
          }

          // Extract constraints
          if (CONSTRAINT_PATTERNS.some((p) => p.test(content))) {
            constraints.push(this.truncate(content, 200));
          }
          break;
        }

        case "file_patch_applied": {
          if (event.payload.success) {
            fileChanges.push(`${event.payload.file} (patch applied)`);
          }
          break;
        }

        case "tool_call_completed": {
          const toolName = event.payload.toolCall.name;
          const result = event.payload.result;

          // File operations
          if (
            toolName === "apply_patch" ||
            toolName === "write_file" ||
            toolName === "edit_file" ||
            toolName === "create_file"
          ) {
            if (result.success && this.hasFileInResult(result.data)) {
              fileChanges.push(this.getFileFromResult(result.data) ?? toolName);
            }
          }

          // Test operations
          if (toolName === "run_tests" || toolName === "test" || toolName === "npm_test") {
            if (result.success) {
              testResults.push("Tests passed");
            } else if (result.error) {
              testResults.push(`Tests failed: ${this.truncate(result.error, 100)}`);
            }
          }
          break;
        }

        case "tool_call_failed": {
          const significant = [
            "apply_patch",
            "write_file",
            "run_tests",
            "build",
            "compile",
          ];
          if (significant.includes(event.payload.toolCall.name)) {
            errors.push(
              `${event.payload.toolCall.name} failed: ${this.truncate(event.payload.error, 100)}`,
            );
          }
          break;
        }

        case "permission_granted": {
          permissionGrants.push(
            `${event.payload.permission} (tool: ${event.payload.toolCallId})`,
          );
          break;
        }

        case "permission_denied": {
          permissionDenials.push(
            `${event.payload.permission} denied: ${event.payload.reason ?? "no reason"}`,
          );
          break;
        }
      }
    }

    return {
      decisions: this.dedup(decisions).slice(0, 20),
      fileChanges: this.dedup(fileChanges).slice(0, 50),
      testResults: this.dedup(testResults).slice(0, 20),
      permissionGrants: this.dedup(permissionGrants).slice(0, 20),
      permissionDenials: this.dedup(permissionDenials).slice(0, 20),
      errors: this.dedup(errors).slice(0, 10),
      unresolvedTodos: this.dedup(unresolvedTodos).slice(0, 10),
      constraints: this.dedup(constraints).slice(0, 10),
    };
  }

  /**
   * Generate a markdown summary of the events.
   */
  private async generateSummary(
    events: AgentEvent[],
    preserved: PreservedData,
  ): Promise<string> {
    const startTime = events[0]?.timestamp ?? Date.now();
    const endTime = events[events.length - 1]?.timestamp ?? Date.now();

    const lines: string[] = [
      `# Session Segment Summary`,
      ``,
      `**Time Range:** ${this.formatTimeRange(startTime, endTime)}`,
      `**Events Compacted:** ${events.length}`,
      ``,
    ];

    if (preserved.decisions.length > 0) {
      lines.push(`## Key Decisions`, ``);
      for (const d of preserved.decisions.slice(0, 10)) {
        lines.push(`- ${d}`);
      }
      lines.push(``);
    }

    if (preserved.constraints.length > 0) {
      lines.push(`## Constraints & Instructions`, ``);
      for (const c of preserved.constraints.slice(0, 5)) {
        lines.push(`- ${c}`);
      }
      lines.push(``);
    }

    if (preserved.unresolvedTodos.length > 0) {
      lines.push(`## Unresolved Items`, ``);
      for (const t of preserved.unresolvedTodos.slice(0, 5)) {
        lines.push(`- ${t}`);
      }
      lines.push(``);
    }

    if (preserved.fileChanges.length > 0) {
      lines.push(`## File Changes`, ``);
      for (const f of preserved.fileChanges.slice(0, 20)) {
        lines.push(`- \`${f}\``);
      }
      if (preserved.fileChanges.length > 20) {
        lines.push(`- _... and ${preserved.fileChanges.length - 20} more_`);
      }
      lines.push(``);
    }

    if (preserved.testResults.length > 0) {
      lines.push(`## Test Results`, ``);
      for (const t of preserved.testResults.slice(0, 10)) {
        lines.push(`- ${t}`);
      }
      lines.push(``);
    }

    if (preserved.errors.length > 0) {
      lines.push(`## Errors`, ``);
      for (const e of preserved.errors.slice(0, 5)) {
        lines.push(`- ${e}`);
      }
      lines.push(``);
    }

    lines.push(
      `_This segment was auto-summarized to reclaim context budget._`,
    );

    return lines.join("\n");
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private getTextContent(content: string | unknown): string {
    if (typeof content === "string") return content;
    if (typeof content === "object" && content !== null) {
      // Handle content blocks format
      const obj = content as Record<string, unknown>;
      if (obj.type === "text" && typeof obj.text === "string") return obj.text;
    }
    return "";
  }

  private hasFileInResult(data: unknown): boolean {
    if (!data || typeof data !== "object") return false;
    const obj = data as Record<string, unknown>;
    return typeof obj.file === "string";
  }

  private getFileFromResult(data: unknown): string | null {
    if (!data || typeof data !== "object") return null;
    const obj = data as Record<string, unknown>;
    return typeof obj.file === "string" ? obj.file : null;
  }

  private truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen).trim() + "...";
  }

  private dedup(items: string[]): string[] {
    return [...new Set(items)];
  }

  private formatTimeRange(start: number, end: number): string {
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (startDate.toDateString() === endDate.toDateString()) {
      return `${startDate.toLocaleDateString()} ${startDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - ${endDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    }
    return `${this.formatDate(start)} - ${this.formatDate(end)}`;
  }

  private formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
}

/**
 * Check if an event should be preserved individually (not compacted).
 * Critical events like session_started, permission decisions, and
 * compact events are never compacted away.
 */
export function isCriticalEvent(event: AgentEvent): boolean {
  switch (event.type) {
    case "session_started":
    case "permission_granted":
    case "permission_denied":
    case "compact_requested":
    case "compact_completed":
    case "session_completed":
    case "error":
      return true;
    default:
      return false;
  }
}

/**
 * Determine which events should be kept verbatim vs compacted.
 * Returns { keep, compact } where:
 * - keep: events to preserve verbatim
 * - compact: events that can be summarized
 */
export function partitionEvents(
  events: AgentEvent[],
): { keep: AgentEvent[]; compact: AgentEvent[] } {
  const keep: AgentEvent[] = [];
  const compact: AgentEvent[] = [];

  for (const event of events) {
    if (isCriticalEvent(event)) {
      keep.push(event);
    } else {
      compact.push(event);
    }
  }

  return { keep, compact };
}
