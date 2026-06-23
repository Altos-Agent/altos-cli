# AI Provider Layer Architecture

## Overview

The `@altos/ai` package provides a unified abstraction layer for interacting with multiple LLM providers. This design ensures Altos remains provider-agnostic, allowing users to switch between OpenAI, Anthropic, OpenRouter, and local models without changing core application code.

## Core Principles

1. **Provider Agnosticism**: Core logic never calls LLM APIs directly—only through the `ModelProvider` interface
2. **Capability Discovery**: Providers advertise supported features (tool calling, vision, reasoning)
3. **Unified Message Format**: Common message types work across all providers
4. **Usage Accounting**: All providers report token usage consistently
5. **Security First**: API keys never appear in logs; errors are sanitized

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Core / Plugins                       │
│                  (uses ModelProvider)                    │
└─────────────────────┬───────────────────────────────────┘
                      │ ChatOptions + Message[]
                      ▼
┌─────────────────────────────────────────────────────────┐
│                    ModelRegistry                         │
│  - Resolves model → provider                             │
│  - Manages default provider/model                        │
│  - Routes completeChat() / streamChat()                  │
└─────────────────────┬───────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┬──────────────┐
        ▼             ▼             ▼              ▼
┌─────────────┐ ┌───────────┐ ┌───────────┐ ┌──────────┐
│ OpenAI      │ │ Anthropic │ │ OpenRouter│ │  Local   │
│ Provider    │ │ Provider  │ │ Provider  │ │ Provider │
└─────────────┘ └───────────┘ └───────────┘ └──────────┘
```

## Interfaces

### ModelProvider

```typescript
interface ModelProvider {
  readonly id: string;                    // Unique provider identifier
  readonly name: string;                  // Human-readable name
  readonly supportsToolCalling: boolean;  // Tool/function calling support
  readonly supportsVision: boolean;       // Image input support
  readonly supportsReasoningEffort: boolean; // Thinking effort support
  readonly contextWindow: number;         // Max context size in tokens

  listModels(): ModelInfo[];
  completeChat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
  streamChat(messages: Message[], options?: ChatOptions): AsyncGenerator<StreamChunk>;
}
```

### Message Types

The unified message format supports four roles:

| Role | Description |
|------|-------------|
| `system` | System prompts and instructions |
| `user` | User messages |
| `assistant` | Assistant responses, may contain tool calls |
| `tool` | Tool execution results |

### Tool Calls

Tool calling uses the standard OpenAI function call format:

```typescript
interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
}
```

## Provider Adapters

### OpenAI Provider

- **API**: OpenAI Chat Completions API
- **Streaming**: SSE-based streaming
- **Authentication**: Bearer token via `OPENAI_API_KEY`
- **Base URL**: `https://api.openai.com/v1` (configurable)

### Anthropic Provider

- **API**: Anthropic Messages API
- **Streaming**: SSE-based streaming with content block deltas
- **Authentication**: `x-api-key` header via `ANTHROPIC_API_KEY`
- **Base URL**: `https://api.anthropic.com/v1` (configurable)
- **Notes**: Requires `anthropic-version` header; transforms messages for tool use

### OpenRouter Provider

- **API**: OpenAI-compatible Chat Completions API
- **Streaming**: SSE-based streaming
- **Authentication**: Bearer token via `OPENROUTER_API_KEY`
- **Base URL**: `https://openrouter.ai/api/v1` (configurable)
- **Notes**: Adds `HTTP-Referer` and `X-Title` headers for OpenRouter attribution

### Local Provider (Ollama)

- **API**: Ollama Chat API
- **Streaming**: NDJSON streaming
- **Authentication**: Optional (localhost typically unauthenticated)
- **Base URL**: `http://localhost:11434` (configurable)
- **Notes**: No tool calling support; filters system messages

## Usage Accounting

Each response includes usage statistics:

```typescript
interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheTokens?: number;    // Anthropic prompt caching
  estimatedCost?: number;  // USD
}
```

Cost estimation uses model-specific pricing:

```typescript
function calculateCost(usage: Usage, model: ModelInfo): number {
  const input = (usage.inputTokens / 1_000_000) * model.inputCostPer1M;
  const output = (usage.outputTokens / 1_000_000) * model.outputCostPer1M;
  const cache = usage.cacheTokens
    ? (usage.cacheTokens / 1_000_000) * model.inputCostPer1M * 0.1
    : 0;
  return input + output + cache;
}
```

## Configuration

### Environment Variables

| Variable | Provider | Purpose |
|----------|----------|---------|
| `OPENAI_API_KEY` | OpenAI | API authentication |
| `ANTHROPIC_API_KEY` | Anthropic | API authentication |
| `OPENROUTER_API_KEY` | OpenRouter | API authentication |

### Config File

Model registry can be configured via `~/.altos/config.json` or `project/.altos/config.json`:

```json
{
  "version": "0.1.0",
  "provider": "openai",
  "model": "gpt-4o",
  "providers": {
    "openai": {
      "apiKey": "${OPENAI_API_KEY}",
      "baseUrl": "https://api.openai.com/v1"
    }
  }
}
```

## Error Handling

All provider errors are wrapped in `ProviderError`:

```typescript
class ProviderError extends Error {
  constructor(
    message: string,
    public providerId: string,
    public statusCode?: number,
    public isRetryable: boolean = false
  ) {}

  toUserMessage(): string {
    // Returns sanitized message safe for display
    // e.g., "[openai] Invalid API key (HTTP 401)"
  }
}
```

### Error Sanitization

- API keys never appear in error messages
- Internal details (stack traces, request IDs) are not exposed
- HTTP status codes are included for debugging
- Retry hints are provided when applicable

## Security Considerations

1. **Key Protection**: API keys stored in environment variables, never in code or logs
2. **Key Sanitization**: `sanitizeApiKey()` masks keys in any error reporting
3. **Input Validation**: All messages are validated before sending to providers
4. **Error Messages**: User-facing errors contain no sensitive information
5. **Audit Trail**: Token usage is tracked for cost monitoring

## Usage Example

```typescript
import { getDefaultRegistry, listAvailableProviders } from "@altos/ai";

// List configured providers
const configured = listConfiguredProviders();

// Get the default registry
const registry = getDefaultRegistry();

// Complete a chat
const response = await registry.complete([
  { role: "system", content: "You are a helpful assistant." },
  { role: "user", content: "Hello!" },
]);

console.log(response.content);
console.log(`Cost: $${response.usage.estimatedCost?.toFixed(6)}`);

// Stream a chat
for await (const chunk of registry.stream([
  { role: "user", content: "Tell me a story." },
])) {
  if (chunk.type === "content") {
    process.stdout.write(chunk.content);
  }
}
```

## Testing

The `FakeProvider` enables testing without real API calls:

```typescript
const provider = new FakeProviderBuilder()
  .withDelay(100)
  .withResponses(["First response", "Second response"])
  .withModelResponse("fake-claude", "Claude specific")
  .build();

// Use like any other provider
const response = await provider.completeChat(messages);
```

## Future Enhancements

- [ ] Provider-specific retry logic with exponential backoff
- [ ] Rate limiting per provider
- [ ] Caching layer for repeated queries
- [ ] Provider fallback chains (primary → secondary)
- [ ] Model routing based on task complexity