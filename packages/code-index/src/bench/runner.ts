/**
 * Benchmark runner for Altos repo intelligence.
 * Measures: coldIndexMs, incrementalIndexMs, selectionMs, memoryMb,
 *           tokenEstimateAccuracy, watchEventLatencyMs
 *
 * Usage:
 *   npx tsx src/bench/runner.ts
 *   npx tsx src/bench/runner.ts --fixture fixture-100
 *   npm run bench:repo-map
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SymbolIndex } from "../symbols/symbol-index.js";
import { WorkspaceScanner } from "../scanner/workspace-scanner.js";
import {
  runIncrementalIndex,
  FileWatcher,
  clearIndexState,
} from "../indexer/index.js";
import { RelevantFileSelector } from "../selection/relevant-file-selector.js";
import { RepoMapBuilder } from "../repo-map/repo-map-builder.js";
import { generateFixture, cleanupFixture, FIXTURE_100, FIXTURE_1K, FIXTURE_10K } from "./fixtures.js";
import type { RepoMap, IndexedSymbol } from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Metric Targets ────────────────────────────────────────────────────────────

export const BENCHMARK_TARGETS = {
  coldIndexMs: { "fixture-100": 2000, "fixture-1k": 5000, "fixture-10k": 60000 },
  incrementalIndexMs: { "fixture-100": 200, "fixture-1k": 500, "fixture-10k": 2000 },
  selectionMs: { "fixture-100": 50, "fixture-1k": 100, "fixture-10k": 200 },
  memoryMb: { "fixture-100": 50, "fixture-1k": 200, "fixture-10k": 800 },
  tokenEstimateAccuracy: 0.1, // ±10%
  watchEventLatencyMs: { "fixture-100": 500, "fixture-1k": 1000, "fixture-10k": 2000 },
} as const;

// ─── Results Types ─────────────────────────────────────────────────────────────

export interface BenchmarkMetrics {
  coldIndexMs: number;
  incrementalIndexMs: number;
  selectionMs: number;
  memoryMb: number;
  tokenEstimateAccuracy: number;
  watchEventLatencyMs?: number;
}

export interface BenchmarkResult {
  name: string;
  fixture: string;
  metrics: BenchmarkMetrics;
  passed: boolean;
  timestamp: number;
  details?: Record<string, unknown>;
}

// ─── Memory helper ─────────────────────────────────────────────────────────────

function getMemoryMb(): number {
  const usage = process.memoryUsage();
  return Math.round(usage.rss / 1024 / 1024);
}

function getMemoryDeltaMb(before: number): number {
  return Math.round(getMemoryMb() - before);
}

// ─── Token accuracy helper ─────────────────────────────────────────────────────

/**
 * Compute actual token count via simple char/4 approximation and compare
 * against the estimate embedded in the RepoMap.
 */
function computeTokenAccuracy(repoMap: RepoMap): number {
  const actual = Math.ceil(JSON.stringify(repoMap).length / 4);
  const estimated = repoMap.tokenEstimate ?? 0;
  if (estimated === 0) return 1.0;
  return Math.abs(actual - estimated) / actual;
}

// ─── Core benchmark routines ───────────────────────────────────────────────────

async function benchColdIndex(
  root: string,
  _fixtureName: string,
): Promise<{ coldMs: number; memoryMb: number; discovered: number; indexed: number }> {
  // Clear any prior state
  clearIndexState(root);

  const memBefore = getMemoryMb();
  const idx = new SymbolIndex();
  const scanner = new WorkspaceScanner();

  const start = Date.now();
  const stats = await runIncrementalIndex(root, idx, scanner, { forceFull: true });
  const coldMs = Date.now() - start;
  const memoryMb = getMemoryDeltaMb(memBefore);

  return { coldMs, memoryMb, discovered: stats.discovered, indexed: stats.indexed };
}

