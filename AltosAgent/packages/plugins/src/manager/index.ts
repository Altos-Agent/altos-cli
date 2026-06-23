// @altos/plugins - Plugin lifecycle manager

import type {
  PluginAPI,
  PluginState,
  PluginHook,
  HookEventType,
  HookContext,
  DiscoveredPlugin,
  PluginCommandSpec,
  PluginMcpServerSpec,
  PluginSkillSpec,
  PermissionScope,
} from "../index.js";
import {
  loadPlugin,
  discoverPlugins,
  PluginConfigStore,
  type PluginLoaderOptions,
} from "../loader/index.js";
import { validatePluginPermissions, getPluginGrants } from "../permissions/index.js";
import type { ToolDefinition } from "@altos/tools";
import type { MemoryProvider } from "@altos/memory";
import { createLogger, type Logger } from "@altos/core";

// =============================================================================
// Hook Emitter — wires plugin hooks into the runtime event system
// =============================================================================

/**
 * HookEmitter manages all registered hooks and dispatches events.
 * Plugins register hooks; the runtime (or other callers) emit events.
 */
export class HookEmitter {
  private hooks: Map<HookEventType, PluginHook[]> = new Map();

  /**
   * Register a hook handler.
   */
  registerHook(hook: PluginHook): void {
    const existing = this.hooks.get(hook.event) ?? [];
    // Insert by priority
    const priority = hook.priority ?? 100;
    let inserted = false;
    for (let i = 0; i < existing.length; i++) {
      if ((existing[i].priority ?? 100) > priority) {
        existing.splice(i, 0, hook);
        inserted = true;
        break;
      }
    }
    if (!inserted) existing.push(hook);
    this.hooks.set(hook.event, existing);
  }

  /**
   * Unregister all hooks for a plugin.
   */
  unregisterPlugin(pluginName: string): void {
    for (const [event, handlers] of this.hooks.entries()) {
      const filtered = handlers.filter((h) => h.name.startsWith(pluginName + ":"));
      if (filtered.length > 0) {
        this.hooks.set(
          event,
          handlers.filter((h) => !h.name.startsWith(pluginName + ":")),
        );
      }
    }
  }

  /**
   * Emit a hook event to all registered handlers.
   * Errors are caught and logged — plugins never crash the runtime.
   */
  async emit(event: HookEventType, ctx: HookContext, logger?: Logger): Promise<void> {
    const handlers = this.hooks.get(event) ?? [];
    for (const hook of handlers) {
      if (ctx.stopPropagation) break;
      try {
        await Promise.resolve(hook.handler(ctx));
      } catch (err) {
        logger?.error(`[hook:${event}] Plugin hook "${hook.name}" threw:`, err);
        // Continue to next handler — plugin errors don't stop the runtime
      }
    }
  }

  /**
   * List all registered hooks (for debugging/CLI).
   */
  listHooks(): Array<{ event: HookEventType; name: string; priority: number }> {
    const result: Array<{ event: HookEventType; name: string; priority: number }> = [];
    for (const [event, handlers] of this.hooks.entries()) {
      for (const hook of handlers) {
        result.push({
          event,
          name: hook.name,
          priority: hook.priority ?? 100,
        });
      }
    }
    return result;
  }

  /**
   * Get hooks for a specific event.
   */
  getHooksForEvent(event: HookEventType): PluginHook[] {
    return this.hooks.get(event) ?? [];
  }
}

// =============================================================================
// Plugin Manager
// =============================================================================

/**
 * Manages plugin discovery, loading, lifecycle, and hook dispatch.
 */
export class PluginManager {
  private plugins: Map<string, PluginState> = new Map();
  private configStore: PluginConfigStore = new PluginConfigStore();
  private hookEmitter: HookEmitter = new HookEmitter();
  private logger: Logger;
  private toolRegistry: Map<string, ToolDefinition> = new Map();
  private commandRegistry: Map<string, PluginCommandSpec & { pluginName: string }> = new Map();
  private memoryProviders: Map<string, MemoryProvider> = new Map();
  private mcpServers: Map<string, PluginMcpServerSpec & { pluginName: string }> = new Map();
  private skillRegistry: Map<string, PluginSkillSpec & { pluginName: string }> = new Map();

  constructor(logger?: Logger) {
    this.logger = logger ?? createLogger("plugins", "info");
  }

  // ---------------------------------------------------------------------------
  // Discovery
  // ---------------------------------------------------------------------------

