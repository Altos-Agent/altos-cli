#!/usr/bin/env node
// scripts/bench-indexing.ts
// Benchmarks code indexing performance

import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const bin = resolve(__dirname, "../apps/cli/bin/altos.js");

console.log("=== Code Indexing Benchmark ===\n");

const scenarios = [
  { name: "map (full repo)", cmd: `node "${bin}" map`, budgetMs: 3000 },
  { name: "index --stats", cmd: `node "${bin}" index --stats`, budgetMs: 5000 },
];

for (const s of scenarios) {
  const start = Date.now();
  try {
    execSync(s.cmd, { timeout: 15000 });
  } catch (e) {
    // Some commands may error but we still want to measure time
  }
  const ms = Date.now() - start;
  const pct = Math.round((ms / s.budgetMs) * 100);
  const status = ms < s.budgetMs ? "✓ OK" : "✗ OVER";
  console.log(`${s.name.padEnd(20)} ${ms}ms  budget:${s.budgetMs}ms  ${status} (${pct}%)`);
}

console.log("\n");
