// altos plugin CLI commands

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "os";
import {
  createPluginManager,
  discoverPlugins,
  validatePluginPermissions,
  getPluginGrants,
  grantPluginPermissions,
  denyPluginPermissions,
  revokePluginPermissions,
  getLocalPluginPath,
  getGlobalPluginPath,
  type DiscoveredPlugin,
  type PluginState,
  type PermissionScope,
} from "@altos/plugins";

export interface PluginCommandOptions {
  list?: boolean;
  add?: string;
  remove?: string;
  inspect?: string;
  create?: string;
  grant?: { name: string; scopes: PermissionScope[] };
  deny?: { name: string; scopes: PermissionScope[] };
  revoke?: string;
  json?: boolean;
}

async function copyDir(src: string, dest: string): Promise<void> {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules") continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

export async function runPluginCommand(
  cwd: string,
  options: PluginCommandOptions,
): Promise<number> {
  const manager = createPluginManager();

  // --- altos plugin list ---
  if (options.list) {
    return cmdList(manager, cwd, options.json);
  }

  // --- altos plugin add <path> ---
  if (options.add) {
    return cmdAdd(manager, cwd, options.add);
  }

  // --- altos plugin remove <name> ---
  if (options.remove) {
    return cmdRemove(manager, options.remove);
  }

  // --- altos plugin inspect <name> ---
  if (options.inspect) {
    return cmdInspect(manager, options.inspect, options.json);
  }

  // --- altos plugin grant <name> <scope> ---
  if (options.grant) {
    return cmdGrant(options.grant.name, options.grant.scopes);
  }

  // --- altos plugin deny <name> <scope> ---
  if (options.deny) {
    return cmdDeny(options.deny.name, options.deny.scopes);
  }

  // --- altos plugin revoke <name> ---
  if (options.revoke) {
    return cmdRevoke(options.revoke);
  }

  // --- altos plugin create <name> ---
  if (options.create) {
    return cmdCreate(cwd, options.create);
  }

  // Default: list
  return cmdList(manager, cwd, options.json);
}

// =============================================================================
// Commands
// =============================================================================

async function cmdList(
  manager: ReturnType<typeof createPluginManager>,
  cwd: string,
  asJson?: boolean,
): Promise<number> {
  const discovered = discoverPlugins({ cwd });
  const loaded = manager.listPlugins();

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          discovered: discovered.map((d) => ({
            name: d.name,
            source: d.source,
            path: d.path,
            version: d.manifest?.version,
            hasManifest: !!d.manifest,
          })),
          loaded: loaded.map((p) => ({
            name: p.name,
            version: p.version,
            status: p.status,
            loadedAt: p.loadedAt,
          })),
        },
        null,
        2,
      ),
    );
    return 0;
  }

  console.log("\n=== Discovered Plugins ===\n");
  if (discovered.length === 0) {
    console.log("  No plugins found.");
    console.log("\nInstall plugins to:");
    console.log("  Local:  <cwd>/.altos/plugins/");
    console.log("  Global: ~/.altos/plugins/");
    console.log("\nOr install via npm:");
    console.log("  npm install --save-dev @altos/plugin-<name>");
  } else {
    for (const d of discovered) {
      const loadedState = loaded.find((p) => p.name === d.name);
      const status = loadedState?.status ?? (d.manifest ? "discovered" : "error");
      const badge = statusBadge(status);
      console.log(
        `  ${badge} ${d.name.padEnd(30)} ${d.source.padEnd(10)} ${d.manifest?.version ?? "?"}`,
      );
    }
  }

  console.log("\n=== Loaded Plugins ===\n");
  if (loaded.length === 0) {
    console.log("  No plugins loaded.");
  } else {
    for (const p of loaded) {
      const badge = statusBadge(p.status);
      const loadedAt = p.loadedAt ? new Date(p.loadedAt).toLocaleString() : "—";
      console.log(`  ${badge} ${p.name.padEnd(30)} v${p.version}  loaded: ${loadedAt}`);
      if (p.error) {
        console.log(`         ERROR: ${p.error}`);
      }
    }
  }

  console.log();
  return 0;
}

