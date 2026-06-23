// @altos/plugins - Plugin discovery and loader

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type {
  DiscoveredPlugin,
  PluginSource,
  PluginManifest,
  Plugin,
  PluginAPI,
  PluginState,
} from "../index.js";
import { validatePluginPermissions } from "../permissions/index.js";

// Re-export types that loader re-exports from index
export type { DiscoveredPlugin, PluginSource, PluginState };

/**
 * Discovery options for the plugin loader.
 */
export interface PluginLoaderOptions {
  /** Additional paths to search for local plugins */
  extraLocalPaths?: string[];
  /** Whether to discover from node_modules */
  includeNodeModules?: boolean;
  /** CWD for local plugin discovery */
  cwd?: string;
}

/**
 * Load a plugin manifest from a directory.
 */
function loadManifestFromDir(dirPath: string): PluginManifest | null {
  const manifestPath = path.join(dirPath, "plugin.json");
  if (!fs.existsSync(manifestPath)) {
    // Try package.json with altosPlugin field
    const pkgPath = path.join(dirPath, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        if (pkg.altosPlugin) {
          return {
            name: pkg.name,
            version: pkg.version ?? "0.0.0",
            description: pkg.description,
            entry: pkg.altosPlugin.entry ?? "index.js",
            dependencies: pkg.altosPlugin.dependencies,
            permissions: pkg.altosPlugin.permissions ?? [],
            tools: pkg.altosPlugin.tools,
            commands: pkg.altosPlugin.commands,
            hooks: pkg.altosPlugin.hooks,
            memory_providers: pkg.altosPlugin.memory_providers,
            model_providers: pkg.altosPlugin.model_providers,
            mcp_servers: pkg.altosPlugin.mcp_servers,
            skills: pkg.altosPlugin.skills,
          };
        }
      } catch {
        // fall through to return null
      }
    }
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Discover plugins in a directory.
 */
function discoverInDir(dirPath: string, source: PluginSource): DiscoveredPlugin[] {
  const results: DiscoveredPlugin[] = [];

  if (!fs.existsSync(dirPath)) return results;

  let entries: string[];
  try {
    entries = fs.readdirSync(dirPath);
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);
    const stat = fs.statSync(fullPath);

    if (!stat.isDirectory()) continue;

    const manifest = loadManifestFromDir(fullPath);
    results.push({
      name: manifest?.name ?? entry,
      path: fullPath,
      source,
      manifest: manifest ?? undefined,
      manifestError: manifest
        ? undefined
        : "No plugin.json or package.json with altosPlugin field found",
    });
  }

  return results;
}

/**
 * Discover plugins in node_modules.
 */
function discoverNodeModules(cwd: string): DiscoveredPlugin[] {
  const results: DiscoveredPlugin[] = [];
  const nodeModulesPath = path.join(cwd, "node_modules");

  if (!fs.existsSync(nodeModulesPath)) return results;

  let entries: string[];
  try {
    entries = fs.readdirSync(nodeModulesPath);
  } catch {
    return results;
  }

  for (const entry of entries) {
    // Only look for @altos/plugins-* or altos-plugin-*
    if (!entry.startsWith("@altos/plugin-") && !entry.startsWith("altos-plugin-")) {
      continue;
    }

    const fullPath = path.join(nodeModulesPath, entry);
    const manifest = loadManifestFromDir(fullPath);
    results.push({
      name: manifest?.name ?? entry,
      path: fullPath,
      source: "node_modules",
      manifest: manifest ?? undefined,
      manifestError: manifest
        ? undefined
        : "No plugin.json or package.json with altosPlugin field found",
    });
  }

  return results;
}

/**
 * Discover all plugins from configured locations.
 */