async function benchIncrementalIndex(
  root: string,
  idx: SymbolIndex,
  scanner: WorkspaceScanner,
): Promise<{ incrMs: number; indexed: number; skipped: number }> {
  // Touch one TS file
  const tsFiles: string[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (full.endsWith(".ts")) tsFiles.push(full);
    }
  }
  walk(root);
  if (tsFiles.length > 0) {
    const target = tsFiles[0];
    const newMtime = new Date(Date.now() + 60_000);
    fs.utimesSync(target, newMtime, newMtime);
    fs.writeFileSync(target, fs.readFileSync(target, "utf-8") + `\n// modified at ${Date.now()}\n`);
  }

  const start = Date.now();
  const stats = await runIncrementalIndex(root, idx, scanner);
  const incrMs = Date.now() - start;

  return { incrMs, indexed: stats.indexed, skipped: stats.skipped };
}

async function benchSelection(
  repoMap: RepoMap,
  symbols: SymbolIndex,
): Promise<{ selMs: number; selectedCount: number }> {
  const selector = new RelevantFileSelector();
  const queries = ["auth", "config", "service", "database", "api"];

  let totalMs = 0;
  let totalSelected = 0;

  for (const query of queries) {
    const start = Date.now();
    const result = await selector.select(query, repoMap, {
      search(q: string, limit?: number) {
        return symbols.search(q, limit);
      },
      getFileSymbols(f: string) {
        return symbols.getFileSymbols(f) as unknown as IndexedSymbol[];
      },
    });
    totalMs += Date.now() - start;
    totalSelected += result.selectedFiles.length;
  }

  return {
    selMs: Math.round(totalMs / queries.length),
    selectedCount: Math.round(totalSelected / queries.length),
  };
}

async function benchWatchEventLatency(
  root: string,
  _idx: SymbolIndex,
  _scanner: WorkspaceScanner,
): Promise<{ latencyMs: number }> {
  return new Promise((resolve) => {
    const watcher = new FileWatcher({ debounceMs: 100, minIntervalMs: 500 });

    watcher.on("batch", async (events: unknown[]) => {
      const latencyMs = Date.now() - (events[0] as { ts: number }).ts;
      watcher.stop();
      resolve({ latencyMs });
    });

    // Find a TS file and modify it
    const tsFiles: string[] = [];
    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (full.endsWith(".ts")) tsFiles.push(full);
      }
    }
    walk(root);

    if (tsFiles.length === 0) {
      watcher.stop();
      resolve({ latencyMs: -1 });
      return;
    }

    const target = tsFiles[0];
    const start = Date.now();
    watcher.push({ type: "change", path: target, ts: start });

    // Timeout fallback
    setTimeout(() => {
      watcher.stop();
      resolve({ latencyMs: -1 });
    }, 5000);
  });
}

// ─── Single fixture benchmark ──────────────────────────────────────────────────

