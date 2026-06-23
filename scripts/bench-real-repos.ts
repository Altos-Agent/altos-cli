/**
 * scripts/bench-real-repos.ts
 *
 * Real-world repo benchmark for Altos repo intelligence.
 * Validates that Altos remains fast and useful on real-world repositories.
 *
 * Usage:
 *   npx tsx scripts/bench-real-repos.ts
 *   npx tsx scripts/bench-real-repos.ts /path/to/repo --explain
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SymbolIndex } from "../packages/code-index/src/symbols/symbol-index.js";
import { WorkspaceScanner } from "../packages/code-index/src/scanner/workspace-scanner.js";
import {
  runIncrementalIndex,
  clearIndexState,
} from "../packages/code-index/src/indexer/index.js";
import { RelevantFileSelector } from "../packages/code-index/src/selection/relevant-file-selector.js";
import { RepoMapBuilder } from "../packages/code-index/src/repo-map/repo-map-builder.js";
import type {
  RepoMap,
  ExplainedSelectionResult,
} from "../packages/code-index/src/types.js";

// ─── Types ──────────────────────────────────────────────────────────────────────

interface RepoBenchResult {
  name: string;
  path: string;
  discovered: number;
  indexed: number;
  coldIndexMs: number;
  warmIndexMs: number;
  incrementalIndexMs: number;
  selectionMs: number;
  memoryMb: number;
  tokenEstimate: number;
  actualTokens: number;
  tokenAccuracy: number;
  selections: PromptSelectionResult[];
  passed: boolean;
}

interface PromptSelectionResult {
  category: string;
  query: string;
  selectedFiles: string[];
  scores: number[];
  explained?: ExplainedFileInfo[];
  qualityNote?: string;
}

interface ExplainedFileInfo {
  path: string;
  finalScore: number;
  components: Record<string, number>;
  topReasons: string[];
}

// ─── Sample Prompts ────────────────────────────────────────────────────────────
// Each entry: category label + symbol-keyword query.
// The selector searches symbol NAMES via substring match, so each query must
// be a keyword that appears in actual exported symbol names of the repo.
// Symbols are verified against Altos repo before running.

const SAMPLE_PROMPTS: Array<{ category: string; query: string }> = [
  { category: "CLI command routing",  query: "command"   },
  { category: "Memory redaction",    query: "memory"    },
  { category: "Auto compact",        query: "compact"    },
  { category: "Repo indexing",      query: "index"     },
  { category: "MCP integration",    query: "mcp"      },
];

// ─── Helpers ────────────────────────────────────────────────────────────────────

function getMemoryMb(): number {
  return Math.round(process.memoryUsage().rss / 1024 / 1024);
}

function computeTokenAccuracy(repoMap: RepoMap): number {
  const actual = Math.ceil(JSON.stringify(repoMap).length / 4);
  const estimated = repoMap.tokenEstimate ?? 0;
  return estimated === 0 ? 1.0 : Math.abs(actual - estimated) / actual;
}

function touchOneFile(root: string): string | null {
  function walk(dir: string): string[] {
    const results: string[] = [];
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) results.push(...walk(full));
        else if (full.endsWith(".ts") || full.endsWith(".tsx")) results.push(full);
      }
    } catch { /* skip */ }
    return results;
  }
  const tsFiles = walk(root);
  if (!tsFiles.length) return null;
  const target = tsFiles[0];
  const content = fs.readFileSync(target, "utf-8");
  fs.writeFileSync(target, content + "\n// touch " + Date.now() + "\n");
  return target;
}

function restoreFile(target: string): void {
  try {
    const content = fs.readFileSync(target, "utf-8");
    fs.writeFileSync(target, content.replace(/\/\/ touch \d+$/, ""));
  } catch { /* best-effort */ }
}

// ─── Core benchmark ─────────────────────────────────────────────────────────────