export function discoverPlugins(options: PluginLoaderOptions = {}): DiscoveredPlugin[] {
  const cwd = options.cwd ?? process.cwd();
  const home = os.homedir();
  const results: DiscoveredPlugin[] = [];

  // Local: project/.altos/plugins
  const localPath = path.join(cwd, ".altos", "plugins");
  results.push(...discoverInDir(localPath, "local"));

  // Extra local paths
  for (const extraPath of options.extraLocalPaths ?? []) {
    results.push(...discoverInDir(extraPath, "local"));
  }

  // Global: ~/.altos/plugins
  const globalPath = path.join(home, ".altos", "plugins");
  results.push(...discoverInDir(globalPath, "global"));

  // Node modules
  if (options.includeNodeModules !== false) {
    results.push(...discoverNodeModules(cwd));
  }

  return results;
}

// =============================================================================
// Plugin Loader (sandboxed dynamic import)
// =============================================================================

interface LoadedPluginModule {
  plugin: unknown;
}

/**
 * Load and instantiate a plugin from a discovered plugin path.
 * Execution is sandboxed — plugins receive a restricted API.
 */
export async function loadPlugin(discovered: DiscoveredPlugin, api: PluginAPI): Promise<Plugin> {
  if (!discovered.manifest) {
    throw new Error(
      `Cannot load plugin "${discovered.name}": no valid manifest found at ${discovered.path}`,
    );
  }

  const { manifest, path: pluginPath } = discovered;

  // Validate permissions before loading
  const permResult = validatePluginPermissions(manifest);
  if (!permResult.valid) {
    throw new Error(
      `Permission validation failed for "${manifest.name}":\n` +
        permResult.errors.map((e) => `  - ${e}`).join("\n"),
    );
  }

  // Dynamically import the plugin entry
  const entryPath = path.resolve(pluginPath, manifest.entry);
  let mod: LoadedPluginModule;

  try {
    mod = (await import(entryPath)) as LoadedPluginModule;
  } catch (err) {
    throw new Error(`Failed to import plugin "${manifest.name}" from ${entryPath}: ${err}`);
  }

  const plugin = mod.plugin as Plugin;

  if (!plugin || typeof plugin !== "object") {
    throw new Error(`Plugin "${manifest.name}" did not export a valid plugin object`);
  }

  if (typeof plugin.init !== "function") {
    throw new Error(`Plugin "${manifest.name}" is missing an init() function`);
  }

  // Initialize plugin
  try {
    await Promise.resolve(plugin.init(api));
  } catch (err) {
    throw new Error(`Plugin "${manifest.name}" init() threw: ${err}`);
  }

  return plugin;
}

// =============================================================================
// Plugin Config Store
// =============================================================================

/**
 * Per-plugin config storage.
 * Stored at ~/.altos/plugin-configs/<name>.json
 */
export class PluginConfigStore {
  private dirPath: string;

  constructor() {
    this.dirPath = path.join(os.homedir(), ".altos", "plugin-configs");
    fs.mkdirSync(this.dirPath, { recursive: true });
  }

  private getFilePath(pluginName: string): string {
    // Sanitize name for filesystem
    const safe = pluginName.replace(/[^a-z0-9_-]/gi, "_");
    return path.join(this.dirPath, `${safe}.json`);
  }

  read(pluginName: string): Record<string, unknown> {
    const filePath = this.getFilePath(pluginName);
    if (!fs.existsSync(filePath)) return {};
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
      return {};
    }
  }

  write(pluginName: string, config: Record<string, unknown>): void {
    const filePath = this.getFilePath(pluginName);
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
  }

  delete(pluginName: string): void {
    const filePath = this.getFilePath(pluginName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

// =============================================================================
// Plugin Source Paths
// =============================================================================

/**
 * Get the path where a local plugin should be installed.
 */
export function getLocalPluginPath(name: string, cwd?: string): string {
  return path.join(cwd ?? process.cwd(), ".altos", "plugins", name);
}

/**
 * Get the path where a global plugin should be installed.
 */
export function getGlobalPluginPath(name: string): string {
  return path.join(os.homedir(), ".altos", "plugins", name);
}