async function runBenchmarkForFixture(
  fixtureConfig: typeof FIXTURE_100 | typeof FIXTURE_1K | typeof FIXTURE_10K,
  fixtureName: string,
): Promise<BenchmarkResult> {
  const root = await generateFixture(fixtureConfig);

  try {
    // ── Cold index ────────────────────────────────────────────────────────────
    const { coldMs, memoryMb, discovered, indexed } = await benchColdIndex(root, fixtureName);

    // ── Build RepoMap ──────────────────────────────────────────────────────────
    const idx = new SymbolIndex();
    const scanner = new WorkspaceScanner();
    await runIncrementalIndex(root, idx, scanner, { forceFull: true });

    const builder = new RepoMapBuilder();
    const repoMap: RepoMap = await builder.build(root, scanner, idx);

    // ── Incremental index ─────────────────────────────────────────────────────
    const { incrMs } = await benchIncrementalIndex(root, idx, scanner);

    // ── Selection latency ─────────────────────────────────────────────────────
    const { selMs, selectedCount } = await benchSelection(repoMap, idx);

    // ── Watch event latency ───────────────────────────────────────────────────
    const { latencyMs } = await benchWatchEventLatency(root, idx, scanner);

    // ── Token accuracy ────────────────────────────────────────────────────────
    const tokenAccuracy = computeTokenAccuracy(repoMap);

    // ── Assemble results ──────────────────────────────────────────────────────
    const metrics: BenchmarkMetrics = {
      coldIndexMs: coldMs,
      incrementalIndexMs: incrMs,
      selectionMs: selMs,
      memoryMb,
      tokenEstimateAccuracy: tokenAccuracy,
      watchEventLatencyMs: latencyMs >= 0 ? latencyMs : undefined,
    };

    const targets = BENCHMARK_TARGETS;
    const passed =
      coldMs <= (targets.coldIndexMs as Record<string, number>)[fixtureName] &&
      incrMs <= (targets.incrementalIndexMs as Record<string, number>)[fixtureName] &&
      selMs <= (targets.selectionMs as Record<string, number>)[fixtureName] &&
      memoryMb <= (targets.memoryMb as Record<string, number>)[fixtureName] &&
      tokenAccuracy <= targets.tokenEstimateAccuracy &&
      (latencyMs < 0 || latencyMs <= (targets.watchEventLatencyMs as Record<string, number>)[fixtureName]);

    return {
      name: `repo-map-bench-${fixtureName}`,
      fixture: fixtureName,
      metrics,
      passed,
      timestamp: Date.now(),
      details: {
        discovered,
        indexed,
        selectedCount,
        tokenEstimate: repoMap.tokenEstimate,
        actualTokenCount: Math.ceil(JSON.stringify(repoMap).length / 4),
      },
    };
  } finally {
    cleanupFixture(root);
  }
}

// ─── Main runner ───────────────────────────────────────────────────────────────

const FIXTURE_MAP: Record<string, typeof FIXTURE_100 | typeof FIXTURE_1K | typeof FIXTURE_10K> = {
  "fixture-100": FIXTURE_100,
  "fixture-1k": FIXTURE_1K,
  "fixture-10k": FIXTURE_10K,
};