async function benchmarkRepo(
  repoPath: string,
  repoName: string,
  enableExplain: boolean,
): Promise<RepoBenchResult> {
  clearIndexState(repoPath);

  // ── PASS 1: Cold index + RepoMap build ───────────────────────────────────
  // This is what a first-run looks like: full parse + RepoMap content reads.
  const memBefore = getMemoryMb();
  const idx = new SymbolIndex();
  const scanner = new WorkspaceScanner();

  const coldStart = Date.now();
  const coldStats = await runIncrementalIndex(repoPath, idx, scanner, { forceFull: true });
  // Build RepoMap (reads file content for module graph — not free)
  const builder = new RepoMapBuilder();
  const repoMap: RepoMap = await builder.build(repoPath, scanner, idx);
  const coldIndexMs = Date.now() - coldStart;
  const memoryMb = getMemoryDeltaMb(memBefore);

  // ── PASS 2: Warm / no-op ───────────────────────────────────────────────────
  // Now the index is populated and state is persisted. Re-indexing should skip
  // nearly everything — we just re-check mtime/size + content hash per file.
  const warmStart = Date.now();
  const warmStats = await runIncrementalIndex(repoPath, idx, scanner);
  const warmIndexMs = Date.now() - warmStart;

  // ── PASS 3: Single-file incremental ────────────────────────────────────────
  const touchTarget = touchOneFile(repoPath);
  const incrStart = Date.now();
  const incrStats = await runIncrementalIndex(repoPath, idx, scanner);
  const incrementalIndexMs = Date.now() - incrStart;
  if (touchTarget) restoreFile(touchTarget);

  // ── Selection (uses the fully-populated idx from PASS 1) ─────────────────
  const selector = new RelevantFileSelector();
  const selections: PromptSelectionResult[] = [];

  const selStart = Date.now();
  for (const { category, query } of SAMPLE_PROMPTS) {
    const explainedResult = await selector.select(query, repoMap, idx, {
      explain: enableExplain,
      maxFiles: 10,
    }) as ExplainedSelectionResult;

    const selectedFiles = explainedResult.selectedFiles.map((f) => f.path);
    const scores = explainedResult.selectedFiles.map((f) => f.finalScore);

    const sel: PromptSelectionResult = { category, query, selectedFiles, scores };

    if (enableExplain) {
      sel.explained = explainedResult.selectedFiles.map((f) => ({
        path: f.path,
        finalScore: f.finalScore,
        components: {
          lexical:   f.components.lexicalScore,
          symbol:    f.components.symbolScore,
          git:       f.components.gitRecencyScore,
          proximity: f.components.pathProximityScore,
          test:      f.components.testProximityScore,
          import:    f.components.importGraphScore,
        },
        topReasons: f.reasons.slice(0, 2).map((r) => r.type + ": " + r.detail),
      }));
    }

    selections.push(sel);
  }
  const selectionMs = Date.now() - selStart;

  // ── Token accuracy ───────────────────────────────────────────────────────
  const actualTokens = Math.ceil(JSON.stringify(repoMap).length / 4);
  const tokenAccuracy = computeTokenAccuracy(repoMap);

  // ── Pass/fail ────────────────────────────────────────────────────────────
  // Real-repo targets (much looser than synthetic fixture targets):
  // coldIndexMs:   60s  — acceptable for a large real repo (cold + RepoMap build)
  // warmIndexMs:   2s   — re-check mtime/size + hash for ~1000 files (disk-bound)
  // incremental:   5s   — one file re-parse + hash check
  // selectionMs:   2s   — 5 prompts total
  // memoryMb:      1GB  — generous
  const passed =
    coldIndexMs < 60_000 &&
    warmIndexMs < 2_000 &&
    incrementalIndexMs < 5_000 &&
    selectionMs < 2_000 &&
    memoryMb < 1_024 &&
    tokenAccuracy < 0.2;

  return {
    name: repoName,
    path: repoPath,
    discovered: coldStats.discovered,
    indexed: coldStats.indexed,
    coldIndexMs,
    warmIndexMs,
    incrementalIndexMs,
    selectionMs,
    memoryMb,
    tokenEstimate: repoMap.tokenEstimate ?? 0,
    actualTokens,
    tokenAccuracy,
    selections,
    passed,
  };
}

function getMemoryDeltaMb(before: number): number {
  return Math.round(getMemoryMb() - before);
}

// ─── Output ─────────────────────────────────────────────────────────────────────

