import fs from "fs";
import path from "path";
import { WorkspaceScanner } from "../../scanner/workspace-scanner.js";
import { SymbolIndex } from "../../symbols/symbol-index.js";
import { RepoMapBuilder } from "../../repo-map/repo-map-builder.js";
import { RelevantFileSelector } from "../../selection/relevant-file-selector.js";
import {
  loadIndexState,
  saveIndexState,
  updateIndexState,
  computeSymbolHash,
} from "../../indexer/index-state.js";
import { parseTS } from "../../symbols/tree-sitter-parser.js";
import { DEFAULT_REPO_MAP_BUDGET, DEFAULT_LIMITS } from "../../types.js";
import type {
  ExplainedSelectionResult,
  SelectionResult,
  SelectedFile,
  ExplainedFileSelection,
  RepoMapBudget,
} from "../../types.js";
import type { ContextCommandOptions } from "./index.js";

const STALE_INDEX_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Format a score as a visual bar.
 */
function scoreBar(score: number, width: number = 20): string {
  const filled = Math.round(score * width);
  const empty = width - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

/**
 * Format token count with thousands separator.
 */
function formatTokens(tokens: number): string {
  return tokens.toLocaleString();
}

/**
 * Format a file path for display (shorten if too long).
 */
function formatPath(filePath: string, maxLen: number = 50): string {
  if (filePath.length <= maxLen) return filePath;
  const parts = filePath.split("/");
  if (parts.length <= 2) return filePath;
  return `…/${parts.slice(-2).join("/")}`;
}

/**
 * Check if the index is stale and return warning message if so.
 * Returns a warning only for truly stale indexes (>7 days old).
 * Missing index (null) returns null — we can build a fresh one.
 */
function checkStaleIndex(
  _rootPath: string,
  indexState: ReturnType<typeof loadIndexState>,
  _isInteractive: boolean
): string | null {
  if (!indexState) {
    // No existing index — we can build a fresh one, so no warning
    return null;
  }

  const age = Date.now() - indexState.indexedAt;
  if (age > STALE_INDEX_THRESHOLD_MS) {
    const days = Math.floor(age / (24 * 60 * 60 * 1000));
    return `Index is ${days} day${days !== 1 ? "s" : ""} old (last updated ${new Date(indexState.indexedAt).toLocaleDateString()}). Run 'altos index' to refresh.`;
  }

  return null;
}

/**
 * Print explained selection result in human-readable format.
 */
function printExplainedResult(
  result: ExplainedSelectionResult,
  budget: RepoMapBudget,
  showEvidence: boolean
): void {
  const { selectedFiles, totalTokens } = result;
  void result.scoringWeights;

  const fitsBudget = totalTokens <= budget.maxTokens;

  console.log("\n## Context for prompt\n");
  console.log(`Selected ${selectedFiles.length} files, ~${formatTokens(totalTokens)} tokens\n`);

  console.log("### File Selection\n");
  console.log(
    `│ ${"Score".padEnd(6)} │ ${"Path".padEnd(48)} │ Reasons`
  );
  console.log("│────────│──────────────────────────────────────────────────│─────────────────────");

  for (const file of selectedFiles) {
    const scoreStr = file.finalScore.toFixed(2);
    const pathStr = formatPath(file.path, 48);
    const topReason = file.reasons[0]
      ? `${file.reasons[0].type}: ${file.reasons[0].detail.slice(0, 20)}`
      : "";

    console.log(
      `│ ${scoreStr.padEnd(6)} │ ${pathStr.padEnd(48)} │ ${topReason}`
    );
  }

  if (showEvidence) {
    console.log("\n### Scoring Breakdown\n");

    for (const file of selectedFiles.slice(0, 5)) {
      console.log(`**${formatPath(file.path)}** (score: ${file.finalScore.toFixed(2)})`);
      const components = file.components;
      console.log(
        `  symbolScore:       ${scoreBar(components.symbolScore)} ${components.symbolScore.toFixed(2)}`
      );
      console.log(
        `  lexicalScore:      ${scoreBar(components.lexicalScore)} ${components.lexicalScore.toFixed(2)}`
      );
      console.log(
        `  gitRecencyScore:   ${scoreBar(components.gitRecencyScore)} ${components.gitRecencyScore.toFixed(2)}`
      );
      console.log(
        `  pathProximityScore:${scoreBar(components.pathProximityScore)} ${components.pathProximityScore.toFixed(2)}`
      );
      console.log(
        `  testProximityScore:${scoreBar(components.testProximityScore)} ${components.testProximityScore.toFixed(2)}`
      );
      console.log(
        `  importGraphScore:  ${scoreBar(components.importGraphScore)} ${components.importGraphScore.toFixed(2)}`
      );

      if (file.topEvidence.length > 0) {
        console.log("\n  Evidence:");
        for (const evidence of file.topEvidence.slice(0, 3)) {
          console.log(`    • ${evidence}`);
        }
      }
      console.log();
    }
  }

  console.log(`\n### Token Budget`);
  console.log(
    `  Estimated: ${formatTokens(totalTokens)} / ${formatTokens(budget.maxTokens)} tokens`
  );
  console.log(`  Status: ${fitsBudget ? "✅ Within budget" : "⚠️  Exceeds budget"}`);
}

/**
 * Print legacy selection result in human-readable format.
 */
function printSelectionResult(result: SelectionResult, budget: RepoMapBudget): void {
  const { selectedFiles, totalTokens, reasoning } = result;

  const fitsBudget = totalTokens <= budget.maxTokens;

  console.log("\n## Context for prompt\n");
  console.log(`Selected ${selectedFiles.length} files, ~${formatTokens(totalTokens)} tokens\n`);

  console.log("### Selected Files\n");
  console.log(
    `│ ${"Score".padEnd(6)} │ ${"Path".padEnd(48)} │ ${"Reason".padEnd(20)}`
  );
  console.log("│────────│──────────────────────────────────────────────────│───────────────────────");

  for (const file of selectedFiles) {
    const scoreStr = file.relevanceScore.toFixed(2);
    const pathStr = formatPath(file.path, 48);
    const reasonStr = file.reason.detail.slice(0, 20);

    console.log(`│ ${scoreStr.padEnd(6)} │ ${pathStr.padEnd(48)} │ ${reasonStr.padEnd(20)}`);
  }

  if (reasoning.length > 0) {
    console.log("\n### Reasons\n");
    for (const reason of reasoning) {
      console.log(`  [${reason.type}] ${reason.detail} (${reason.score.toFixed(2)})`);
    }
  }

  console.log(`\n### Token Budget`);
  console.log(
    `  Estimated: ${formatTokens(totalTokens)} / ${formatTokens(budget.maxTokens)} tokens`
  );
  console.log(`  Status: ${fitsBudget ? "✅ Within budget" : "⚠️  Exceeds budget"}`);
}

/**
 * Run the context command: show repo map slice and file selection for a prompt.
 */
export async function runContextCommand(
  options: ContextCommandOptions
): Promise<number> {
  const rootPath = options.path ?? process.cwd();
  const maxFiles = options.files ?? DEFAULT_LIMITS.maxFilesPerSelection;
  const maxRepoMapTokens = options.maxTokens ?? DEFAULT_REPO_MAP_BUDGET.maxTokens;
  const budget: RepoMapBudget = {
    ...DEFAULT_REPO_MAP_BUDGET,
    maxTokens: maxRepoMapTokens,
  };

  // Determine if we can show interactive prompts
  const isInteractive = process.stdin.isTTY && !options.json;

  try {
    // Load or build symbol index
    const scanner = new WorkspaceScanner();
    const symbolIndex = new SymbolIndex();
    const repoMapBuilder = new RepoMapBuilder();
    const selector = new RelevantFileSelector();

    // Try to load existing index state for faster startup
    const indexState = loadIndexState(rootPath);

    // Check for stale index
    const staleWarning = checkStaleIndex(rootPath, indexState, isInteractive);
    if (staleWarning) {
      if (options.json) {
        console.log(
          JSON.stringify(
            {
              warning: staleWarning,
              prompt: options.prompt,
              selectedFiles: [],
              totalTokens: 0,
              fitsBudget: false,
              error: "Index is stale or missing. Run 'altos index' to build it.",
            },
            null,
            2
          )
        );
        return 1;
      } else {
        console.warn(`⚠️  ${staleWarning}`);
        console.warn("   Continuing anyway — results may be incomplete.\n");
      }
    }

    // Collect files
    const files: Map<string, string> = new Map();

    for await (const entry of scanner.scan(rootPath)) {
      if (entry.language === "typescript" || entry.language === "javascript") {
        try {
          const content = fs.readFileSync(entry.absolutePath, "utf-8");
          files.set(entry.path, content);
        } catch {
          // Skip
        }
      }
    }

    // Index files
    await symbolIndex.indexFiles(files);

    // Save/update index state
    if (!options.json) {
      const fileStates: Map<string, { mtime: number; size: number; symbolHash: string }> = new Map();
      for (const [filePath, content] of files) {
        const absolutePath = path.join(rootPath, filePath);
        try {
          const stats = fs.statSync(absolutePath);
          const symbolHash = computeSymbolHash(parseTS(content, filePath).symbols);
          fileStates.set(filePath, { mtime: stats.mtimeMs, size: stats.size, symbolHash });
        } catch {
          // Skip
        }
      }
      const newState = updateIndexState(indexState, rootPath, fileStates, []);
      saveIndexState(rootPath, newState);
    }

    // Build repo map
    const repoMap = await repoMapBuilder.build(rootPath, scanner, symbolIndex);

    // Run selection with explain mode
    const result = await selector.select(options.prompt, repoMap, symbolIndex, {
      maxFiles,
      maxRepoMapTokens,
      explain: !options.json, // Human-readable output includes explain
    });

    const fitsBudget = result.totalTokens <= budget.maxTokens;

    if (options.json) {
      const files = result.selectedFiles.map((f) => {
        const explained = f as ExplainedFileSelection;
        const legacy = f as SelectedFile;
        return {
          path: f.path,
          score: explained.finalScore ?? legacy.relevanceScore,
          reasons: explained.reasons ?? (legacy.reason ? [{ type: legacy.reason.type, detail: legacy.reason.detail }] : []),
          evidence: options.showEvidence ? explained.topEvidence ?? [] : undefined,
          components: options.showEvidence && "components" in explained ? explained.components : undefined,
        };
      });

      console.log(
        JSON.stringify(
          {
            prompt: options.prompt,
            selectedFiles: files,
            repoMap: result.repoMapSlice,
            totalTokens: result.totalTokens,
            maxTokens: budget.maxTokens,
            fitsBudget,
          },
          null,
          2
        )
      );
    } else {
      if ("scoringWeights" in result) {
        printExplainedResult(result as ExplainedSelectionResult, budget, options.showEvidence ?? false);
      } else {
        printSelectionResult(result as SelectionResult, budget);
      }

      console.log("\n### Repo Map Summary\n");
      console.log(
        `  ${repoMap.structure.totalFiles} files, ${repoMap.packages.length} packages`
      );
      const langParts: string[] = [];
      for (const [lang, count] of Object.entries(repoMap.structure.byLanguage)) {
        langParts.push(`${lang}:${count}`);
      }
      console.log(`  Languages: ${langParts.join(", ")}`);
    }

    return 0;
  } catch (err) {
    if (options.json) {
      console.log(JSON.stringify({ error: String(err) }, null, 2));
    } else {
      console.error(`Error: ${err}`);
    }
    return 1;
  }
}