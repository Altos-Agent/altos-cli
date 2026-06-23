// @altos/core - Event factory and helpers

import type {
  AgentEvent,
  ToolCall,
  EventMetadata,
  SessionStartedEvent,
  UserMessageEvent,
  AssistantMessageEvent,
  AssistantDeltaEvent,
  ToolCallRequestedEvent,
  PermissionRequestedEvent,
  PermissionGrantedEvent,
  PermissionDeniedEvent,
  ToolCallStartedEvent,
  ToolCallCompletedEvent,
  ToolCallFailedEvent,
  FilePatchProposedEvent,
  FilePatchAppliedEvent,
  CompactRequestedEvent,
  CompactCompletedEvent,
  CompactFailedEvent,
  SessionCompletedEvent,
  ErrorEvent,
  PluginHookCalledEvent,
} from "./types.js";

let globalEventCounter = 0;

/**
 * Generate a unique event ID
 */
export function generateEventId(): string {
  return `evt_${Date.now()}_${++globalEventCounter}`;
}

/**
 * Get current timestamp in milliseconds
 */
export function now(): number {
  return Date.now();
}

/**
 * Create a session_started event
 */
export function createSessionStartedEvent(
  sessionId: string,
  sequence: number,
  options: { model?: string; provider?: string; cwd: string },
): SessionStartedEvent {
  return {
    id: generateEventId(),
    sessionId,
    type: "session_started",
    timestamp: now(),
    sequence,
    payload: {
      model: options.model,
      provider: options.provider,
      cwd: options.cwd,
    },
  };
}

/**
 * Create a user_message event
 */
export function createUserMessageEvent(
  sessionId: string,
  sequence: number,
  content: string,
  attachments?: string[],
): UserMessageEvent {
  return {
    id: generateEventId(),
    sessionId,
    type: "user_message",
    timestamp: now(),
    sequence,
    payload: { content, attachments },
  };
}

/**
 * Create an assistant_message event
 */
export function createAssistantMessageEvent(
  sessionId: string,
  sequence: number,
  content: string,
  toolCalls?: ToolCall[],
): AssistantMessageEvent {
  return {
    id: generateEventId(),
    sessionId,
    type: "assistant_message",
    timestamp: now(),
    sequence,
    payload: { content, toolCalls },
  };
}

/**
 * Create an assistant_delta event
 */
export function createAssistantDeltaEvent(
  sessionId: string,
  sequence: number,
  delta: string,
  isComplete: boolean,
): AssistantDeltaEvent {
  return {
    id: generateEventId(),
    sessionId,
    type: "assistant_delta",
    timestamp: now(),
    sequence,
    payload: { delta, isComplete },
  };
}

/**
 * Create a tool_call_requested event
 */
export function createToolCallRequestedEvent(
  sessionId: string,
  sequence: number,
  toolCall: ToolCall,
): ToolCallRequestedEvent {
  return {
    id: generateEventId(),
    sessionId,
    type: "tool_call_requested",
    timestamp: now(),
    sequence,
    payload: { toolCall },
  };
}

/**
 * Create a permission_requested event
 */
export function createPermissionRequestedEvent(
  sessionId: string,
  sequence: number,
  permission: string,
  toolCallId: string,
  reason?: string,
): PermissionRequestedEvent {
  return {
    id: generateEventId(),
    sessionId,
    type: "permission_requested",
    timestamp: now(),
    sequence,
    payload: { permission, reason, toolCallId },
  };
}

/**
 * Create a permission_granted event
 */
export function createPermissionGrantedEvent(
  sessionId: string,
  sequence: number,
  permission: string,
  toolCallId: string,
): PermissionGrantedEvent {
  return {
    id: generateEventId(),
    sessionId,
    type: "permission_granted",
    timestamp: now(),
    sequence,
    payload: { permission, toolCallId },
  };
}

/**
 * Create a permission_denied event
 */
export function createPermissionDeniedEvent(
  sessionId: string,
  sequence: number,
  permission: string,
  toolCallId: string,
  reason?: string,
): PermissionDeniedEvent {
  return {
    id: generateEventId(),
    sessionId,
    type: "permission_denied",
    timestamp: now(),
    sequence,
    payload: { permission, toolCallId, reason },
  };
}

/**
 * Create a tool_call_started event
 */
export function createToolCallStartedEvent(
  sessionId: string,
  sequence: number,
  toolCall: ToolCall,
): ToolCallStartedEvent {
  return {
    id: generateEventId(),
    sessionId,
    type: "tool_call_started",
    timestamp: now(),
    sequence,
    payload: { toolCall },
  };
}

/**
 * Create a tool_call_completed event
 */
