import type {
  RepoMap,
  SelectionOptions,
  SelectionResult,
  SelectedFile,
  SelectionReason,
  IndexedSymbol,
  FileScoreComponents,
  ExplainedFileSelection,
  ExplainedSelectionResult,
  GitContext,
  RepoMapBudget,
} from "../types.js";
import {
  DEFAULT_LIMITS,
  DEFAULT_SCORING_WEIGHTS,
  DEFAULT_REPO_MAP_BUDGET,
} from "../types.js";

interface SymbolSearch {
  search(q: string, limit?: number): IndexedSymbol[];
  getFileSymbols(f: string): IndexedSymbol[];
}

interface FileScoreEntry {
  finalScore: number;
  components: FileScoreComponents;
  reasons: SelectionReason[];
  symbols: IndexedSymbol[];
}

// Symbol kind weights for scoring
const SYMBOL_KIND_WEIGHTS: Record<string, number> = {
  class: 1.0,
  interface: 0.9,
  function: 0.8,
  method: 0.8,
  type: 0.7,
  enum: 0.7,
  constant: 0.6,
  property: 0.5,
  variable: 0.4,
  namespace: 0.5,
  module: 0.4,
};

// Test file patterns
const TEST_FILE_PATTERNS = [
  /\.test\.(ts|js|tsx|jsx)$/,
  /\.spec\.(ts|js|tsx|jsx)$/,
  /__tests__\/.*\.ts$/,
  /tests\/.*\.ts$/,
];

/**
 * Compute lexical score: substring match in file path.
 */
function computeLexicalScore(query: string, filePath: string): number {
  const lowerPath = filePath.toLowerCase();
  const lowerQuery = query.toLowerCase();

  if (lowerPath === lowerQuery) return 1.0;

  const segments = lowerPath.split("/");
  if (segments.some((seg) => seg.includes(lowerQuery))) return 0.8;

  const dirs = segments.slice(0, -1);
  if (dirs.some((dir) => dir.includes(lowerQuery))) return 0.6;

  if (lowerPath.includes(lowerQuery)) return 0.4;

  return 0;
}

/**
 * Compute symbol score based on matched symbols.
 */
function computeSymbolScore(
  symbols: IndexedSymbol[],
  query: string
): { score: number; evidence: string } {
  if (symbols.length === 0) return { score: 0, evidence: "" };

  let maxScore = 0;
  let bestEvidence = "";

  for (const sym of symbols) {
    const nameMatch = sym.name.toLowerCase().includes(query.toLowerCase());
    if (!nameMatch) continue;

    const kindWeight = SYMBOL_KIND_WEIGHTS[sym.kind] ?? 0.5;
    const exactBonus =
      sym.name.toLowerCase() === query.toLowerCase() ? 0.2 : 0;
    const score = Math.min(1.0, kindWeight + exactBonus);

    if (score > maxScore) {
      maxScore = score;
      bestEvidence = `${sym.kind} '${sym.name}' at line ${sym.line}`;
    }
  }

  return { score: maxScore, evidence: bestEvidence };
}

/**
 * Compute git recency score: files modified recently score higher.
 */
function computeGitRecencyScore(
  filePath: string,
  gitContext: GitContext | undefined
): { score: number; evidence: string } {
  if (!gitContext) return { score: 0.5, evidence: "no git context" };

  const mtime = gitContext.lastModified.get(filePath);
  if (!mtime) return { score: 0.3, evidence: "no git record" };

  const daysSinceModified = (Date.now() - mtime) / (1000 * 60 * 60 * 24);

  let score: number;
  let timeLabel: string;

  if (daysSinceModified <= 7) {
    score = 1.0;
    timeLabel = "7 days";
  } else if (daysSinceModified <= 14) {
    score = 0.9;
    timeLabel = "14 days";
  } else if (daysSinceModified <= 30) {
    score = 0.8;
    timeLabel = "30 days";
  } else if (daysSinceModified <= 90) {
    score = 0.6;
    timeLabel = "90 days";
  } else if (daysSinceModified <= 180) {
    score = 0.4;
    timeLabel = "180 days";
  } else {
    score = 0.2;
    timeLabel = ">180 days";
  }

  return {
    score,
    evidence: `modified ${timeLabel} ago`,
  };
}

