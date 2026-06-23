// @altos/config - Configuration management

/**
 * Supported memory provider backends.
 * Defined here to avoid circular dependency with @altos/memory.
 */
export type MemoryProviderType = "local" | "hermes" | "memplace" | "codegraph";

export interface AltosConfig {
  version: string;
  model?: string;
  provider?: string;
  plugins?: string[];
  skills?: string[];
  permissions?: {
    allow?: string[];
    deny?: string[];
  };
  sandbox?: {
    enabled?: boolean;
    limits?: Record<string, unknown>;
  };
  telemetry?: {
    enabled?: boolean;
    endpoint?: string;
  };
  memory?: {
    /** Which memory provider to use */
    use?: MemoryProviderType;
    /** Additional provider-specific options */
    options?: Record<string, unknown>;
  };
  autoCompact?: {
    /** Enable automatic context compaction */
    enabled?: boolean;
    /** Soft compact threshold [0, 1] — voluntary compaction */
    softThreshold?: number;
    /** Hard compact threshold [0, 1] — forced compaction */
    hardThreshold?: number;
    /** Maximum tokens in summary after compaction */
    maxSummaryTokens?: number;
    /** Maximum context window size to use for budget calculation */
    maxContextTokens?: number;
  };
}

export interface ConfigSchema {
  validate(config: unknown): { valid: boolean; errors?: string[] };
  merge(base: AltosConfig, override: Partial<AltosConfig>): AltosConfig;
}

export class SimpleSchema implements ConfigSchema {
  validate(config: unknown): { valid: boolean; errors?: string[] } {
    if (!config || typeof config !== "object") {
      return { valid: false, errors: ["Config must be an object"] };
    }
    return { valid: true };
  }

  merge(base: AltosConfig, override: Partial<AltosConfig>): AltosConfig {
    return { ...base, ...override };
  }
}

export class ConfigLoader {
  constructor(private schema: ConfigSchema = new SimpleSchema()) {}

  load(_path: string): AltosConfig {
    // Placeholder - will load and parse JSON/YAML
    return { version: "0.1.0" };
  }

  save(_path: string, _config: AltosConfig): void {
    // Placeholder - will serialize and write
  }

  validate(config: unknown): { valid: boolean; errors?: string[] } {
    return this.schema.validate(config);
  }
}

export function createConfigLoader(): ConfigLoader {
  return new ConfigLoader();
}

export const DEFAULT_CONFIG: AltosConfig = {
  version: "0.1.0",
  sandbox: { enabled: true },
  telemetry: { enabled: false },
};