function printResult(result: RepoBenchResult): void {
  const { name, path: repoPath } = result;

  console.log("\n" + "=".repeat(70));
  console.log("  Repo: " + name);
  console.log("  Path: " + repoPath);
  console.log("  Status: " + (result.passed ? "PASS" : "FAIL"));
  console.log("=".repeat(71).replace(/=/g, "-"));

  console.log("\n  INDEXING:");
  console.log("    discovered:         " + result.discovered + " files");
  console.log("    indexed:            " + result.indexed + " files");
  console.log("    coldIndexMs:        " + result.coldIndexMs + "ms  " + ok(result.coldIndexMs < 60_000));
  console.log("    warmIndexMs:        " + result.warmIndexMs + "ms  " + ok(result.warmIndexMs < 2000));
  console.log("    incrementalIndexMs: " + result.incrementalIndexMs + "ms  " + ok(result.incrementalIndexMs < 5000));
  console.log("    memoryMb:           " + result.memoryMb + "MB");

  console.log("\n  SELECTION (" + result.selections.length + " prompts, " + result.selectionMs + "ms total):");
  for (const sel of result.selections) {
    const top3 = sel.selectedFiles.slice(0, 3);
    console.log("    [" + sel.category + "]");
    console.log("      query: \"" + sel.query + "\"");
    if (top3.length > 0) {
      console.log("      -> " + top3.map((f) => path.basename(f)).join(", "));
    } else {
      console.log("      -> (no files selected)");
    }
    if (sel.explained) {
      for (const f of sel.explained.slice(0, 2)) {
        console.log("        " + f.finalScore.toFixed(3) + "  " + path.basename(f.path) + "  (" + (f.topReasons[0] ?? "—") + ")");
      }
    }
  }

  console.log("\n  TOKEN ACCURACY:");
  console.log("    estimated:         " + result.tokenEstimate);
  console.log("    actual:            " + result.actualTokens);
  console.log("    accuracy:           " + (result.tokenAccuracy * 100).toFixed(1) + "% error  " + ok(result.tokenAccuracy < 0.2));
}

function ok(pass: boolean): string { return pass ? "OK" : "FAIL"; }

