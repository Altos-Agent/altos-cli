// altos sandbox CLI commands

import { Sandbox, type SandboxProviderType } from "@altos/sandbox";
import * as path from "path";

export interface SandboxCommandOptions {
  status?: boolean;
  run?: string;
  provider?: SandboxProviderType;
  workspace?: string;
  network?: boolean;
  limits?: string;
  timeout?: number;
  json?: boolean;
  dockerImage?: string;
}

export async function runSandboxCommand(
  cwd: string,
  options: SandboxCommandOptions,
): Promise<number> {
  // Default: status
  if (options.status || (!options.run && !options.status)) {
    return cmdStatus(options.json);
  }

  if (options.run) {
    if (!options.workspace) {
      console.error("Error: --workspace required for sandbox run");
      console.error("Usage: altos sandbox run <command> --workspace <path>");
      return 1;
    }
    return cmdRun(options.run, options);
  }

  return cmdStatus(options.json);
}

// =============================================================================
// altos sandbox status
// =============================================================================

async function cmdStatus(asJson?: boolean): Promise<number> {
  const providers = Sandbox.listProviders();

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          providers: providers.map((p) => ({
            id: p.id,
            name: p.name,
            type: p.type,
            available: p.available,
            version: p.version ?? null,
          })),
          default: "local",
        },
        null,
        2,
      ),
    );
    return 0;
  }

  console.log("\n=== Sandbox Providers ===\n");
  for (const provider of providers) {
    const status = provider.available ? "✓ available" : "✗ not found";
    const version = provider.version ? ` (${provider.version})` : "";
    console.log(`  ${provider.name.padEnd(12)} ${status}${version}`);
  }

  console.log();
  console.log("  Default provider: local");
  console.log();
  console.log("Usage:");
  console.log("  altos sandbox status          Show provider status");
  console.log("  altos sandbox run <cmd>       Run command in sandbox");
  console.log();
  console.log("Options:");
  console.log("  --workspace <path>     Workspace directory (required for run)");
  console.log("  --provider <type>      Provider type: local, docker, podman");
  console.log("  --network              Enable network (default: disabled)");
  console.log("  --limits <spec>        Resource limits (e.g., mem=512,cpu=50,time=60000)");
  console.log("  --timeout <ms>         Command timeout in milliseconds");
  console.log("  --docker-image <img>   Docker image to use");
  console.log("  --json                 Output JSON");

  return 0;
}

// =============================================================================
// altos sandbox run <command>
// =============================================================================

async function cmdRun(command: string, options: SandboxCommandOptions): Promise<number> {
  const provider = options.provider ?? "local";
  const workspace = path.resolve(options.workspace ?? process.cwd());
  const timeout = options.timeout ?? 60000;

  if (options.json) {
    console.log(
      JSON.stringify({
        command,
        provider,
        workspace,
        timeout,
        status: "executing",
      }),
    );
    return 0;
  }

  console.log(`\n=== Sandbox Execution ===\n`);
  console.log(`Provider:    ${provider}`);
  console.log(`Workspace:   ${workspace}`);
  console.log(`Command:     ${command}`);
  console.log(`Timeout:     ${timeout}ms`);
  console.log(`Network:     ${options.network ? "enabled" : "disabled"}`);
  if (options.limits) {
    console.log(`Limits:      ${options.limits}`);
  }
  console.log();

  try {
    const limits = options.limits ? parseLimitsString(options.limits) : undefined;

    const sandbox = await Sandbox.create(provider, workspace, {
      networkEnabled: options.network ?? false,
      limits,
      dockerConfig: options.dockerImage ? { image: options.dockerImage } : undefined,
    });

    console.log("Executing...\n");

    const result = await sandbox.executeCommand(command, { timeout });

    console.log(`Exit Code:   ${result.exitCode}`);
    console.log(`Duration:    ${result.duration}ms`);
    console.log(`Killed:      ${result.killed ? "yes" : "no"}`);
    console.log();

    if (result.stdout) {
      console.log("--- STDOUT ---");
      console.log(result.stdout);
    }

    if (result.stderr) {
      console.log("--- STDERR ---");
      console.log(result.stderr);
    }

    await sandbox.cleanup();

    return result.exitCode;
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

// =============================================================================
// Utilities
// =============================================================================

function parseLimitsString(spec: string): {
  maxMemoryMB?: number;
  maxCPUPercent?: number;
  maxDurationMs?: number;
} {
  const limits: { maxMemoryMB?: number; maxCPUPercent?: number; maxDurationMs?: number } = {};
  const parts = spec.split(",");
  for (const part of parts) {
    const [key, value] = part.trim().split("=");
    switch (key) {
      case "mem":
        limits.maxMemoryMB = Number(value);
        break;
      case "cpu":
        limits.maxCPUPercent = Number(value);
        break;
      case "time":
        limits.maxDurationMs = Number(value);
        break;
    }
  }
  return limits;
}
