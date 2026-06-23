// @altos/ai - Message types re-export

export type {
  Message,
  MessageRole,
  SystemMessage,
  UserMessage,
  AssistantMessage,
  ToolMessage,
  ToolCall,
  ToolCallFunction,
  ToolDefinition,
  ToolParameterProperty,
} from "../index.js";

export {
  isSystemMessage,
  isUserMessage,
  isAssistantMessage,
  isToolMessage,
} from "../index.js";
