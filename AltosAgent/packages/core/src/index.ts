// @altos/core - Core types, interfaces, and utilities

export const VERSION = "0.1.0";

// Re-export all event types and factory functions
// Note: Only re-export types to avoid conflicts
export type {
  AgentEvent,
  AgentEventType,
  ModelConfig,
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
  SessionCompletedEvent,
  ErrorEvent,
  PluginHookCalledEvent,
  ToolCall,
  EventFilter,
  EventMetadata,
} from "./events/types.js";
export * from "./events/factory.js";

// Re-export session types (excluding ModelConfig to avoid conflict)
export { AgentSession, type SessionStatus, type SessionSummary } from "./session/session.js";
export { InMemoryEventStore, type EventStore } from "./store/index.js";

// Re-export runtime
export {
  AgentRuntime,
  type ToolDefinition,
  type ToolHandler,
  type ToolContext,
  type ToolResult,
  type PermissionHandler,
  type EventListener,
  type StreamingCallback,
  type RuntimeConfig,
  type ModelAdapter,
} from "./runtime/runtime.js";

// Re-export SubAgentManager
export {
  SubAgentManager,
  getSubAgentManager,
  setSubAgentManager,
} from "./runtime/subagent-manager.js";

// Re-export subagent types
export {
  type SubAgentDefinition,
  type SubAgentResult,
  type SubAgentArtifact,
  type SubAgentInstance,
  type SpawnOptions,
  type MemoryScope,
  type PermissionProfile,
  type ModelPreference,
} from "./types/subagent.js";

// Re-export adapters
export {
  FakeModelAdapter,
  FakeResponses,
  createFakeAdapter,
  type FakeModelResponse,
} from "./adapters/fake.js";

// Re-export context management
export * from "./context/index.js";

export interface AgentConfig {
  id: string;
  name: string;
  model?: string;
  provider?: string;
  plugins?: string[];
  skills?: string[];
  permissions?: Permission[];
}

export interface Permission {
  type: "read" | "write" | "execute" | "network";
  path?: string;
  pattern?: string;
  reason?: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

export function createLogger(name: string, level: LogLevel = "info"): Logger {
  const levels: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
  const currentLevel = levels[level];

  return {
    debug(msg, ...args) {
      if (currentLevel <= 0) console.debug(`[${name}]`, msg, ...args);
    },
    info(msg, ...args) {
      if (currentLevel <= 1) console.info(`[${name}]`, msg, ...args);
    },
    warn(msg, ...args) {
      if (currentLevel <= 2) console.warn(`[${name}]`, msg, ...args);
    },
    error(msg, ...args) {
      if (currentLevel <= 3) console.error(`[${name}]`, msg, ...args);
    },
  };
}

export function maskSecrets(input: string, patterns?: RegExp[]): string {
  const defaultPatterns = [
    /sk-[a-zA-Z0-9]{20,}/g,
    /ghp_[a-zA-Z0-9]{36}/g,
    /Bearer\s+[a-zA-Z0-9._-]+/g,
  ];
  const allPatterns = [...defaultPatterns, ...(patterns ?? [])];
  let result = input;
  for (const pattern of allPatterns) {
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}

// Aliases for backward compatibility
export { type AgentConfig as Config, type Message as AgentMessage };