export function createToolCallCompletedEvent(
  sessionId: string,
  sequence: number,
  toolCall: ToolCall,
  result: { success: boolean; data?: unknown; error?: string; duration: number },
): ToolCallCompletedEvent {
  return {
    id: generateEventId(),
    sessionId,
    type: "tool_call_completed",
    timestamp: now(),
    sequence,
    payload: { toolCall, result },
  };
}

/**
 * Create a tool_call_failed event
 */
export function createToolCallFailedEvent(
  sessionId: string,
  sequence: number,
  toolCall: ToolCall,
  error: string,
  duration: number,
): ToolCallFailedEvent {
  return {
    id: generateEventId(),
    sessionId,
    type: "tool_call_failed",
    timestamp: now(),
    sequence,
    payload: { toolCall, error, duration },
  };
}

/**
 * Create a file_patch_proposed event
 */
export function createFilePatchProposedEvent(
  sessionId: string,
  sequence: number,
  file: string,
  patch: string,
  reason?: string,
): FilePatchProposedEvent {
  return {
    id: generateEventId(),
    sessionId,
    type: "file_patch_proposed",
    timestamp: now(),
    sequence,
    payload: { file, patch, reason },
  };
}

/**
 * Create a file_patch_applied event
 */
export function createFilePatchAppliedEvent(
  sessionId: string,
  sequence: number,
  file: string,
  patch: string,
  success: boolean,
): FilePatchAppliedEvent {
  return {
    id: generateEventId(),
    sessionId,
    type: "file_patch_applied",
    timestamp: now(),
    sequence,
    payload: { file, patch, success },
  };
}

/**
 * Create a compact_requested event
 */
export function createCompactRequestedEvent(
  sessionId: string,
  sequence: number,
  reason: string,
  eventCount: number,
): CompactRequestedEvent {
  return {
    id: generateEventId(),
    sessionId,
    type: "compact_requested",
    timestamp: now(),
    sequence,
    payload: { reason, eventCount },
  };
}

/**
 * Create a compact_completed event
 */
export function createCompactCompletedEvent(
  sessionId: string,
  sequence: number,
  originalEventCount: number,
  compactedEventCount: number,
  duration: number,
): CompactCompletedEvent {
  return {
    id: generateEventId(),
    sessionId,
    type: "compact_completed",
    timestamp: now(),
    sequence,
    payload: { originalEventCount, compactedEventCount, duration },
  };
}

/**
 * Create a compact_failed event
 */
export function createCompactFailedEvent(
  sessionId: string,
  sequence: number,
  reason: string,
  originalEventCount: number,
): CompactFailedEvent {
  return {
    id: generateEventId(),
    sessionId,
    type: "compact_failed",
    timestamp: now(),
    sequence,
    payload: { reason, originalEventCount },
  };
}

/**
 * Create a session_completed event
 */
export function createSessionCompletedEvent(
  sessionId: string,
  sequence: number,
  reason?: string,
  totalEvents?: number,
  duration?: number,
): SessionCompletedEvent {
  return {
    id: generateEventId(),
    sessionId,
    type: "session_completed",
    timestamp: now(),
    sequence,
    payload: { reason, totalEvents: totalEvents ?? 0, duration: duration ?? 0 },
  };
}

/**
 * Create an error event
 */
export function createErrorEvent(
  sessionId: string,
  sequence: number,
  code: string,
  message: string,
  recoverable: boolean,
  context?: Record<string, unknown>,
): ErrorEvent {
  return {
    id: generateEventId(),
    sessionId,
    type: "error",
    timestamp: now(),
    sequence,
    payload: { code, message, recoverable, context },
  };
}

/**
 * Create a plugin_hook_called event
 */
export function createPluginHookCalledEvent(
  sessionId: string,
  sequence: number,
  options: {
    hookEvent: string;
    hookName: string;
    pluginName: string;
    phase: "before" | "after";
    duration?: number;
    error?: string;
  },
): PluginHookCalledEvent {
  return {
    id: generateEventId(),
    sessionId,
    type: "plugin_hook_called",
    timestamp: now(),
    sequence,
    payload: {
      hookEvent: options.hookEvent,
      hookName: options.hookName,
      pluginName: options.pluginName,
      phase: options.phase,
      duration: options.duration,
      error: options.error,
    },
  };
}

/**
 * Get metadata from an event (non-payload fields)
 */
export function getEventMetadata(event: AgentEvent): EventMetadata {
  return {
    id: event.id,
    sessionId: event.sessionId,
    type: event.type,
    timestamp: event.timestamp,
    sequence: event.sequence,
  };
}

/**
 * Serialize an event to JSON string
 */
export function serializeEvent(event: AgentEvent): string {
  return JSON.stringify(event);
}

/**
 * Deserialize an event from JSON string
 */
export function deserializeEvent(json: string): AgentEvent {
  return JSON.parse(json) as AgentEvent;
}
