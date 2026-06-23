#!/usr/bin/env node
// scripts/bench-cli-startup.ts
// Measures cold-start time for key CLI commands

import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const bin = resolve(__dirname, "../apps/cli/bin/altos.js");

interface TimingResult {
  command: string;
  meanMs: number;
  minMs: number;
  maxMs: number;
  runs: number;
}

function timeCommand(cmd: string, runs = 5): TimingResult {
  const times: number[] = [];

  for (let i = 0; i < runs; i++) {
    const start = Date.now();
    try {
      execSync(`node "${bin}" ${cmd}`, { timeout: 10000 });
    } catch {}
    times.push(Date.now() - start);
  }

  const meanMs = times.reduce((a, b) => a + b, 0) / times.length;
  return { command: cmd, meanMs: Math.round(meanMs * 10) / 10, minMs: Math.min(...times), maxMs: Math.max(...times), runs };
}

const budgets: Record<string, number> = {
  "--version": 100,
  "--help": 150,
  "tools": 300,
  "doctor": 800,
};

const commands = Object.keys(budgets);

console.log("=== CLI Startup Benchmark ===\n");
console.log("Command      Mean(ms)  Min    Max    Budget  Status");
console.log("----------------------------------------------------");

for (const cmd of commands) {
  const result = timeCommand(cmd);
  const budget = budgets[cmd];
  const pct = Math.round((result.meanMs / budget) * 100);
  let status = "✓ OK";
  if (result.meanMs > budget * 1.3) status = "✗ OVER";
  else if (result.meanMs > budget) status = "⚠ WARN";
  console.log(
    `${result.command.padEnd(11)} ${result.meanMs.toFixed(1).padStart(7)}  ${result.minMs.toString().padStart(5)}  ${result.maxMs.toString().padStart(5)}  ${budget.toString().padStart(7)}  ${status} (${pct}%)`,
  );
}

console.log("\n");