async function cmdAdd(
  manager: ReturnType<typeof createPluginManager>,
  cwd: string,
  pluginPath: string,
): Promise<number> {
  // Resolve path
  const resolvedPath = path.isAbsolute(pluginPath) ? pluginPath : path.resolve(cwd, pluginPath);

  if (!fs.existsSync(resolvedPath)) {
    console.error(`Plugin path does not exist: ${resolvedPath}`);
    return 1;
  }

  // Determine destination: local or global
  let destPath: string;
  let sourceType: string;

  // Check if it looks like a global install
  const home = os.homedir();
  if (resolvedPath.startsWith(home)) {
    destPath = resolvedPath; // Already in home, use as-is
    sourceType = "global";
  } else {
    // Determine plugin name from path
    const name = path.basename(resolvedPath);
    const localPath = getLocalPluginPath(name, cwd);
    destPath = localPath;
    sourceType = "local";
  }

  // Copy if source != dest
  if (fs.statSync(resolvedPath).isDirectory() && resolvedPath !== destPath) {
    console.log(`Installing plugin to ${destPath}...`);
    await copyDir(resolvedPath, destPath);
  }

  // Discover and load
  const discovered = discoverPlugins({ cwd });
  const found = discovered.find((d) => d.path === resolvedPath || d.path === destPath);

  if (!found) {
    console.error(`No plugin manifest found at ${resolvedPath}`);
    console.error("Create a plugin.json or add 'altosPlugin' to package.json");
    return 1;
  }

  const state = await manager.loadDiscovered(found);

  if (state.status === "loaded") {
    console.log(`✓ Plugin loaded: ${state.name}@${state.version}`);
    return 0;
  } else {
    console.error(`✗ Failed to load plugin: ${state.error}`);
    return 1;
  }
}

async function cmdRemove(
  manager: ReturnType<typeof createPluginManager>,
  name: string,
): Promise<number> {
  await manager.unloadPlugin(name);

  // Also remove from local/global plugin dirs
  const localPath = getLocalPluginPath(name);
  const globalPath = getGlobalPluginPath(name);
  let removed = false;

  for (const p of [localPath, globalPath]) {
    if (fs.existsSync(p)) {
      fs.rmSync(p, { recursive: true });
      console.log(`Removed plugin from: ${p}`);
      removed = true;
    }
  }

  if (!removed) {
    console.log(`Plugin "${name}" unloaded (files not found).`);
  }

  return 0;
}

async function cmdInspect(
  manager: ReturnType<typeof createPluginManager>,
  name: string,
  asJson?: boolean,
): Promise<number> {
  const discovered = discoverPlugins({});
  const state = manager.getPlugin(name);
  const found = discovered.find((d) => d.name === name);

  const manifest = state?.manifest ?? found?.manifest;
  if (!manifest) {
    console.error(`Plugin not found: ${name}`);
    return 1;
  }

  const permResult = validatePluginPermissions(manifest);
  const grants = getPluginGrants(name);

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          name: manifest.name,
          version: manifest.version,
          description: manifest.description,
          entry: manifest.entry,
          source: found?.source,
          path: found?.path,
          status: state?.status,
          permissions: manifest.permissions,
          grantedPermissions: grants.granted,
          deniedPermissions: grants.denied,
          autoGranted: permResult.granted,
          validation: {
            valid: permResult.valid,
            errors: permResult.errors,
            warnings: permResult.warnings,
          },
          tools: manifest.tools?.map((t) => t.name),
          commands: manifest.commands?.map((c) => c.name),
          hooks: manifest.hooks?.map((h) => h.event),
          memory_providers: manifest.memory_providers?.map((m) => m.id),
          model_providers: manifest.model_providers?.map((m) => m.id),
          mcp_servers: manifest.mcp_servers?.map((m) => m.id),
          skills: manifest.skills?.map((s) => s.name),
        },
        null,
        2,
      ),
    );
    return 0;
  }

  console.log(`\n=== Plugin: ${manifest.name} ===\n`);
  console.log(`Version:     ${manifest.version}`);
  console.log(`Description: ${manifest.description ?? "—"}`);
  console.log(`Entry:       ${manifest.entry}`);
  console.log(`Source:      ${found?.source ?? "unknown"}`);
  console.log(`Status:      ${state?.status ?? "not loaded"}`);

  console.log("\n--- Permissions ---");
  if (!manifest.permissions || manifest.permissions.length === 0) {
    console.log("  (none declared)");
  } else {
    for (const perm of manifest.permissions) {
      const granted = permResult.granted.includes(perm.scope);
      const denied = permResult.denied.includes(perm.scope);
      const badge = granted ? "✓" : denied ? "✗" : "?";
      console.log(`  ${badge} ${perm.scope}${perm.reason ? ` — ${perm.reason}` : ""}`);
    }
  }

  if (grants.granted.length > 0) {
    console.log("\n--- User Granted ---");
    for (const s of grants.granted) console.log(`  + ${s}`);
  }

  if (grants.denied.length > 0) {
    console.log("\n--- User Denied ---");
    for (const s of grants.denied) console.log(`  - ${s}`);
  }

  if (permResult.warnings.length > 0) {
    console.log("\n--- Warnings ---");
    for (const w of permResult.warnings) console.log(`  ⚠ ${w}`);
  }

  if (!permResult.valid) {
    console.log("\n--- Errors ---");
    for (const e of permResult.errors) console.log(`  ✗ ${e}`);
  }

  if (manifest.tools?.length) {
    console.log("\n--- Tools ---");
    for (const t of manifest.tools)
      console.log(`  • ${t.name}${t.description ? `: ${t.description}` : ""}`);
  }

  if (manifest.commands?.length) {
    console.log("\n--- Commands ---");
    for (const c of manifest.commands)
      console.log(`  • ${c.name}${c.description ? `: ${c.description}` : ""}`);
  }

  if (manifest.hooks?.length) {
    console.log("\n--- Hooks ---");
    for (const h of manifest.hooks) console.log(`  • ${h.event}`);
  }

  console.log();
  return 0;
}