function printQualityReview(result: RepoBenchResult): void {
  console.log("\n" + "=".repeat(70));
  console.log("  SELECTION QUALITY REVIEW: " + result.name);
  console.log("=".repeat(71).replace(/=/g, "-"));

  let goodCount = 0;

  for (const sel of result.selections) {
    console.log("\n  [" + sel.category + "] query=\"" + sel.query + "\"");
    console.log("  Selected (" + sel.selectedFiles.length + " files):");

    if (!sel.explained || !sel.explained.length) {
      console.log("    (no files selected)");
      continue;
    }

    for (const f of sel.explained) {
      const parts = f.path.split("/");
      const short = parts.slice(Math.max(0, parts.length - 2)).join("/");
      const c = f.components;
      console.log("    [" + f.finalScore.toFixed(3) + "] " + short);
      console.log("      reasons: " + (f.topReasons.join(" | ") || "—"));
      console.log("      components: lex=" + c.lexical.toFixed(2) + " sym=" + c.symbol.toFixed(2) +
                  " git=" + c.git.toFixed(2) + " prox=" + c.proximity.toFixed(2) +
                  " test=" + c.test.toFixed(2) + " imp=" + c.import.toFixed(2));
    }

    const hasGoodScore = sel.explained.some((f) => f.finalScore > 0.3);
    const hasSymbol    = sel.explained.some((f) => f.components.symbol > 0.3);
    const hasMultiple = sel.selectedFiles.length >= 2;

    if (hasGoodScore && hasSymbol) {
      sel.qualityNote = "GOOD: High score with symbol match";
      goodCount++;
    } else if (hasGoodScore) {
      sel.qualityNote = "OK: High score, limited symbol evidence";
    } else if (hasMultiple) {
      sel.qualityNote = "WEAK: Multiple files but low relevance scores";
    } else {
      sel.qualityNote = "POOR: Few or no relevant files selected";
    }
    console.log("    Quality: " + sel.qualityNote);
  }

  const pct = Math.round((goodCount / result.selections.length) * 100);
  console.log("\n  OVERALL: " + goodCount + "/" + result.selections.length +
              " categories GOOD (" + pct + "%)");
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const enableExplain = args.includes("--explain");
  const targetPaths = args.filter((a) => !a.startsWith("--"));

  console.log("========================================================================");
  console.log("        Altos Real-World Repo Benchmark");
  console.log("========================================================================");
  console.log("\nDate:    " + new Date().toISOString());
  console.log("Explain: " + (enableExplain ? "enabled" : "disabled"));

  type RepoDef = { name: string; path: string };
  const DEFAULT_REPOS: RepoDef[] = [
    { name: "AltosAgent",        path: path.join(process.cwd()) },
    { name: "PolyLSP",           path: "/home/oguz/Masaüstü/PolyLSP" },
    { name: "Base-Auto-Trader",  path: "/home/oguz/Masaüstü/Base-Auto-Trader" },
  ];

  const reposToBench = targetPaths.length > 0
    ? [{ name: path.basename(targetPaths[0]), path: targetPaths[0] }]
    : DEFAULT_REPOS;

  const available = reposToBench.filter((r) => {
    if (!fs.existsSync(r.path))
      console.warn("\n  ! Repo not found, skipping: " + r.path);
    return fs.existsSync(r.path);
  });

  if (!available.length) {
    console.error("No valid repos to benchmark.");
    process.exit(1);
  }

  const allResults: RepoBenchResult[] = [];

  for (const repo of available) {
    console.log("\n\n========================================================================");
    console.log("  Benchmarking: " + repo.name + "  [" + repo.path + "]");
    console.log("========================================================================");
    try {
      const result = await benchmarkRepo(repo.path, repo.name, enableExplain);
      allResults.push(result);
      printResult(result);
      if (enableExplain) printQualityReview(result);
    } catch (err) {
      console.error("\n  ! Failed to benchmark " + repo.name + ":", err);
    }
  }

  // ── Summary table ───────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(70));
  console.log("  SUMMARY TABLE");
  console.log("=".repeat(71).replace(/=/g, "-"));
  console.log("  Repo             | Disco  | Cold    | Warm  | Incr   | Sel   | Mem    | Tokens | Pass?");
  console.log("  " + "-".repeat(68));

  for (const r of allResults) {
    const n = r.name.padEnd(16);
    const d = String(r.discovered).padStart(6);
    const c = (r.coldIndexMs + "ms").padStart(7);
    const w = (r.warmIndexMs + "ms").padStart(6);
    const i = (r.incrementalIndexMs + "ms").padStart(7);
    const s = (r.selectionMs + "ms").padStart(6);
    const m = (r.memoryMb + "MB").padStart(7);
    const t = String(r.tokenEstimate).padStart(6);
    const p = r.passed ? "PASS" : "FAIL";
    console.log("  " + n + " | " + d + " | " + c + " | " + w + " | " + i + " | " + s + " | " + m + " | " + t + " | " + p);
  }

  // ── Write results ────────────────────────────────────────────────────────
  const resultsPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "bench-real-repos-results.json");
  fs.writeFileSync(resultsPath, JSON.stringify({
    version: 1,
    runAt: new Date().toISOString(),
    repos: allResults.map((r) => ({
      name: r.name,
      path: r.path,
      discovered: r.discovered,
      indexed: r.indexed,
      coldIndexMs: r.coldIndexMs,
      warmIndexMs: r.warmIndexMs,
      incrementalIndexMs: r.incrementalIndexMs,
      selectionMs: r.selectionMs,
      memoryMb: r.memoryMb,
      tokenEstimate: r.tokenEstimate,
      actualTokens: r.actualTokens,
      tokenAccuracy: r.tokenAccuracy,
      selections: r.selections.map((s) => ({
        category: s.category,
        query: s.query,
        selectedFiles: s.selectedFiles,
        scores: s.scores,
        qualityNote: s.qualityNote,
      })),
      passed: r.passed,
    })),
  }, null, 2), "utf-8");
  console.log("\n  Results written to: " + resultsPath);

  const passed = allResults.filter((r) => r.passed).length;
  console.log("\n========================================================================");
  console.log("  Overall: " + passed + "/" + allResults.length + " repos passed");
  console.log("========================================================================");

  if (passed < allResults.length) process.exit(1);
}

main().catch((err) => { console.error("Benchmark crashed:", err); process.exit(1); });
