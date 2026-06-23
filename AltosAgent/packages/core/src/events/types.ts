// @altos/core - Event types for the Altos runtime

/**
 * Model configuration for the agent
 */
export interface ModelConfig {
  model?: string;
  provider?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * All event types in the Altos event system.
 * Events are immutable, append-only records of all state changes.
 */
export type AgentEventType =
  | "session_started"
  | "user_message"
  | "assistant_message"
  | "assistant_delta"
  | "tool_call_requested"
  | "permission_requested"
  | "permission_granted"
  | "permission_denied"
  | "tool_call_started"
  | "tool_call_completed"
  | "tool_call_failed"
  | "file_patch_proposed"
  | "file_patch_applied"
  | "compact_requested"
  | "compact_completed"
  | "compact_failed"
  | "session_completed"
  | "error"
  | "plugin_hook_called";

/**
 * Base interface for all events.
 * All events include timing and session context.
 */
export interface BaseEvent {
  id: string;
  sessionId: string;
  type: AgentEventType;
  timestamp: number;
  sequence: number;
}

export interface SessionStartedEvent extends BaseEvent {
  type: "session_started";
  payload: {
    model?: string;
    provider?: string;
    cwd: string;
  };
}

export interface UserMessageEvent extends BaseEvent {
  type: "user_message";
  payload: {
    content: string;
    attachments?: string[];
  };
}

export interface AssistantMessageEvent extends BaseEvent {
  type: "assistant_message";
  payload: {
    content: string;
    toolCalls?: ToolCall[];
  };
}

export interface AssistantDeltaEvent extends BaseEvent {
  type: "assistant_delta";
  payload: {
    delta: string;
    isComplete: boolean;
  };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolCallRequestedEvent extends BaseEvent {
  type: "tool_call_requested";
  payload: {
    toolCall: ToolCall;
  };
}

export interface PermissionRequestedEvent extends BaseEvent {
  type: "permission_requested";
  payload: {
    permission: string;
    reason?: string;
    toolCallId: string;
  };
}

export interface PermissionGrantedEvent extends BaseEvent {
  type: "permission_granted";
  payload: {
    permission: string;
    toolCallId: string;
  };
}

export interface PermissionDeniedEvent extends BaseEvent {
  type: "permission_denied";
  payload: {
    permission: string;
    toolCallId: string;
    reason?: string;
  };
}

export interface ToolCallStartedEvent extends BaseEvent {
  type: "tool_call_started";
  payload: {
    toolCall: ToolCall;
  };
}

export interface ToolCallCompletedEvent extends BaseEvent {
  type: "tool_call_completed";
  payload: {
    toolCall: ToolCall;
    result: {
      success: boolean;
      data?: unknown;
      error?: string;
      duration: number;
    };
  };
}

export interface ToolCallFailedEvent extends BaseEvent {
  type: "tool_call_failed";
  payload: {
    toolCall: ToolCall;
    error: string;
    duration: number;
  };
}

export interface FilePatchProposedEvent extends BaseEvent {
  type: "file_patch_proposed";
  payload: {
    file: string;
    patch: string;
    reason?: string;
  };
}

export interface FilePatchAppliedEvent extends BaseEvent {
  type: "file_patch_applied";
  payload: {
    file: string;
    patch: string;
    success: boolean;
  };
}

export interface CompactRequestedEvent extends BaseEvent {
  type: "compact_requested";
  payload: {
    reason: string;
    eventCount: number;
  };
}

export interface CompactCompletedEvent extends BaseEvent {
  type: "compact_completed";
  payload: {
    originalEventCount: number;
    compactedEventCount: number;
    duration: number;
  };
}

export interface CompactFailedEvent extends BaseEvent {
  type: "compact_failed";
  payload: {
    reason: string;
    originalEventCount: number;
  };
}

export interface SessionCompletedEvent extends BaseEvent {
  type: "session_completed";
  payload: {
    reason?: string;
    totalEvents: number;
    duration: number;
  };
}

export interface ErrorEvent extends BaseEvent {
  type: "error";
  payload: {
    code: string;
    message: string;
    recoverable: boolean;
    context?: Record<string, unknown>;
  };
}

/**
 * Plugin hook lifecycle event — emitted before/after each hook is called.
 * Used by the plugin system to track hook execution.
 */
export interface PluginHookCalledEvent extends BaseEvent {
  type: "plugin_hook_called";
  payload: {
    hookEvent: string;
    hookName: string;
    pluginName: string;
    phase: "before" | "after";
    duration?: number;
    error?: string;
  };
}

/**
 * Union type of all possible events
 */
export type AgentEvent =
  | SessionStartedEvent
  | UserMessageEvent
  | AssistantMessageEvent
  | AssistantDeltaEvent
  | ToolCallRequestedEvent
  | PermissionRequestedEvent
  | PermissionGrantedEvent
  | PermissionDeniedEvent
  | ToolCallStartedEvent
  | ToolCallCompletedEvent
  | ToolCallFailedEvent
  | FilePatchProposedEvent
  | FilePatchAppliedEvent
  | CompactRequestedEvent
  | CompactCompletedEvent
  | CompactFailedEvent
  | SessionCompletedEvent
  | ErrorEvent
  | PluginHookCalledEvent;

/**
 * Event filter for querying events
 */
export interface EventFilter {
  sessionId?: string;
  types?: AgentEventType[];
  after?: number;
  before?: number;
  limit?: number;
}

/**
 * Event metadata (non-payload data about an event)
 */
export interface EventMetadata {
  id: string;
  sessionId: string;
  type: AgentEventType;
  timestamp: number;
  sequence: number;
}