  /**
   * Discover available plugins from configured locations.
   */
  discover(options?: PluginLoaderOptions): DiscoveredPlugin[] {
    return discoverPlugins(options);
  }

  /**
   * Get all discovered plugins (loaded or not).
   */
  getDiscoveredPlugins(options?: PluginLoaderOptions): DiscoveredPlugin[] {
    return this.discover(options);
  }

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  /**
   * Load a plugin by name or path.
   * If it's a known discovered plugin, load it. Otherwise treat as path.
   */
  async loadPlugin(pluginIdentifier: string, options?: PluginLoaderOptions): Promise<PluginState> {
    const discovered = this.discover(options);
    const found = discovered.find(
      (d) => d.name === pluginIdentifier || d.path === pluginIdentifier,
    );

    if (!found) {
      throw new Error(
        `Plugin not found: "${pluginIdentifier}". Run 'altos plugin list' to see available plugins.`,
      );
    }

    return this.loadDiscovered(found);
  }

  /**
   * Load a discovered plugin.
   */
  async loadDiscovered(discovered: DiscoveredPlugin): Promise<PluginState> {
    const { name, manifest } = discovered;

    if (this.plugins.has(name)) {
      return this.plugins.get(name)!;
    }

    if (!manifest) {
      const state: PluginState = {
        name,
        version: "unknown",
        status: "failed",
        manifest: { name, version: "0.0.0", entry: "index.js" },
        error: discovered.manifestError ?? "No manifest found",
      };
      this.plugins.set(name, state);
      return state;
    }

    this.plugins.set(name, {
      name,
      version: manifest.version,
      description: manifest.description,
      status: "loading",
      manifest,
    });

    const api = this.createAPI(name, manifest);

    try {
      const plugin = await loadPlugin(discovered, api);
      const state: PluginState = {
        name,
        version: manifest.version,
        description: manifest.description,
        status: "loaded",
        manifest,
        instance: plugin,
        loadedAt: Date.now(),
      };
      this.plugins.set(name, state);
      this.logger.info(`Loaded plugin: ${name}@${manifest.version}`);
      return state;
    } catch (err) {
      const state: PluginState = {
        name,
        version: manifest.version,
        description: manifest.description,
        status: "failed",
        manifest,
        error: String(err),
      };
      this.plugins.set(name, state);
      this.logger.error(`Failed to load plugin ${name}:`, err);
      return state;
    }
  }

  /**
   * Create the restricted API passed to plugins.
   */
  private createAPI(
    pluginName: string,
    manifest: { permissions?: Array<{ scope: string }> },
  ): PluginAPI {
    const self = this;

    const api: PluginAPI = {
      registerTool(tool: ToolDefinition) {
        if (self.toolRegistry.has(tool.name)) {
          throw new Error(`Tool already registered: ${tool.name}`);
        }
        self.toolRegistry.set(tool.name, tool);
        self.logger.debug(`Plugin "${pluginName}" registered tool: ${tool.name}`);
      },

      registerCommand(spec: PluginCommandSpec) {
        if (self.commandRegistry.has(spec.name)) {
          throw new Error(`Command already registered: ${spec.name}`);
        }
        self.commandRegistry.set(spec.name, { ...spec, pluginName });
        self.logger.debug(`Plugin "${pluginName}" registered command: ${spec.name}`);
      },

      registerHook(hook: PluginHook) {
        const fullName = `${pluginName}:${hook.name}`;
        self.hookEmitter.registerHook({ ...hook, name: fullName });
        self.logger.debug(`Plugin "${pluginName}" registered hook: ${hook.event}:${hook.name}`);
      },

      registerMemoryProvider(provider: MemoryProvider) {
        if (self.memoryProviders.has(provider.id)) {
          throw new Error(`Memory provider already registered: ${provider.id}`);
        }
        self.memoryProviders.set(provider.id, provider);
        self.logger.debug(`Plugin "${pluginName}" registered memory provider: ${provider.id}`);
      },

      registerModelProvider(spec) {
        self.logger.debug(`Plugin "${pluginName}" registered model provider: ${spec.id}`);
      },

      registerMcpServer(spec: PluginMcpServerSpec) {
        if (self.mcpServers.has(spec.id)) {
          throw new Error(`MCP server already registered: ${spec.id}`);
        }
        self.mcpServers.set(spec.id, { ...spec, pluginName });
        self.logger.debug(`Plugin "${pluginName}" registered MCP server: ${spec.id}`);
      },

      registerSkill(skill: PluginSkillSpec) {
        if (self.skillRegistry.has(skill.name)) {
          throw new Error(`Skill already registered: ${skill.name}`);
        }
        self.skillRegistry.set(skill.name, { ...skill, pluginName });
        self.logger.debug(`Plugin "${pluginName}" registered skill: ${skill.name}`);
      },

      readConfig(key: string): unknown {
        return self.configStore.read(pluginName)[key];
      },

      writeConfig(key: string, value: unknown) {
        const config = self.configStore.read(pluginName);
        config[key] = value;
        self.configStore.write(pluginName, config);
      },

      deleteConfig(key: string) {
        const config = self.configStore.read(pluginName);
        delete config[key];
        self.configStore.write(pluginName, config);
      },

      getPermissions() {
        return (manifest.permissions ?? []) as import("../index.js").PluginPermission[];
      },

      hasPermission(scope: PermissionScope): boolean {
        const grants = getPluginGrants(pluginName);
        return grants.granted.some((g) => {
          if (g === scope) return true;
          if (g.endsWith(":*")) {
            const prefix = g.slice(0, -1);
            return scope.startsWith(prefix);
          }
          return false;
        });
      },

      logger: createLogger(`plugin:${pluginName}`, "debug"),
    };

    return api;
  }