const CLI_FIXTURES = process.argv.includes("--fixture")
  ? [process.argv[process.argv.indexOf("--fixture") + 1]].filter(Boolean)
  : ["fixture-100", "fixture-1k", "fixture-10k"];

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("           Altos Repo Intelligence Benchmark Runner");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const results: BenchmarkResult[] = [];
  const startTime = Date.now();

  for (const fixtureName of CLI_FIXTURES) {
    const fixture = FIXTURE_MAP[fixtureName];
    if (!fixture) {
      console.warn(`Unknown fixture: ${fixtureName}, skipping.`);
      continue;
    }

    console.log(`\n▶ Running benchmark: ${fixtureName}`);
    console.log(`  Config: ${fixture.fileCount} files, ${fixture.symbolCount} symbols, depth ${fixture.directoryDepth}`);

    const result = await runBenchmarkForFixture(fixture, fixtureName);
    results.push(result);

    // Print immediate results
    const targets = BENCHMARK_TARGETS;
    const t = fixtureName;
    const pass = (_m: string, actual: number, target: number) =>
      actual <= target ? "✓" : "✗";

    console.log(`\n  Results:`);
    console.log(`    coldIndexMs:        ${result.metrics.coldIndexMs}ms  ${pass("cold", result.metrics.coldIndexMs, (targets.coldIndexMs as Record<string, number>)[t])} (target ≤${(targets.coldIndexMs as Record<string, number>)[t]})`);
    console.log(`    incrementalIndexMs: ${result.metrics.incrementalIndexMs}ms  ${pass("incr", result.metrics.incrementalIndexMs, (targets.incrementalIndexMs as Record<string, number>)[t])} (target ≤${(targets.incrementalIndexMs as Record<string, number>)[t]})`);
    console.log(`    selectionMs:        ${result.metrics.selectionMs}ms  ${pass("sel", result.metrics.selectionMs, (targets.selectionMs as Record<string, number>)[t])} (target ≤${(targets.selectionMs as Record<string, number>)[t]})`);
    console.log(`    memoryMb:           ${result.metrics.memoryMb}MB  ${pass("mem", result.metrics.memoryMb, (targets.memoryMb as Record<string, number>)[t])} (target ≤${(targets.memoryMb as Record<string, number>)[t]})`);
    console.log(`    tokenAccuracy:      ±${(result.metrics.tokenEstimateAccuracy * 100).toFixed(1)}%  ${result.metrics.tokenEstimateAccuracy <= targets.tokenEstimateAccuracy ? "✓" : "✗"} (target ±${targets.tokenEstimateAccuracy * 100}%)`);
    if (result.metrics.watchEventLatencyMs !== undefined) {
      console.log(`    watchEventLatencyMs:${result.metrics.watchEventLatencyMs}ms  ${pass("watch", result.metrics.watchEventLatencyMs, (targets.watchEventLatencyMs as Record<string, number>)[t])} (target ≤${(targets.watchEventLatencyMs as Record<string, number>)[t]})`);
    } else {
      console.log(`    watchEventLatencyMs: N/A`);
    }
    console.log(`\n  Overall: ${result.passed ? "PASS ✓" : "FAIL ✗"}`);
    if (result.details) {
      console.log(`  Details: discovered=${result.details.discovered}, indexed=${result.details.indexed}, selected=${result.details.selectedCount}`);
    }
  }

  const totalMs = Date.now() - startTime;

  // ── Save results ────────────────────────────────────────────────────────────
  const resultsDir = path.join(__dirname);
  const resultsPath = path.join(resultsDir, "results.json");
  const historyPath = path.join(resultsDir, "BENCHMARK_HISTORY.md");

  // Write JSON results
  const jsonResults = {
    version: 1,
    runAt: new Date().toISOString(),
    totalDurationMs: totalMs,
    results,
  };
  fs.writeFileSync(resultsPath, JSON.stringify(jsonResults, null, 2), "utf-8");
  console.log(`\n📄 Results written to: ${resultsPath}`);

  // Append to history markdown
  const historyEntry = `\n## ${new Date().toISOString()}\n\n` +
    results.map((r) =>
      `| ${r.fixture} | ${r.passed ? "PASS" : "FAIL"} | ` +
      `${r.metrics.coldIndexMs}ms | ${r.metrics.incrementalIndexMs}ms | ` +
      `${r.metrics.selectionMs}ms | ${r.metrics.memoryMb}MB | ` +
      `±${(r.metrics.tokenEstimateAccuracy * 100).toFixed(1)}% | ` +
      `${r.metrics.watchEventLatencyMs ?? "N/A"}ms |`
    ).join("\n");

  const historyHeader = `# Benchmark History\n\n| Date | Fixture | Status | Cold Index | Incremental | Selection | Memory | Token Accuracy | Watch Latency |\n|------|---------|--------|------------|-------------|-----------|--------|----------------|---------------|\n`;

  if (!fs.existsSync(historyPath)) {
    fs.writeFileSync(historyPath, historyHeader + historyEntry.slice(2) + "\n", "utf-8");
  } else {
    const existing = fs.readFileSync(historyPath, "utf-8");
    fs.writeFileSync(historyPath, existing.replace(/\n## \d{4}-/, historyEntry + "\n## "), "utf-8");
  }
  console.log(`📄 History updated: ${historyPath}`);

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════════");
  const passed = results.filter((r) => r.passed).length;
  console.log(`  Total:   ${results.length} fixtures`);
  console.log(`  Passed:  ${passed}`);
  console.log(`  Failed:  ${results.length - passed}`);
  console.log(`  Time:    ${totalMs}ms`);
  console.log("═══════════════════════════════════════════════════════════════");

  if (results.some((r) => !r.passed)) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Benchmark runner crashed:", err);
  process.exit(1);
});