async function cmdGrant(name: string, scopes: PermissionScope[]): Promise<number> {
  grantPluginPermissions(name, scopes);
  console.log(`Granted: ${scopes.join(", ")} to plugin "${name}"`);
  return 0;
}

async function cmdDeny(name: string, scopes: PermissionScope[]): Promise<number> {
  denyPluginPermissions(name, scopes);
  console.log(`Denied: ${scopes.join(", ")} to plugin "${name}"`);
  return 0;
}

async function cmdRevoke(name: string): Promise<number> {
  revokePluginPermissions(name);
  console.log(`Revoked all permissions for plugin "${name}"`);
  return 0;
}

// =============================================================================
// altos plugin create <name>
// =============================================================================

async function cmdCreate(cwd: string, name: string): Promise<number> {
  // Validate name
  if (!/^[a-z0-9-]+$/.test(name)) {
    console.error("Plugin name must be lowercase alphanumeric with hyphens only (e.g. my-plugin).");
    return 1;
  }

  const templateDir = path.join(__dirname, "..", "..", "..", "templates", "plugin-template");
  if (!fs.existsSync(templateDir)) {
    console.error(`Plugin template not found at: ${templateDir}`);
    return 1;
  }

  // Install globally by default
  const destDir = getGlobalPluginPath(name);
  if (fs.existsSync(destDir)) {
    console.error(`Plugin already exists at: ${destDir}`);
    console.error("Remove it first with: altos plugin remove " + name);
    return 1;
  }

  fs.mkdirSync(destDir, { recursive: true });

  // Copy template, substituting placeholders
  await copyTemplateDir(templateDir, destDir, name);

  console.log(`✓ Created plugin: ${name}`);
  console.log(`  → ${destDir}`);
  console.log("\nNext steps:");
  console.log("  cd " + destDir);
  console.log("  pnpm install");
  console.log("  pnpm build");
  console.log("  altos plugin add " + destDir);
  console.log("\nOr for local development:");
  console.log("  altos plugin add .");
  return 0;
}

async function copyTemplateDir(src: string, dest: string, name: string): Promise<void> {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules") continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyTemplateDir(srcPath, destPath, name);
    } else {
      let content = fs.readFileSync(srcPath, "utf-8");
      // Substitute template placeholders
      content = content.replace(/\{\{name\}\}/g, name);
      content = content.replace(
        /\{\{description\}\}/g,
        `Plugin: ${name} — TODO: describe what this plugin does`,
      );
      fs.writeFileSync(destPath, content);
    }
  }
}

// =============================================================================
// Helpers
// =============================================================================

function statusBadge(status: string): string {
  switch (status) {
    case "loaded":
      return "\x1b[32m[OK  ]\x1b[0m";
    case "failed":
      return "\x1b[31m[ERR ]\x1b[0m";
    case "loading":
      return "\x1b[33m[LOAD]\x1b[0m";
    case "discovered":
      return "\x1b[36m[Disc]\x1b[0m";
    default:
      return "\x1b[90m[----]\x1b[0m";
  }
}