  // ---------------------------------------------------------------------------
  // Unloading
  // ---------------------------------------------------------------------------

  /**
   * Unload a plugin by name.
   */
  async unloadPlugin(name: string): Promise<void> {
    const state = this.plugins.get(name);
    if (!state) return;

    if (state.instance) {
      try {
        await Promise.resolve(state.instance.dispose());
      } catch (err) {
        this.logger.error(`Plugin "${name}" dispose() threw:`, err);
      }
    }

    this.hookEmitter.unregisterPlugin(name);

    // Remove registered tools/commands/mcp/skills from registries
    // Note: we don't track which plugin registered which tool cleanly here.
    // Tools stay registered — a more complete impl would track ownership.
    void this.toolRegistry;

    for (const [cmdName] of this.commandRegistry) {
      const cmd = this.commandRegistry.get(cmdName)!;
      if (cmd.pluginName === name) {
        this.commandRegistry.delete(cmdName);
      }
    }

    for (const [skillName] of this.skillRegistry) {
      const skill = this.skillRegistry.get(skillName)!;
      if (skill.pluginName === name) {
        this.skillRegistry.delete(skillName);
      }
    }

    this.plugins.delete(name);
    this.logger.info(`Unloaded plugin: ${name}`);
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  getPlugin(name: string): PluginState | undefined {
    return this.plugins.get(name);
  }

  listPlugins(): PluginState[] {
    return [...this.plugins.values()];
  }

  listLoadedPlugins(): PluginState[] {
    return this.listPlugins().filter((p) => p.status === "loaded");
  }

  getHookEmitter(): HookEmitter {
    return this.hookEmitter;
  }

  getTools(): Map<string, ToolDefinition> {
    return this.toolRegistry;
  }

  getCommands(): Map<string, PluginCommandSpec & { pluginName: string }> {
    return this.commandRegistry;
  }

  getMemoryProviders(): Map<string, MemoryProvider> {
    return this.memoryProviders;
  }

  getMcpServers(): Map<string, PluginMcpServerSpec & { pluginName: string }> {
    return this.mcpServers;
  }

  getSkills(): Map<string, PluginSkillSpec & { pluginName: string }> {
    return this.skillRegistry;
  }

  // ---------------------------------------------------------------------------
  // Permission inspection
  // ---------------------------------------------------------------------------

  /**
   * Validate permissions for a plugin and return the result.
   */
  validatePermissions(name: string): import("../index.js").PermissionValidationResult | null {
    const state = this.plugins.get(name);
    if (!state?.manifest) return null;
    return validatePluginPermissions(state.manifest);
  }

  /**
   * Reload a plugin (unload + load).
   */
  async reloadPlugin(name: string, options?: PluginLoaderOptions): Promise<PluginState> {
    await this.unloadPlugin(name);
    return this.loadPlugin(name, options);
  }
}

// =============================================================================
// Factory
// =============================================================================

let globalPluginManager: PluginManager | null = null;

export function createPluginManager(logger?: Logger): PluginManager {
  return new PluginManager(logger);
}

export function getGlobalPluginManager(): PluginManager {
  if (!globalPluginManager) {
    globalPluginManager = createPluginManager();
  }
  return globalPluginManager;
}