/**
 * Compute path proximity score: files near other high-scoring files get bonus.
 */
function computePathProximityScore(
  filePath: string,
  scoredFiles: Map<string, FileScoreEntry>
): number {
  const fileDir = filePath.substring(0, filePath.lastIndexOf("/"));
  let proximityBonus = 0;
  let neighbors = 0;

  for (const [otherPath, entry] of scoredFiles) {
    if (otherPath === filePath) continue;
    if (entry.finalScore < 0.3) continue;

    const otherDir = otherPath.substring(0, otherPath.lastIndexOf("/"));

    if (otherDir === fileDir) {
      proximityBonus += entry.finalScore * 0.3;
      neighbors++;
    } else if (
      otherDir.startsWith(fileDir + "/") ||
      fileDir.startsWith(otherDir + "/")
    ) {
      proximityBonus += entry.finalScore * 0.15;
      neighbors++;
    }
  }

  return neighbors > 0 ? Math.min(1.0, proximityBonus / neighbors) : 0;
}

/**
 * Compute test proximity score: test files for source files get bonus.
 */
function computeTestProximityScore(
  filePath: string
): { score: number; evidence: string } {
  const isTest = TEST_FILE_PATTERNS.some((p) => p.test(filePath));

  if (isTest) {
    // Try to find corresponding source file
    const sourceFile = filePath
      .replace(/\.test\.(ts|js|tsx|jsx)$/, ".$1")
      .replace(/\.spec\.(ts|js|tsx|jsx)$/, ".$1")
      .replace(/__tests__\//, "/")
      .replace(/tests\//, "/");

    return {
      score: 0.5,
      evidence: `test file for ${sourceFile}`,
    };
  }

  // Check if there's a corresponding test file
  const testPatterns = [
    filePath.replace(/\.(ts|js|tsx|jsx)$/, ".test.$1"),
    filePath.replace(/\.(ts|js|tsx|jsx)$/, ".spec.$1"),
    filePath.replace(/\//, "/__tests__/"),
  ];

  for (const pattern of testPatterns) {
    if (TEST_FILE_PATTERNS.some((p) => p.test(pattern))) {
      return {
        score: 0.6,
        evidence: `source file with test`,
      };
    }
  }

  return { score: 0, evidence: "" };
}

/**
 * Compute import graph score: files connected to selected files via imports.
 */
function computeImportGraphScore(
  filePath: string,
  repoMap: RepoMap,
  selectedFilePaths: Set<string>
): { score: number; evidence: string } {
  const fileEntry = repoMap.moduleGraph.find((e) => e.file === filePath);
  if (!fileEntry) return { score: 0, evidence: "" };

  let maxScore = 0;
  let evidence = "";

  // Check imports (what this file imports)
  for (const imported of fileEntry.imports) {
    if (selectedFilePaths.has(imported)) {
      maxScore = Math.max(maxScore, 0.8);
      evidence = `imports ${imported}`;
    }
  }

  // Check if something selected imports this file
  for (const entry of repoMap.moduleGraph) {
    if (entry.file === filePath) continue;
    if (entry.imports.includes(filePath) && selectedFilePaths.has(entry.file)) {
      maxScore = Math.max(maxScore, 0.7);
      evidence = `imported by ${entry.file}`;
    }
  }

  return { score: maxScore, evidence };
}

/**
 * Validate symbol evidence references actual symbol and line.
 */
function validateSymbolEvidence(
  evidence: string,
  symbols: IndexedSymbol[]
): boolean {
  // Evidence format: "kind 'name' at line N"
  const match = evidence.match(/^(.+?) '(.+?)' at line (\d+)$/);
  if (!match) return false;

  const [, kind, name, lineStr] = match;
  const line = parseInt(lineStr, 10);

  return symbols.some(
    (s) =>
      s.kind === kind &&
      s.name === name &&
      s.line === line
  );
}

/**
 * Validate git evidence references actual git metadata.
 */
function validateGitEvidence(
  evidence: string,
  filePath: string,
  gitContext: GitContext | undefined
): boolean {
  if (!evidence || evidence === "no git context" || evidence === "no git record") {
    return true; // These are valid "no data" cases
  }

  // Evidence format: "modified X days ago"
  const modifiedMatch = evidence.match(/^modified (\d+) days ago$/);
  if (modifiedMatch && gitContext) {
    const daysAgo = parseInt(modifiedMatch[1], 10);
    const mtime = gitContext.lastModified.get(filePath);
    if (!mtime) return false;

    const actualDaysAgo = Math.round((Date.now() - mtime) / (1000 * 60 * 60 * 24));
    // Allow 1 day tolerance for rounding
    return Math.abs(actualDaysAgo - daysAgo) <= 1;
  }

  return true;
}

/**
 * Validate import evidence references actual import graph edge.
 */
function validateImportEvidence(
  evidence: string,
  filePath: string,
  repoMap: RepoMap
): boolean {
  if (!evidence) return true;

  // Evidence format: "imports <path>" or "imported by <path>"
  const importsMatch = evidence.match(/^imports (.+)$/);
  if (importsMatch) {
    const importedFile = importsMatch[1];
    const entry = repoMap.moduleGraph.find((e) => e.file === filePath);
    return entry?.imports.includes(importedFile) ?? false;
  }

  const importedByMatch = evidence.match(/^imported by (.+)$/);
  if (importedByMatch) {
    const importerFile = importedByMatch[1];
    const entry = repoMap.moduleGraph.find((e) => e.file === importerFile);
    return entry?.imports.includes(filePath) ?? false;
  }

  return true;
}

/**
 * Validate all reasons for a file selection have valid evidence.
 */
function validateSelectionReasons(
  reasons: SelectionReason[],
  filePath: string,
  symbols: IndexedSymbol[],
  gitContext: GitContext | undefined,
  repoMap: RepoMap
): SelectionReason[] {
  return reasons.filter((reason) => {
    if (!reason.evidence) return true;

    switch (reason.component) {
      case "symbolScore":
        return validateSymbolEvidence(reason.evidence, symbols);
      case "gitRecencyScore":
        return validateGitEvidence(reason.evidence, filePath, gitContext);
      case "importGraphScore":
        return validateImportEvidence(reason.evidence, filePath, repoMap);
      default:
        return true;
    }
  });
}

/**
 * Format an ExplainedFileSelection into human-readable explanation.
 */
export function formatFileSelectionExplanation(
  selection: ExplainedFileSelection,
  weights: Record<keyof FileScoreComponents, number>
): string {
  const lines: string[] = [];
  lines.push(`📄 ${selection.path}`);
  lines.push(`   Final Score: ${selection.finalScore.toFixed(3)}`);
  lines.push("");

  lines.push("   Component Breakdown:");
  const { components } = selection;
  lines.push(`     • lexicalScore:      ${components.lexicalScore.toFixed(3)} × ${weights.lexicalScore.toFixed(2)} = ${(components.lexicalScore * weights.lexicalScore).toFixed(3)}`);
  lines.push(`     • symbolScore:       ${components.symbolScore.toFixed(3)} × ${weights.symbolScore.toFixed(2)} = ${(components.symbolScore * weights.symbolScore).toFixed(3)}`);
  lines.push(`     • gitRecencyScore:   ${components.gitRecencyScore.toFixed(3)} × ${weights.gitRecencyScore.toFixed(2)} = ${(components.gitRecencyScore * weights.gitRecencyScore).toFixed(3)}`);
  lines.push(`     • pathProximityScore:${components.pathProximityScore.toFixed(3)} × ${weights.pathProximityScore.toFixed(2)} = ${(components.pathProximityScore * weights.pathProximityScore).toFixed(3)}`);
  lines.push(`     • testProximityScore:${components.testProximityScore.toFixed(3)} × ${weights.testProximityScore.toFixed(2)} = ${(components.testProximityScore * weights.testProximityScore).toFixed(3)}`);
  lines.push(`     • importGraphScore:  ${components.importGraphScore.toFixed(3)} × ${weights.importGraphScore.toFixed(2)} = ${(components.importGraphScore * weights.importGraphScore).toFixed(3)}`);
  lines.push("");

  if (selection.reasons.length > 0) {
    lines.push("   Reasons:");
    for (const reason of selection.reasons) {
      const evidence = reason.evidence ? ` [${reason.evidence}]` : "";
      lines.push(`     • [${reason.component}] ${reason.type}: ${reason.detail} (${reason.score.toFixed(3)})${evidence}`);
    }
  }

  return lines.join("\n");
}

/**
 * Format multiple file selections into a complete explanation report.
 */
export function formatSelectionReport(
  selections: ExplainedFileSelection[],
  weights: Record<keyof FileScoreComponents, number>,
  totalTokens: number
): string {
  const lines: string[] = [];
  lines.push("═══════════════════════════════════════════════════════════════");
  lines.push("                    FILE SELECTION EXPLANATION REPORT");
  lines.push("═══════════════════════════════════════════════════════════════");
  lines.push("");
  lines.push("Scoring Weights:");
  lines.push(`  lexicalScore:      ${weights.lexicalScore}`);
  lines.push(`  symbolScore:       ${weights.symbolScore}`);
  lines.push(`  gitRecencyScore:   ${weights.gitRecencyScore}`);
  lines.push(`  pathProximityScore:${weights.pathProximityScore}`);
  lines.push(`  testProximityScore:${weights.testProximityScore}`);
  lines.push(`  importGraphScore:  ${weights.importGraphScore}`);
  lines.push("");
  lines.push(`Total Tokens: ${totalTokens}`);
  lines.push(`Files Selected: ${selections.length}`);
  lines.push("");
  lines.push("───────────────────────────────────────────────────────────────");
  lines.push("");

  for (let i = 0; i < selections.length; i++) {
    const explanation = formatFileSelectionExplanation(selections[i], weights);
    lines.push(explanation);
    if (i < selections.length - 1) {
      lines.push("");
      lines.push("───────────────────────────────────────────────────────────────");
      lines.push("");
    }
  }

  lines.push("");
  lines.push("═══════════════════════════════════════════════════════════════");

  return lines.join("\n");
}

/**
 * Selects relevant files from a RepoMap based on a natural language prompt.
 *
 * Selection Algorithm (multi-dimensional):
 * 1. Parse prompt — lowercase it for comparison
 * 2. Symbol search — find matching symbols via symbol index
 * 3. Compute per-component scores for each candidate file:
 *    - lexicalScore: path substring match
 *    - symbolScore: matched symbol quality
 *    - gitRecencyScore: recency from git context
 *    - pathProximityScore: proximity to other selected files
 *    - testProximityScore: test file for source file
 *    - importGraphScore: import graph connectivity
 * 4. Weight and combine scores
 * 5. Sort by final score, truncate to maxFiles
 * 6. Build repoMapSlice and estimate tokens
 * 7. Return SelectionResult with optional explainability
 * 8. Validate evidence on all selection reasons
 */
export class RelevantFileSelector {
  async select(
    prompt: string,
    repoMap: RepoMap,
    symbols: SymbolSearch,
    options?: SelectionOptions & {
      gitContext?: GitContext;
      explain?: boolean;
      budget?: RepoMapBudget;
      scoringWeights?: Partial<Record<keyof FileScoreComponents, number>>;
    }
  ): Promise<SelectionResult | ExplainedSelectionResult> {
    const maxFiles = options?.maxFiles ?? DEFAULT_LIMITS.maxFilesPerSelection;
    const maxSymbols = options?.maxSymbols ?? DEFAULT_LIMITS.maxSymbolsPerQuery;
    const gitContext = options?.gitContext;
    const explain = options?.explain ?? false;
    const customWeights = options?.scoringWeights ?? {};

    // Build budget: explicit budget takes precedence, otherwise derive from options
    let budget: RepoMapBudget;
    if (options?.budget) {
      budget = options.budget;
    } else {
      const maxRepoMapTokens = options?.maxRepoMapTokens ?? DEFAULT_REPO_MAP_BUDGET.maxTokens;
      budget = { ...DEFAULT_REPO_MAP_BUDGET, maxTokens: maxRepoMapTokens };
    }

    // Merge default weights with custom weights
    const weights = { ...DEFAULT_SCORING_WEIGHTS, ...customWeights };

    // 1. Parse prompt
    const query = prompt.toLowerCase().trim();

    // 2. Symbol search
    const matchedSymbols = symbols.search(query, maxSymbols);

    // Track scores per file
    const fileScores = new Map<string, FileScoreEntry>();

    // 3. Score files based on matched symbols
    for (const symbol of matchedSymbols) {
      const symbolName = symbol.name.toLowerCase();
      // The symbol-level score is computed downstream by `computeSymbolScore`;
      // we only need to bucket the match here for cheap filtering.
      const matchedExact = symbolName === query;
      const matchedPartial = symbolName.includes(query) || query.includes(symbolName);

      // Suppress the unused-binding diagnostic without changing control flow.
      void matchedExact;
      void matchedPartial;

      const existing = fileScores.get(symbol.file);
      const { score, evidence } = computeSymbolScore([symbol], query);

      if (!existing) {
        fileScores.set(symbol.file, {
          finalScore: 0,
          components: {
            lexicalScore: 0,
            symbolScore: score,
            gitRecencyScore: 0,
            pathProximityScore: 0,
            testProximityScore: 0,
            importGraphScore: 0,
          },
          reasons: [
            {
              type: "symbol_match",
              detail: `matched symbol '${symbol.name}'`,
              score,
              component: "symbolScore",
              evidence,
            },
          ],
          symbols: [symbol],
        });
      } else {
        existing.symbols.push(symbol);
        if (score > existing.components.symbolScore) {
          existing.components.symbolScore = score;
          existing.reasons.push({
            type: "symbol_match",
            detail: `matched symbol '${symbol.name}'`,
            score,
            component: "symbolScore",
            evidence,
          });
        }
      }
    }

    // 4. Lexical matching for important files
    for (const importantFile of repoMap.importantFiles) {
      const lexScore = computeLexicalScore(query, importantFile.path);
      if (lexScore === 0) continue;

      const existing = fileScores.get(importantFile.path);
      if (!existing || lexScore > existing.components.lexicalScore) {
        const reason: SelectionReason = {
          type: "lexical_match",
          detail: `path contains '${query}'`,
          score: lexScore,
          component: "lexicalScore",
          evidence: `file path: ${importantFile.path}`,
        };

        if (!existing) {
          fileScores.set(importantFile.path, {
            finalScore: 0,
            components: {
              lexicalScore: lexScore,
              symbolScore: 0,
              gitRecencyScore: 0,
              pathProximityScore: 0,
              testProximityScore: 0,
              importGraphScore: 0,
            },
            reasons: [reason],
            symbols: [],
          });
        } else {
          existing.components.lexicalScore = lexScore;
          existing.reasons.push(reason);
        }
      }
    }

    // 5. Compute remaining components for all candidate files
    for (const [filePath, entry] of fileScores) {
      // Git recency
      const gitResult = computeGitRecencyScore(filePath, gitContext);
      entry.components.gitRecencyScore = gitResult.score;
      if (gitResult.evidence) {
        entry.reasons.push({
          type: "git_match",
          detail: gitResult.evidence,
          score: gitResult.score,
          component: "gitRecencyScore",
        });
      }

      // Test proximity
      const testResult = computeTestProximityScore(filePath);
      entry.components.testProximityScore = testResult.score;
      if (testResult.evidence) {
        entry.reasons.push({
          type: "test_proximity",
          detail: testResult.evidence,
          score: testResult.score,
          component: "testProximityScore",
        });
      }

      // Compute final weighted score
      entry.finalScore = this.computeFinalScore(entry.components, weights);
    }

    // 6. Path proximity (requires final scores of other files)
    for (const [filePath, entry] of fileScores) {
      entry.components.pathProximityScore = computePathProximityScore(
        filePath,
        fileScores
      );
      if (entry.components.pathProximityScore > 0) {
        entry.reasons.push({
          type: "path_proximity",
          detail: "near other selected files",
          score: entry.components.pathProximityScore,
          component: "pathProximityScore",
        });
      }
      // Recompute final score with path proximity
      entry.finalScore = this.computeFinalScore(entry.components, weights);
    }

    // 7. Import graph score
    const selectedFilePaths = new Set(
      Array.from(fileScores.keys()).sort((a, b) => {
        const entryA = fileScores.get(a)!;
        const entryB = fileScores.get(b)!;
        return entryB.finalScore - entryA.finalScore;
      }).slice(0, maxFiles)
    );

    for (const [filePath, entry] of fileScores) {
      const importResult = computeImportGraphScore(
        filePath,
        repoMap,
        selectedFilePaths
      );
      entry.components.importGraphScore = importResult.score;
      if (importResult.evidence) {
        entry.reasons.push({
          type: "import_graph",
          detail: importResult.evidence,
          score: importResult.score,
          component: "importGraphScore",
        });
      }
      // Recompute final score with import graph
      entry.finalScore = this.computeFinalScore(entry.components, weights);
    }

    // 8. Sort by final score and truncate
    const sortedFiles = Array.from(fileScores.entries())
      .sort(([, a], [, b]) => b.finalScore - a.finalScore)
      .slice(0, maxFiles);

    // 9. Build results
    if (explain) {
      const explainedFiles: ExplainedFileSelection[] = sortedFiles.map(
        ([filePath, entry]) => {
          // Validate reasons before adding to explained output
          const validatedReasons = validateSelectionReasons(
            entry.reasons,
            filePath,
            entry.symbols,
            gitContext,
            repoMap
          );

          return {
            path: filePath,
            finalScore: entry.finalScore,
            components: { ...entry.components },
            reasons: validatedReasons,
            topEvidence: validatedReasons
              .slice(0, 3)
              .map((r) => r.evidence ?? r.detail),
          };
        }
      );

      const repoMapSlice = this.buildRepoMapSlice(repoMap, budget, explainedFiles.map(f => f.path));
      const totalTokens = this.estimateTokens(repoMapSlice, explainedFiles.map(f => f.path));

      return {
        selectedFiles: explainedFiles,
        repoMapSlice,
        totalTokens,
        scoringWeights: weights,
      };
    }

    // Legacy path: return SelectionResult
    const selectedFiles: SelectedFile[] = sortedFiles.map(
      ([filePath, entry]) => ({
        path: filePath,
        reason: entry.reasons[0] ?? {
          type: "symbol_match" as const,
          detail: "matched",
          score: entry.finalScore,
        },
        relevanceScore: entry.finalScore,
        symbols: entry.symbols,
      })
    );

    const repoMapSlice = this.buildRepoMapSlice(repoMap, budget, selectedFiles.map(f => f.path));
    const totalTokens = this.estimateTokens(repoMapSlice, selectedFiles.map(f => f.path));

    // Collect unique reasoning entries
    const reasoningSet = new Map<string, SelectionReason>();
    for (const [, entry] of sortedFiles) {
      for (const reason of entry.reasons) {
        const key = `${reason.type}:${reason.detail}`;
        reasoningSet.set(key, reason);
      }
    }

    return {
      selectedFiles,
      repoMapSlice,
      totalTokens,
      reasoning: Array.from(reasoningSet.values()),
    };
  }

  private computeFinalScore(
    components: FileScoreComponents,
    weights: Record<keyof FileScoreComponents, number>
  ): number {
    return (
      components.lexicalScore * weights.lexicalScore +
      components.symbolScore * weights.symbolScore +
      components.gitRecencyScore * weights.gitRecencyScore +
      components.pathProximityScore * weights.pathProximityScore +
      components.testProximityScore * weights.testProximityScore +
      components.importGraphScore * weights.importGraphScore
    );
  }

  private buildRepoMapSlice(
    repoMap: RepoMap,
    budget: RepoMapBudget,
    selectedPaths: string[]
  ): RepoMap {
    const selectedSet = new Set(selectedPaths);

    // Filter and limit each section
    let exportedSymbols = repoMap.exportedSymbols
      .filter((s) => selectedSet.has(s.file))
      .slice(0, budget.maxExportedSymbols);

    let moduleGraph = repoMap.moduleGraph
      .filter((e) => selectedSet.has(e.file))
      .slice(0, budget.maxModuleEdges);

    let importantFiles = repoMap.importantFiles
      .filter((f) => selectedSet.has(f.path))
      .slice(0, budget.maxImportantFiles);

    // Filter test associations to only those where both test and source are selected
    let testAssociations = (repoMap.testAssociations ?? [])
      .filter((a) => selectedSet.has(a.testFile) && selectedSet.has(a.sourceFile));

    // Apply strict token budget trimming
    const { trimToTokenBudget } = this;
    const slice: RepoMap = {
      ...repoMap,
      exportedSymbols,
      moduleGraph,
      importantFiles,
      testAssociations,
    };

    // Apply proportional trimming to stay within budget
    const trimmed = trimToTokenBudget(slice, budget.maxTokens);
    return trimmed;
  }

  /**
   * Apply proportional token budget trimming to a RepoMap slice.
   * Allocation: 40% structure/packages, 30% symbols, 20% module graph, 10% important files.
   */
  private trimToTokenBudget(repoMap: RepoMap, maxTokens: number): RepoMap {
    const estimateTokensForObject = (obj: unknown): number => {
      return Math.ceil(JSON.stringify(obj).length / 4);
    };

    const structureTokens = estimateTokensForObject({
      generatedAt: repoMap.generatedAt,
      root: repoMap.root,
      structure: repoMap.structure,
      packages: repoMap.packages,
    });
    const symbolTokens = estimateTokensForObject(repoMap.exportedSymbols);
    const graphTokens = estimateTokensForObject(repoMap.moduleGraph);
    const filesTokens = estimateTokensForObject(repoMap.importantFiles);
    const assocTokens = estimateTokensForObject(repoMap.testAssociations);

    const totalEstimate =
      structureTokens + symbolTokens + graphTokens + filesTokens + assocTokens;

    // If within budget, return as-is with token estimate
    if (totalEstimate <= maxTokens) {
      return { ...repoMap, tokenEstimate: totalEstimate };
    }

    // Proportional budget allocation
    const BUDGET_ALLOC = { structure: 0.4, symbols: 0.3, moduleGraph: 0.2, importantFiles: 0.1 };
    const symbolBudget = Math.floor(maxTokens * BUDGET_ALLOC.symbols);
    const graphBudget = Math.floor(maxTokens * BUDGET_ALLOC.moduleGraph);
    const filesBudget = Math.floor(maxTokens * BUDGET_ALLOC.importantFiles);

    const trimmed = { ...repoMap };

    // Trim symbols
    if (symbolTokens > symbolBudget && trimmed.exportedSymbols.length > 0) {
      const ratio = symbolBudget / Math.max(1, symbolTokens);
      const keepCount = Math.max(1, Math.floor(trimmed.exportedSymbols.length * ratio));
      trimmed.exportedSymbols = trimmed.exportedSymbols.slice(0, keepCount);
    }

    // Trim module graph
    if (graphTokens > graphBudget && trimmed.moduleGraph.length > 0) {
      const ratio = graphBudget / Math.max(1, graphTokens);
      const keepCount = Math.max(1, Math.floor(trimmed.moduleGraph.length * ratio));
      trimmed.moduleGraph = trimmed.moduleGraph.slice(0, keepCount);
    }

    // Trim important files
    if (filesTokens > filesBudget && trimmed.importantFiles.length > 0) {
      const ratio = filesBudget / Math.max(1, filesTokens);
      const keepCount = Math.max(1, Math.floor(trimmed.importantFiles.length * ratio));
      trimmed.importantFiles = trimmed.importantFiles.slice(0, keepCount);
    }

    // Recalculate
    const newTotal =
      estimateTokensForObject({
        generatedAt: trimmed.generatedAt,
        root: trimmed.root,
        structure: trimmed.structure,
        packages: trimmed.packages,
      }) +
      estimateTokensForObject(trimmed.exportedSymbols) +
      estimateTokensForObject(trimmed.moduleGraph) +
      estimateTokensForObject(trimmed.importantFiles) +
      estimateTokensForObject(trimmed.testAssociations);

    return { ...trimmed, tokenEstimate: newTotal };
  }

  private estimateTokens(repoMap: RepoMap, selectedPaths: string[]): number {
    const repoMapSize = JSON.stringify(repoMap).length;
    const filePathsLength = selectedPaths.reduce((sum, p) => sum + p.length, 0);
    return Math.ceil((repoMapSize + filePathsLength) / 4);
  }
}