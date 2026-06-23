// altos package CLI commands

import * as fs from "node:fs";
import * as path from "node:path";
import {
  loadAllPackages,
  findPackage,
  installPackage,
  removePackage,
  type LoadedPackage,
  getLocalPackagesDir,
  getGlobalPackagesDir,
  getInstalledPackagesDir,
} from "@altos/packages/loader";

export interface PackageCommandOptions {
  list?: boolean;
  add?: string;
  remove?: string;
  inspect?: string;
  create?: string;
  cwd?: string;
  json?: boolean;
}

export async function runPackageCommand(
  cwd: string,
  options: PackageCommandOptions,
): Promise<number> {
  if (options.create) {
    return cmdCreate(cwd, options.create);
  }
  if (options.add) {
    return cmdAdd(cwd, options.add);
  }
  if (options.remove) {
    return cmdRemove(options.remove);
  }
  if (options.inspect) {
    return cmdInspect(options.inspect, options.json);
  }
  // Default: list
  return cmdList(cwd, options.json);
}

// =============================================================================
// altos package list
// =============================================================================

async function cmdList(cwd: string, asJson?: boolean): Promise<number> {
  const packages = loadAllPackages({ cwd });

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          packages: packages.map((p) => ({
            name: p.manifest.name,
            version: p.manifest.version,
            description: p.manifest.description,
            source: p.source,
            plugins: p.manifest.plugins?.length ?? 0,
            skills: p.manifest.skills?.length ?? 0,
            prompts: p.manifest.prompts?.length ?? 0,
          })),
          total: packages.length,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  console.log("\n=== Altos Packages ===\n");
  if (packages.length === 0) {
    console.log("  No packages found.");
    console.log("\nAdd packages to:");
    console.log("  Local:     " + getLocalPackagesDir(cwd));
    console.log("  Global:    " + getGlobalPackagesDir());
    console.log("  Installed: " + getInstalledPackagesDir());
    console.log("\nOr install one:");
    console.log("  altos package add <path|git-url|npm-name>");
    console.log("  altos create package <name>");
  } else {
    for (const p of packages) {
      const counts = [
        p.manifest.plugins?.length ? `${p.manifest.plugins.length} plugins` : null,
        p.manifest.skills?.length ? `${p.manifest.skills.length} skills` : null,
        p.manifest.prompts?.length ? `${p.manifest.prompts.length} prompts` : null,
      ]
        .filter(Boolean)
        .join(", ");
      console.log(
        `  ${p.manifest.name.padEnd(30)} v${p.manifest.version.padEnd(10)} ${p.source.padEnd(10)} ${counts || "—"}`,
      );
      if (p.manifest.description) {
        console.log(`    ${p.manifest.description}`);
      }
    }
  }
  console.log();
  return 0;
}

// =============================================================================
// altos package add <source>
// =============================================================================

async function cmdAdd(cwd: string, source: string): Promise<number> {
  const installed = await installPackage(source, { cwd });

  if (!installed) {
    console.error(`Failed to install package from: ${source}`);
    console.error("Supported sources:");
    console.error("  Local path:  /path/to/package");
    console.error("  Git URL:     https://github.com/user/repo");
    console.error("  NPM name:    @org/package-name");
    return 1;
  }

  console.log(`✓ Package installed: ${installed.manifest.name}@${installed.manifest.version}`);
  console.log(`  → ${installed.path}`);
  return 0;
}

// =============================================================================
// altos package remove <name>
// =============================================================================

async function cmdRemove(name: string): Promise<number> {
  const removed = removePackage(name);
  if (removed) {
    console.log(`Package removed: ${name}`);
    return 0;
  } else {
    console.error(`Package not found: ${name}`);
    return 1;
  }
}

// =============================================================================
// altos package inspect <name>
// =============================================================================

