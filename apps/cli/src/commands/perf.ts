// altos perf command - performance metrics and startup timing
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { performance } from "perf_hooks";

const VERSION = "0.1.0";

interface PerfMetrics {
  altosVersion: string;
  nodeVersion: string;
  platform: string;
  bootMs: number;
  configLoadMs: number;
  providerInitMs: number;
  moduleCount: number;
  memoryMB: number;
  commands: Record<string, number>;
}

export async function runPerfCommand(_opts: { args: string[] }): Promise<number> {
  const metrics: PerfMetrics = {
    altosVersion: VERSION,
    nodeVersion: process.version,
    platform: `${os.platform()} ${os.release()}`,
    bootMs: 0,
    configLoadMs: 0,
    providerInitMs: 0,
    moduleCount: 0,
    memoryMB: 0,
    commands: {},
  };

  const start = performance.now();

  // Measure config loading
  const configStart = performance.now();
  const configPaths = getAltosConfigPaths();
  let configFound = false;
  for (const p of [configPaths.local, configPaths.global]) {
    if (fs.existsSync(p)) {
      try {
        JSON.parse(fs.readFileSync(p, "utf-8"));
        configFound = true;
        break;
      } catch {}
    }
  }
  metrics.configLoadMs = Math.round((performance.now() - configStart) * 100) / 100;

  // Measure provider init
  const providerStart = performance.now();
  try {
    const { getDefaultRegistry } = await import("@altos/ai");
    const registry = getDefaultRegistry();
    registry.listProviders();
  } catch {}
  metrics.providerInitMs = Math.round((performance.now() - providerStart) * 100) / 100;

  metrics.bootMs = Math.round((performance.now() - start) * 100) / 100;

  // Memory
  const mem = process.memoryUsage();
  metrics.memoryMB = Math.round(mem.rss / 1024 / 1024 * 10) / 10;

  // Module count estimate
  metrics.moduleCount = estimateModuleCount();

  // Benchmark quick commands
  metrics.commands = await benchmarkCommands();

  // Print report
  console.log(`
=== Altos Performance Report ===
Altos:     ${metrics.altosVersion}
Node:      ${metrics.nodeVersion}
Platform:  ${metrics.platform}

--- Startup Timing ---
Total boot:          ${metrics.bootMs}ms
Config load:         ${metrics.configLoadMs}ms
Provider init:       ${metrics.providerInitMs}ms

--- Memory & Modules ---
RSS memory:          ${metrics.memoryMB} MB
Module count (est):  ${metrics.moduleCount}

--- Command Benchmarks ---
Command        Cold Start
-------------------------
--version     ${metrics.commands["--version"] ?? "N/A"}ms
--help        ${metrics.commands["--help"] ?? "N/A"}ms
tools         ${metrics.commands["tools"] ?? "N/A"}ms
doctor        ${metrics.commands["doctor"] ?? "N/A"}ms

--- Budget Status ---
Command       Target    Actual    Status
-----------------------------------------
--version     <100ms    ${metrics.commands["--version"] ?? "N/A"}ms     ${getStatus((metrics.commands["--version"] ?? 999), 100)}
--help        <150ms    ${metrics.commands["--help"] ?? "N/A"}ms     ${getStatus((metrics.commands["--help"] ?? 999), 150)}
tools         <300ms    ${metrics.commands["tools"] ?? "N/A"}ms     ${getStatus((metrics.commands["tools"] ?? 999), 300)}
doctor        <800ms    ${metrics.commands["doctor"] ?? "N/A"}ms     ${getStatus((metrics.commands["doctor"] ?? 999), 800)}
`);

  return 0;
}

function getStatus(actual: number, target: number): string {
  if (actual < target * 0.7) return "✓ GREEN";
  if (actual < target) return "✓ OK";
  if (actual < target * 1.3) return "⚠ MARGINAL";
  return "✗ OVER BUDGET";
}

function getAltosConfigPaths() {
  const home = os.homedir();
  const cwd = process.cwd();
  return {
    global: path.join(home, ".altos", "config.json"),
    local: path.join(cwd, ".altos", "config.json"),
  };
}

function estimateModuleCount(): number {
  try {
    const used = process.memoryUsage();
    // Rough heuristic based on heap used
    return Math.round(used.heapUsed / 1024 / 150);
  } catch {
    return 0;
  }
}

async function benchmarkCommands(): Promise<Record<string, number>> {
  const results: Record<string, number> = {};
  const binPath = path.resolve(process.argv[1], "../../bin/altos.js");

  // Quick timing for --version
  const vStart = performance.now();
  try {
    const { execSync } = await import("child_process");
    execSync(`node "${binPath}" --version`, { timeout: 5000 });
    results["--version"] = Math.round((performance.now() - vStart) * 100) / 100;
  } catch {}

  // Quick timing for --help
  const hStart = performance.now();
  try {
    const { execSync } = await import("child_process");
    execSync(`node "${binPath}" --help`, { timeout: 5000 });
    results["--help"] = Math.round((performance.now() - hStart) * 100) / 100;
  } catch {}

  // Quick timing for tools
  const tStart = performance.now();
  try {
    const { execSync } = await import("child_process");
    execSync(`node "${binPath}" tools`, { timeout: 5000 });
    results["tools"] = Math.round((performance.now() - tStart) * 100) / 100;
  } catch {}

  // Quick timing for doctor
  const dStart = performance.now();
  try {
    const { execSync } = await import("child_process");
    execSync(`node "${binPath}" doctor`, { timeout: 5000 });
    results["doctor"] = Math.round((performance.now() - dStart) * 100) / 100;
  } catch {}

  return results;
}
