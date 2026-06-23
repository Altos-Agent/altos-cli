// @altos/ai - Provider registry and config integration

import type {
  ChatOptions,
  ChatResponse,
  Message,
  ModelInfo,
  ModelProvider,
  ProviderConfig,
  StreamChunk,
} from "./index.js";
import { ProviderError } from "./providers/error.js";
import { OpenAIProvider } from "./providers/openai.js";
import { AnthropicProvider } from "./providers/anthropic.js";
import { OpenRouterProvider } from "./providers/openrouter.js";
import { LocalProvider } from "./providers/local.js";

// ============================================================================
// Environment Variables
// ============================================================================

export const ENV_API_KEYS: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

export function getApiKeyFromEnv(providerId: string): string | undefined {
  const envVar = ENV_API_KEYS[providerId];
  if (!envVar) return undefined;
  return process.env[envVar];
}

export function hasApiKey(providerId: string): boolean {
  return !!getApiKeyFromEnv(providerId);
}

export function listConfiguredProviders(): string[] {
  return Object.entries(ENV_API_KEYS)
    .filter(([_, envVar]) => !!process.env[envVar])
    .map(([id]) => id);
}

export function listAvailableProviders(): string[] {
  return Object.keys(ENV_API_KEYS);
}

// ============================================================================
// Provider Factory
// ============================================================================

export type ProviderType = "openai" | "anthropic" | "openrouter" | "local";

export function createProvider(
  type: ProviderType,
  apiKey?: string,
  baseUrl?: string,
): ModelProvider {
  switch (type) {
    case "openai":
      return new OpenAIProvider(apiKey ?? getApiKeyFromEnv("openai"), baseUrl);
    case "anthropic":
      return new AnthropicProvider(apiKey ?? getApiKeyFromEnv("anthropic"), baseUrl);
    case "openrouter":
      return new OpenRouterProvider(apiKey ?? getApiKeyFromEnv("openrouter"), baseUrl);
    case "local":
      return new LocalProvider(apiKey, baseUrl);
    default:
      throw new Error(`Unknown provider type: ${type}`);
  }
}

// ============================================================================
// Model Registry
// ============================================================================

export interface ModelRegistryConfig {
  defaultProvider?: string;
  defaultModel?: string;
  providers?: ProviderConfig[];
}

export class ModelRegistry {
  private providers = new Map<string, ModelProvider>();
  private configs = new Map<string, ProviderConfig>();
  private defaultProvider = "openai";
  private defaultModel = "gpt-4o";

  constructor(config?: ModelRegistryConfig) {
    if (config?.defaultProvider) this.defaultProvider = config.defaultProvider;
    if (config?.defaultModel) this.defaultModel = config.defaultModel;
    if (config?.providers) {
      for (const pc of config.providers) {
        this.registerConfig(pc);
        const provider = createProvider(
          pc.id as ProviderType,
          pc.apiKey ?? getApiKeyFromEnv(pc.id),
          pc.baseUrl,
        );
        this.providers.set(pc.id, provider);
      }
    }
  }

  registerConfig(config: ProviderConfig): void {
    this.configs.set(config.id, config);
  }

  registerProvider(provider: ModelProvider): void {
    this.providers.set(provider.id, provider);
  }

  getProvider(id: string): ModelProvider | undefined {
    return this.providers.get(id);
  }

  listProviders(): ModelProvider[] {
    return Array.from(this.providers.values());
  }

  listAllModels(): ModelInfo[] {
    const models: ModelInfo[] = [];
    for (const provider of this.providers.values()) {
      models.push(...provider.listModels());
    }
    return models;
  }

  getModel(providerId: string, modelId: string): ModelInfo | undefined {
    const provider = this.providers.get(providerId);
    return provider?.listModels().find((m) => m.id === modelId);
  }

  resolveModel(modelId: string): { provider: ModelProvider; model: ModelInfo } | undefined {
    // First try exact match
    for (const provider of this.providers.values()) {
      const model = provider.listModels().find((m) => m.id === modelId);
      if (model) return { provider, model };
    }

    // Try provider prefix (e.g., "openai/gpt-4o")
    if (modelId.includes("/")) {
      const [providerId, id] = modelId.split("/");
      const provider = this.providers.get(providerId);
      if (provider) {
        const model = provider.listModels().find((m) => m.id === modelId || m.id === id);
        if (model) return { provider, model };
      }
    }

    // Try to find by model name across all providers
    for (const provider of this.providers.values()) {
      const model = provider
        .listModels()
        .find((m) => m.name.toLowerCase() === modelId.toLowerCase());
      if (model) return { provider, model };
    }

    return undefined;
  }

  getDefaultProvider(): ModelProvider {
    const provider = this.providers.get(this.defaultProvider);
    if (!provider) {
      throw new Error(`Default provider "${this.defaultProvider}" not registered`);
    }
    return provider;
  }

  getDefaultModel(): ModelInfo | undefined {
    const resolved = this.resolveModel(this.defaultModel);
    return resolved?.model;
  }

  setDefaultProvider(providerId: string): void {
    if (!this.providers.has(providerId)) {
      throw new Error(`Provider "${providerId}" not registered`);
    }
    this.defaultProvider = providerId;
  }

  setDefaultModel(modelId: string): void {
    const resolved = this.resolveModel(modelId);
    if (!resolved) {
      throw new Error(`Model "${modelId}" not found in any provider`);
    }
    this.defaultModel = modelId;
    this.defaultProvider = resolved.provider.id;
  }

  // Helper to complete chat with default provider/model
  async complete(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    const model = options?.model ?? this.defaultModel;
    const resolved = this.resolveModel(model);

    if (!resolved) {
      return {
        content: "",
        model,
        finishReason: "error",
        usage: { inputTokens: 0, outputTokens: 0 },
        error: `Model "${model}" not found in any registered provider`,
      };
    }

    try {
      return await resolved.provider.completeChat(messages, {
        ...options,
        model: resolved.model.id,
      });
    } catch (err) {
      if (err instanceof ProviderError) {
        return {
          content: "",
          model: resolved.model.id,
          finishReason: "error",
          usage: { inputTokens: 0, outputTokens: 0 },
          error: err.toUserMessage(),
        };
      }
      throw err;
    }
  }

  // Helper to stream chat with default provider/model
  async *stream(
    messages: Message[],
    options?: ChatOptions,
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const model = options?.model ?? this.defaultModel;
    const resolved = this.resolveModel(model);

    if (!resolved) {
      yield { type: "content", content: "" };
      yield { type: "done", finishReason: "error" };
      return;
    }

    try {
      yield* resolved.provider.streamChat(messages, {
        ...options,
        model: resolved.model.id,
      });
    } catch (err) {
      if (err instanceof ProviderError) {
        yield { type: "content", content: "" };
        yield { type: "done", finishReason: "error" };
      } else {
        throw err;
      }
    }
  }
}

// ============================================================================
// Default Registry (lazy initialized)
// ============================================================================

let defaultRegistry: ModelRegistry | undefined;

export function getDefaultRegistry(): ModelRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new ModelRegistry();
    // Register all built-in providers
    for (const type of ["openai", "anthropic", "openrouter", "local"] as const) {
      try {
        const provider = createProvider(type);
        defaultRegistry.registerProvider(provider);
      } catch {
        // Skip providers that fail to initialize
      }
    }
  }
  return defaultRegistry;
}

export function resetDefaultRegistry(): void {
  defaultRegistry = undefined;
}
