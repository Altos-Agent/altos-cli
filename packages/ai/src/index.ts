// @altos/ai - AI abstraction layer - Model provider interfaces and common types

// ============================================================================
// Model Information
// ============================================================================

export interface ModelInfo {
  id: string;
  name: string;
  providerId: string;
  contextWindow: number;
  supportsToolCalling: boolean;
  supportsVision: boolean;
  supportsReasoningEffort: boolean;
  inputCostPer1M?: number; // USD per 1M tokens
  outputCostPer1M?: number; // USD per 1M tokens
}

// ============================================================================
// Common Message Format
// ============================================================================

export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface Message {
  role: MessageRole;
  content: string;
  name?: string; // For tool messages - identifies the tool
  toolCallId?: string; // For tool call messages
  toolName?: string; // For tool result messages
}

export interface SystemMessage extends Message {
  role: "system";
}

export interface UserMessage extends Message {
  role: "user";
}

export interface AssistantMessage extends Message {
  role: "assistant";
  toolCalls?: ToolCall[];
}

export interface ToolMessage extends Message {
  role: "tool";
  toolCallId: string;
  toolName: string;
}

export function isSystemMessage(msg: Message): msg is SystemMessage {
  return msg.role === "system";
}

export function isUserMessage(msg: Message): msg is UserMessage {
  return msg.role === "user";
}

export function isAssistantMessage(msg: Message): msg is AssistantMessage {
  return msg.role === "assistant";
}

export function isToolMessage(msg: Message): msg is ToolMessage {
  return msg.role === "tool";
}

// ============================================================================
// Tool Call Format
// ============================================================================

export interface ToolCallFunction {
  name: string;
  arguments: string; // JSON string of arguments
}

export interface ToolCall {
  id: string;
  type: "function";
  function: ToolCallFunction;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ToolParameterProperty>;
    required?: string[];
  };
}

export interface ToolParameterProperty {
  type: "string" | "number" | "boolean" | "object" | "array";
  description?: string;
  enum?: string[];
}

// ============================================================================
// Usage Accounting
// ============================================================================

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheTokens?: number; // Cached tokens (for supported providers)
  estimatedCost?: number; // USD estimated cost
}

export function calculateCost(usage: Usage, model: ModelInfo): number {
  const inputCost = (usage.inputTokens / 1_000_000) * (model.inputCostPer1M ?? 0);
  const outputCost = (usage.outputTokens / 1_000_000) * (model.outputCostPer1M ?? 0);
  const cacheCost = usage.cacheTokens
    ? (usage.cacheTokens / 1_000_000) * (model.inputCostPer1M ?? 0) * 0.1 // Cache is 10% of input
    : 0;
  return inputCost + outputCost + cacheCost;
}

// ============================================================================
// Chat Options
// ============================================================================

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
  reasoningEffort?: "low" | "medium" | "high"; // For reasoning models
  stream?: boolean;
}

export interface StreamChunk {
  type: "content" | "toolCall" | "usage" | "done";
  content?: string;
  toolCall?: ToolCall;
  usage?: Usage;
  finishReason?: string;
}

// ============================================================================
// Model Provider Interface
// ============================================================================

export interface ModelProvider {
  // Provider identity
  readonly id: string;
  readonly name: string;

  // Capabilities
  readonly supportsToolCalling: boolean;
  readonly supportsVision: boolean;
  readonly supportsReasoningEffort: boolean;
  readonly contextWindow: number;

  // Model listing
  listModels(): ModelInfo[];

  // Chat operations
  completeChat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
  streamChat(
    messages: Message[],
    options?: ChatOptions,
  ): AsyncGenerator<StreamChunk, void, unknown>;
}

export interface ChatResponse {
  content: string;
  model: string;
  finishReason: "stop" | "length" | "content_filter" | "tool_use" | "error";
  usage: Usage;
  toolCalls?: ToolCall[];
  error?: string;
}

// ============================================================================
// Provider Errors
// ============================================================================

export { ProviderError, isProviderError } from "./providers/error.js";
export type { ProviderError as ProviderErrorClass } from "./providers/error.js";

// ============================================================================
// Prompt Template
// ============================================================================

export interface PromptTemplate {
  name: string;
  system?: string;
  user?: string;
  render(variables: Record<string, string>): { system?: string; user: string };
}

// ============================================================================
// Provider Registry
// ============================================================================

export interface ProviderConfig {
  id: string;
  name: string;
  apiKey?: string;
  baseUrl?: string;
  envVar?: string; // Environment variable to load API key from
  defaultModel?: string;
  models: ModelInfo[];
}

// Re-export registry utilities
export {
  ModelRegistry,
  getDefaultRegistry,
  resetDefaultRegistry,
  createProvider,
  getApiKeyFromEnv,
  hasApiKey,
  listConfiguredProviders,
  listAvailableProviders,
  ENV_API_KEYS,
  type ProviderType,
  type ModelRegistryConfig,
} from "./registry.js";

export {
  OpenAIProvider,
  AnthropicProvider,
  OpenRouterProvider,
  LocalProvider,
  FakeProvider,
  FakeProviderBuilder,
  BaseProvider,
} from "./providers/index.js";