async function cmdInspect(name: string, asJson?: boolean): Promise<number> {
  const pkg = findPackage(name, {});

  if (!pkg) {
    console.error(`Package not found: ${name}`);
    console.error("\nSearch in:");
    console.error("  Local:     " + getLocalPackagesDir(process.cwd()));
    console.error("  Global:    " + getGlobalPackagesDir());
    console.error("  Installed: " + getInstalledPackagesDir());
    return 1;
  }

  if (asJson) {
    console.log(JSON.stringify(pkg.manifest, null, 2));
    return 0;
  }

  const m = pkg.manifest;
  console.log(`\n=== Package: ${m.name} ===\n`);
  console.log(`Version:     ${m.version}`);
  console.log(`Description: ${m.description ?? "—"}`);
  if (m.author) console.log(`Author:      ${m.author}`);
  if (m.keywords?.length) console.log(`Keywords:    ${m.keywords.join(", ")}`);
  console.log(`Source:      ${pkg.source} (${pkg.path})`);

  if (m.plugins?.length) {
    console.log("\n--- Plugins ---");
    for (const p of m.plugins) {
      console.log(`  • ${p.name} v${p.version}${p.description ? ` — ${p.description}` : ""}`);
    }
  }

  if (m.skills?.length) {
    console.log("\n--- Skills ---");
    for (const s of m.skills) {
      console.log(`  • ${s.name} v${s.version}${s.description ? ` — ${s.description}` : ""}`);
    }
  }

  if (m.prompts?.length) {
    console.log("\n--- Prompt Templates ---");
    for (const p of m.prompts) {
      console.log(`  • ${p.name}${p.description ? `: ${p.description}` : ""}`);
    }
  }

  if (m.themes?.length) {
    console.log("\n--- Themes ---");
    for (const t of m.themes) {
      console.log(`  • ${t.name}${t.description ? `: ${t.description}` : ""}`);
    }
  }

  if (m.mcp?.length) {
    console.log("\n--- MCP Servers ---");
    for (const mc of m.mcp) {
      console.log(`  • ${mc.name}${mc.description ? `: ${mc.description}` : ""}`);
      console.log(`    Command: ${mc.command} ${(mc.args ?? []).join(" ")}`);
    }
  }

  if (m.permissions?.length) {
    console.log("\n--- Permissions ---");
    for (const perm of m.permissions) {
      console.log(`  • ${perm.scope}${perm.reason ? ` — ${perm.reason}` : ""}`);
    }
  }

  console.log();
  return 0;
}

// =============================================================================
// altos create package <name>
// =============================================================================

async function cmdCreate(cwd: string, name: string): Promise<number> {
  // Validate name
  if (!/^(@[a-z0-9-]+\/)?[a-z0-9-]+$/.test(name)) {
    console.error(
      "Package name must be lowercase alphanumeric with hyphens, optionally scoped (e.g. @org/name).",
    );
    return 1;
  }

  const packagesDir = path.join(cwd, ".altos", "packages", name);
  if (fs.existsSync(packagesDir)) {
    console.error(`Package directory already exists: ${packagesDir}`);
    return 1;
  }

  fs.mkdirSync(packagesDir, { recursive: true });

  const manifest: Record<string, unknown> = {
    name,
    version: "0.1.0",
    description: "TODO: describe what this package does",
    author: process.env.USER ?? "Anonymous",
    keywords: [],
    plugins: [],
    skills: [],
    prompts: [],
    themes: [],
    mcp: [],
    permissions: [],
  };

  fs.writeFileSync(
    path.join(packagesDir, "altos-package.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );

  // Create subdirectories
  fs.mkdirSync(path.join(packagesDir, "plugins"), { recursive: true });
  fs.mkdirSync(path.join(packagesDir, "skills"), { recursive: true });
  fs.mkdirSync(path.join(packagesDir, "prompts"), { recursive: true });
  fs.mkdirSync(path.join(packagesDir, "themes"), { recursive: true });

  console.log(`✓ Created package: ${name}`);
  console.log(`  → ${path.join(packagesDir, "altos-package.json")}`);
  console.log("\nEdit the manifest and add your package contents.");
  console.log("Use 'altos package inspect " + name + "' to verify.");
  return 0;
}
