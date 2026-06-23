// altos doctor command - diagnostics
import * as os from "os";
import * as fs from "fs";
import * as path from "path";

const VERSION = "0.1.0";

interface DoctorResult {
  os: string;
  nodeVersion: string;
  altosVersion: string;
  providers: {
    id: string;
    name: string;
    configured: boolean;
    envVar: string;
    models: number;
  }[];
  configFiles: {
    path: string;
    exists: boolean;
  }[];
  issues: string[];
}

function getAltosConfigPaths() {
  const home = os.homedir();
  const cwd = process.cwd();
  return {
    global: path.join(home, ".altos", "config.json"),
    local: path.join(cwd, ".altos", "config.json"),
  };
}

export async function runDoctorCommand(opts: { args: string[] }): Promise<number> {
  // Parse doctor-specific options
  const options = {
    json: opts.args?.includes("--json") ?? false,
    releaseCheck: opts.args?.includes("--release-check") ?? false,
  };

  const { getDefaultRegistry, listAvailableProviders, ENV_API_KEYS } = await import("@altos/ai");

  const result: DoctorResult = {
    os: `${os.platform()} ${os.release()}`,
    nodeVersion: process.version,
    altosVersion: VERSION,
    providers: [],
    configFiles: [],
    issues: [],
  };

  const paths = getAltosConfigPaths();

  for (const [name, p] of Object.entries(paths)) {
    const exists = fs.existsSync(p);
    result.configFiles.push({ path: p, exists });
    if (!exists) {
      result.issues.push(`Config file "${name}" does not exist at ${p}`);
    }
  }

  const registry = getDefaultRegistry();
  const providers = registry.listProviders();

  for (const providerId of listAvailableProviders()) {
    const envVar = ENV_API_KEYS[providerId];
    const configured = !!process.env[envVar];
    const provider = registry.getProvider(providerId);
    const models = provider?.listModels() ?? [];

    result.providers.push({
      id: providerId,
      name: provider?.name ?? providerId,
      configured,
      envVar,
      models: models.length,
    });

    if (!configured) {
      result.issues.push(`Provider "${providerId}" not configured (${envVar} not set)`);
    }
  }

  if (providers.length === 0) {
    result.issues.push("No providers registered");
  }

  if (options.json) {
    const output = {
      version: "1.0",
      summary: {
        total: result.providers.length,
        configured: result.providers.filter((p) => p.configured).length,
        unconfigured: result.providers.filter((p) => !p.configured).length,
        issues: result.issues.length,
        hasIssues: result.issues.length > 0,
      },
      system: {
        os: result.os,
        nodeVersion: result.nodeVersion,
        altosVersion: result.altosVersion,
      },
      configFiles: result.configFiles,
      providers: result.providers,
      issues: result.issues,
    };
    console.log(JSON.stringify(output, null, 2));
    return result.issues.length > 0 ? 1 : 0;
  }

  // Human-readable output
  console.log("\n=== Altos Doctor Report ===\n");
  console.log(`OS:           ${result.os}`);
  console.log(`Node:         ${result.nodeVersion}`);
  console.log(`Altos:        ${result.altosVersion}`);
  console.log(`Providers:    ${result.providers.length} registered`);

  console.log("\n--- Config Files ---");
  for (const cf of result.configFiles) {
    console.log(`  ${cf.path}: ${cf.exists ? "✓ exists" : "✗ missing"}`);
  }

  console.log("\n--- Providers ---");
  for (const p of result.providers) {
    const status = p.configured ? "✓ configured" : "✗ not configured";
    console.log(`  ${p.name} (${p.id}): ${status}`);
    console.log(`    Env var: ${p.envVar}`);
    console.log(`    Models:  ${p.models}`);
  }

  console.log("\n--- Issues ---");
  if (result.issues.length === 0) {
    console.log("  No issues found!");
  } else {
    for (const issue of result.issues) {
      console.log(`  ✗ ${issue}`);
    }
  }

  console.log();

  if (options.releaseCheck && result.issues.length > 0) {
    console.log("[red]Critical issues found (--release-check).[/]");
    return 1;
  }

  return result.issues.length > 0 ? 1 : 0;
}
