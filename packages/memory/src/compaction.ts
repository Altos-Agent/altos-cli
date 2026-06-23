// @altos/memory - Session compaction utilities

import type {
  AgentEvent,
  ToolCallCompletedEvent,
  ToolCallFailedEvent,
  FilePatchAppliedEvent,
  AssistantMessageEvent,
} from "@altos/core";

/**
 * Result of compacting session events into a summary.
 */
export interface CompactionResult {
  /** Markdown-formatted summary */
  markdown: string;
  /** Key decisions extracted */
  decisions: string[];
  /** Files that were modified */
  fileChanges: string[];
  /** Test results if any tests were run */
  testResults: string[];
}

/**
 * Decision indicators in assistant messages.
 */
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
];

/**
 * Check if a string contains a decision indicator.
 */
function isDecision(text: string): boolean {
  return DECISION_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Extract a short summary from a long text.
 */
function extractSummary(text: string, maxLength = 200): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + "...";
}

/**
 * Compact a session's events into a summary.
 *
 * Preserves:
 * - Key decisions (from assistant messages with decision indicators)
 * - File changes (from FilePatchAppliedEvent and tool_call_completed for apply_patch/write_file)
 * - Test results (from tool_call_completed for run_tests/test)
 *
 * Drops:
 * - Detailed tool arguments
 * - Repeated patterns
 * - Raw API interactions
 *
 * @param events - Raw session events (should already be redacted)
 * @returns Compaction result with markdown summary and extracted data
 */
export async function compactSessionEvents(events: AgentEvent[]): Promise<CompactionResult> {
  const decisions: string[] = [];
  const fileChanges: Set<string> = new Set();
  const testResults: string[] = [];

  // Track timestamps for summary
  const startTime = events[0]?.timestamp ?? Date.now();
  const endTime = events[events.length - 1]?.timestamp ?? Date.now();

  for (const event of events) {
    switch (event.type) {
      case "assistant_message": {
        const assistantEvent = event as AssistantMessageEvent;
        const content =
          typeof assistantEvent.payload.content === "string" ? assistantEvent.payload.content : "";

        if (content && isDecision(content)) {
          decisions.push(extractSummary(content, 250));
        }
        break;
      }

      case "file_patch_applied": {
        const appliedEvent = event as FilePatchAppliedEvent;
        if (appliedEvent.payload.success) {
          fileChanges.add(appliedEvent.payload.file);
        }
        break;
      }

      case "tool_call_completed": {
        const completed = event as ToolCallCompletedEvent;
        const toolName = completed.payload.toolCall.name;
        const result = completed.payload.result;

        // File modification tools
        if (
          toolName === "apply_patch" ||
          toolName === "write_file" ||
          toolName === "edit_file" ||
          toolName === "create_file"
        ) {
          if (result.success && typeof result.data === "object") {
            const data = result.data as Record<string, unknown>;
            if (data.file && typeof data.file === "string") {
              fileChanges.add(data.file);
            }
          }
        }

        // Test tools
        if (toolName === "run_tests" || toolName === "test" || toolName === "npm_test") {
          if (result.success) {
            testResults.push("Tests passed");
          } else if (result.error) {
            testResults.push(`Tests failed: ${extractSummary(result.error, 100)}`);
          }
        }
        break;
      }

      case "tool_call_failed": {
        const failed = event as ToolCallFailedEvent;
        // Only record failures for significant operations
        const significantTools = [
          "apply_patch",
          "write_file",
          "run_tests",
          "test",
          "build",
          "compile",
        ];
        if (significantTools.includes(failed.payload.toolCall.name)) {
          testResults.push(
            `${failed.payload.toolCall.name} failed: ${extractSummary(failed.payload.error, 100)}`,
          );
        }
        break;
      }
    }
  }

  // Build markdown summary
  const markdown = buildCompactionMarkdown({
    eventCount: events.length,
    decisions,
    fileChanges: [...fileChanges],
    testResults,
    timeRange: formatTimeRange(startTime, endTime),
  });

  return {
    markdown,
    decisions: [...new Set(decisions)].slice(0, 20),
    fileChanges: [...fileChanges].slice(0, 50),
    testResults: [...new Set(testResults)].slice(0, 20),
  };
}

/**
 * Format a time range for display in the summary.
 */
function formatTimeRange(start: number, end: number): string {
  const startDate = new Date(start);
  const endDate = new Date(end);

  // Same day - show time range
  if (startDate.toDateString() === endDate.toDateString()) {
    return `${startDate.toLocaleDateString()} ${startDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - ${endDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }

  // Different days
  return `${formatDate(start)} - ${formatDate(end)}`;
}

/**
 * Format a date for display.
 */
function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Build markdown summary from compaction data.
 */
function buildCompactionMarkdown(data: {
  eventCount: number;
  decisions: string[];
  fileChanges: string[];
  testResults: string[];
  timeRange: string;
}): string {
  const lines: string[] = [
    "# Session Compaction Summary",
    "",
    `**Time Range:** ${data.timeRange}`,
    `**Total Events:** ${data.eventCount}`,
    "",
  ];

  if (data.decisions.length > 0) {
    lines.push("## Decisions", "");
    for (const decision of data.decisions.slice(0, 15)) {
      lines.push(`- ${decision}`);
    }
    lines.push("");
  }

  if (data.fileChanges.length > 0) {
    lines.push("## File Changes", "");
    for (const file of data.fileChanges.slice(0, 30)) {
      lines.push(`- \`${file}\``);
    }
    if (data.fileChanges.length > 30) {
      lines.push(`- ... and ${data.fileChanges.length - 30} more`);
    }
    lines.push("");
  }

  if (data.testResults.length > 0) {
    lines.push("## Test Results", "");
    for (const result of data.testResults.slice(0, 15)) {
      lines.push(`- ${result}`);
    }
    lines.push("");
  }

  lines.push(
    "_This summary was auto-generated by session compaction._",
    "_Detailed event logs are available in the session JSONL file._",
  );

  return lines.join("\n");
}

/**
 * Redact and compact a session's events in one pass.
 *
 * @param events - Raw session events
 * @returns Redacted and compacted session data
 */
export async function redactAndCompactSessionEvents(
  events: AgentEvent[],
): Promise<CompactionResult> {
  // Compact events directly (redaction is handled at write time by the provider)
  return compactSessionEvents(events);
}
