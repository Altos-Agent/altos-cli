import fs from "fs";
import path from "path";
import type {
  ArchitectureSignal,
  ExportedSymbol,
  FileEntry,
  IndexedSymbol,
  ModuleGraphEntry,
  PackageInfo,
  RepoMap,
  RepoMapBudget,
  TestAssociation,
} from "../types.js";
import { DEFAULT_REPO_MAP_BUDGET } from "../types.js";
import type { SymbolIndex } from "../symbols/symbol-index.js";
import type { WorkspaceScanner } from "../scanner/workspace-scanner.js";

const ENTRY_POINT_NAMES = ["index.ts", "main.ts", "app.ts", "src/index.ts", "src/main.ts"];

/** Script categories that signal architecture */
const ARCHITECTURE_SCRIPT_CATEGORIES: Record<string, ArchitectureSignal["category"]> = {
  build: "build",
  "build:": "build",
  prepack: "build",
  "postbuild": "build",
  test: "test",
  "test:": "test",
  "test:watch": "test",
  "test:ci": "test",
  "test:coverage": "test",
  dev: "dev",
  "dev:": "dev",
  start: "dev",
  "start:": "dev",
  lint: "lint",
  "lint:": "lint",
  "lint:fix": "lint",
  typecheck: "typecheck",
  "typecheck:": "typecheck",
  tsc: "typecheck",
};

/** Test file pattern matchers */
const TEST_FILE_PATTERNS: Array<{ regex: RegExp; pattern: TestAssociation["pattern"] }> = [
  { regex: /\.test\.(ts|js|tsx|jsx)$/, pattern: "test_suffix" },
  { regex: /\.spec\.(ts|js|tsx|jsx)$/, pattern: "spec_suffix" },
  { regex: /__tests__\/.*\.ts$/, pattern: "dunder_tests" },
  { regex: /tests\/.*\.ts$/, pattern: "dunder_tests" },
];

/**
 * Estimate tokens for a string using a simple character-based approximation.
 * This is a rough estimate: ~4 characters per token on average.
 */
export function estimateTokens(str: string): number {
  return Math.ceil(str.length / 4);
}

/**
 * Estimate tokens for a JSON-serializable object.
 */
export function estimateTokensForObject(obj: unknown): number {
  return estimateTokens(JSON.stringify(obj));
}

/**
 * Determine the architecture category for a script.
 */
function categorizeScript(scriptName: string): ArchitectureSignal["category"] {
  return ARCHITECTURE_SCRIPT_CATEGORIES[scriptName] ?? "other";
}

/**
 * Extract architecture signals from package.json scripts.
 */
function extractArchitectureSignals(
  scripts: Record<string, string>,
): ArchitectureSignal[] {
  const signals: ArchitectureSignal[] = [];
  for (const [script, command] of Object.entries(scripts)) {
    const category = categorizeScript(script);
    signals.push({ script, command, category });
  }
  return signals;
}

/**
 * Get the source file path for a given test file path.
 */
function getSourceFileForTest(testFile: string): string | null {
  let sourceFile: string | null = null;

  if (/\.test\.(ts|js|tsx|jsx)$/.test(testFile)) {
    sourceFile = testFile.replace(/\.test\.(ts|js|tsx|jsx)$/, ".$1");
  } else if (/\.spec\.(ts|js|tsx|jsx)$/.test(testFile)) {
    sourceFile = testFile.replace(/\.spec\.(ts|js|tsx|jsx)$/, ".$1");
  } else if (/__tests__\//.test(testFile)) {
    sourceFile = testFile.replace(/__tests__\//, "/");
  } else if (/tests\//.test(testFile)) {
    sourceFile = testFile.replace(/tests\//, "/");
  }

  return sourceFile;
}

/**
 * Sort symbols by importance for context:
 * 1. Exported first
 * 2. Public API likely importance (classes/interfaces > functions > variables)
 * 3. Import count (symbols imported by many others rank higher)
 * 4. Git recency (recently modified files rank higher)
 */
function sortSymbols(
  symbols: IndexedSymbol[],
  _importCounts: Map<string, number>,
  _gitRecency: Map<string, number>,
): IndexedSymbol[] {
  const KIND_PRIORITY: Record<string, number> = {
    class: 0,
    interface: 1,
    type: 2,
    enum: 3,
    function: 4,
    method: 5,
    constant: 6,
    property: 7,
    variable: 8,
    namespace: 9,
    module: 10,
    parameter: 11,
  };

  return [...symbols].sort((a, b) => {
    // Exported first
    const aExported = a.visibility === "exported" ? 0 : 1;
    const bExported = b.visibility === "exported" ? 0 : 1;
    if (aExported !== bExported) return aExported - bExported;

    // Kind priority
    const aKind = KIND_PRIORITY[a.kind] ?? 99;
    const bKind = KIND_PRIORITY[b.kind] ?? 99;
    if (aKind !== bKind) return aKind - bKind;

    // Import count (higher = more important)
    const aImports = _importCounts.get(a.id) ?? 0;
    const bImports = _importCounts.get(b.id) ?? 0;
    if (aImports !== bImports) return bImports - aImports;

    // Git recency (higher mtime = more recent)
    const aMtime = _gitRecency.get(a.file) ?? 0;
    const bMtime = _gitRecency.get(b.file) ?? 0;
    return bMtime - aMtime;
  });
}

/**
 * Group symbols by their parent package/directory.
 */
function groupSymbolsByPackage(
  symbols: IndexedSymbol[],
  packages: PackageInfo[],
): Map<string, IndexedSymbol[]> {
  const groups = new Map<string, IndexedSymbol[]>();

  for (const symbol of symbols) {
    // Find the best matching package
    let bestPkg: PackageInfo | null = null;
    let bestLen = 0;

    for (const pkg of packages) {
      const relPath = path.relative(pkg.path, symbol.file);
      // Check if file is under this package
      if (!relPath.startsWith("..") && relPath !== symbol.file) {
        if (!bestPkg || pkg.path.length > bestLen) {
          bestPkg = pkg;
          bestLen = pkg.path.length;
        }
      }
    }

    const key = bestPkg?.name ?? path.dirname(symbol.file) ?? "unknown";
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(symbol);
  }

  return groups;
}

/**
 * Convert an IndexedSymbol to an ExportedSymbol for the RepoMap.
 */
function toExportedSymbol(symbol: IndexedSymbol): ExportedSymbol {
  return {
    name: symbol.name,
    kind: symbol.kind,
    file: symbol.file,
    line: symbol.line,
    signature: symbol.signatures?.[0],
    doc: symbol.docComment,
  };
}

/**
 * Budget allocation percentages for RepoMap sections.
 */
const BUDGET_ALLOCATION = {
  /** Structure and package overview */
  structure: 0.4,
  /** Exported symbols */
  symbols: 0.3,
  /** Module graph edges */
  moduleGraph: 0.2,
  /** Important files */
  importantFiles: 0.1,
} as const;

/**
 * Strict-token-budget-aware RepoMapBuilder.
 *
 * Produces bounded, token-efficient repository maps suitable for LLM context.
 */
export class RepoMapBuilder {
  /**
   * Build a budget-aware RepoMap.
   *
   * @param root Workspace root
   * @param scanner Workspace scanner
   * @param symbols Symbol index
   * @param options Budget and filter options (all optional with defaults from DEFAULT_REPO_MAP_BUDGET)
   */
  async build(
    root: string,
    scanner: WorkspaceScanner,
    symbols: SymbolIndex,
    options: Partial<RepoMapBudget> = {},
  ): Promise<RepoMap> {
    // Apply defaults then assert required to satisfy TypeScript that all fields are present
    const budget = { ...DEFAULT_REPO_MAP_BUDGET, ...options } as Required<RepoMapBudget>;

    // 1. Get all file entries from the scanner
    const files = scanner.scanSync(root);

    // 2. Find all package.json files and extract architecture signals
    const packages = this.findPackageInfos(root, files, budget.includePackageScripts ?? true);

    // 3. Compute structure metrics
    const structure = this.computeStructure(files);

    // 4. Find important files
    const importantFiles = this.findImportantFiles(
      files,
      root,
      budget.includeTests ?? true,
    );

    // 5. Populate exported symbols from symbol index with sorting and grouping
    const exportedSymbols = this.buildExportedSymbols(
      symbols,
      packages,
      budget.maxExportedSymbols,
    );

    // 6. Build module graph (imports/exports relationships)
    const moduleGraph = this.buildModuleGraph(files, budget.maxModuleEdges);

    // 7. Build test associations
    const testAssociations = this.buildTestAssociations(
      files,
      budget.includeTests ?? true,
    );

    // 8. Assemble the raw RepoMap
    const repoMap: RepoMap = {
      generatedAt: Date.now(),
      root,
      structure,
      packages,
      exportedSymbols,
      moduleGraph,
      importantFiles,
      testAssociations,
    };

    // 9. Estimate tokens and trim if needed
    const trimmed = this.trimToTokenBudget(repoMap, budget);

    return trimmed;
  }

  /**
   * Find all package.json files and parse their info.
   */
  private findPackageInfos(
    _root: string,
    files: FileEntry[],
    includeScripts: boolean,
  ): PackageInfo[] {
    const packages: PackageInfo[] = [];

    for (const file of files) {
      if (path.basename(file.path) === "package.json") {
        try {
          const content = fs.readFileSync(file.absolutePath, "utf-8");
          const pkg = JSON.parse(content);
          const pkgInfo: PackageInfo = {
            path: file.path,
            name: pkg.name ?? "",
            version: pkg.version ?? "",
            scripts: pkg.scripts ?? {},
            dependencies: Object.keys(pkg.dependencies ?? {}),
            devDependencies: Object.keys(pkg.devDependencies ?? {}),
          };

          if (includeScripts) {
            pkgInfo.architectureSignals = extractArchitectureSignals(pkgInfo.scripts);
          }

          packages.push(pkgInfo);
        } catch {
          // Skip malformed package.json files
        }
      }
    }

    return packages;
  }

  /**
   * Compute directory structure metrics from file entries.
   */
  private computeStructure(files: FileEntry[]): RepoMap["structure"] {
    const byLanguage: Record<string, number> = {};
    let testFileCount = 0;
    let configFileCount = 0;
    const uniqueDirs = new Set<string>();

    for (const file of files) {
      // Count by language
      byLanguage[file.language] = (byLanguage[file.language] ?? 0) + 1;

      // Count test files
      if (file.isTest) testFileCount++;

      // Count config files
      if (file.isConfig) configFileCount++;

      // Count unique directories
      const dir = path.dirname(file.path);
      if (dir && dir !== ".") {
        uniqueDirs.add(dir);
      }
    }

    return {
      totalFiles: files.length,
      totalDirs: uniqueDirs.size,
      byLanguage,
      testFileCount,
      configFileCount,
    };
  }

  /**
   * Find important files: entry points, config files, build files.
   */
  private findImportantFiles(
    files: FileEntry[],
    _root: string,
    includeTests: boolean,
  ): RepoMap["importantFiles"] {
    const important: RepoMap["importantFiles"] = [];
    const seen = new Set<string>();

    for (const file of files) {
      const purpose = this.getFilePurpose(file, includeTests);
      if (purpose !== null) {
        // Avoid duplicates
        if (seen.has(file.path)) continue;
        seen.add(file.path);

        let lineCount = 0;
        try {
          const content = fs.readFileSync(file.absolutePath, "utf-8");
          lineCount = content.split("\n").length;
        } catch {
          // Use 0 if we can't read the file
        }

        important.push({
          path: file.path,
          purpose,
          lineCount,
          exportsCount: 0,
        });
      }
    }

    return important;
  }

  /**
   * Determine the purpose of a file.
   */
  private getFilePurpose(file: FileEntry, includeTests: boolean): string | null {
    const name = path.basename(file.path);

    // Entry points
    if (ENTRY_POINT_NAMES.includes(name) || ENTRY_POINT_NAMES.includes(file.path)) {
      return "entry point";
    }

    // Config files
    if (file.isConfig) {
      return "configuration";
    }

    // Build files
    if (file.isBuild) {
      return "build output";
    }

    // Test files (if included)
    if (includeTests && file.isTest) {
      return "test";
    }

    return null;
  }

  /**
   * Build exported symbols list from symbol index, sorted by importance.
   */
  private buildExportedSymbols(
    symbols: SymbolIndex,
    packages: PackageInfo[],
    maxSymbols: number,
  ): ExportedSymbol[] {
    const allSymbols = symbols.getExportedSymbols();

    // Build import counts (how many symbols reference each symbol)
    const importCounts = new Map<string, number>();
    for (const sym of allSymbols) {
      if (sym.imports) {
        for (const imp of sym.imports) {
          importCounts.set(imp, (importCounts.get(imp) ?? 0) + 1);
        }
      }
    }

    // Sort symbols by importance
    const sorted = sortSymbols(allSymbols, importCounts, new Map());

    // Group by package for display
    const grouped = groupSymbolsByPackage(sorted, packages);

    // Convert to ExportedSymbol format and limit
    const result: ExportedSymbol[] = [];
    for (const [, syms] of grouped) {
      for (const sym of syms) {
        if (result.length >= maxSymbols) break;
        result.push(toExportedSymbol(sym));
      }
      if (result.length >= maxSymbols) break;
    }

    return result;
  }

  /**
   * Build module graph from source files.
   */
  private buildModuleGraph(
    files: FileEntry[],
    maxEdges: number,
  ): ModuleGraphEntry[] {
    const graph: ModuleGraphEntry[] = [];

    for (const file of files) {
      if (!file.language || file.language === "unknown") continue;

      try {
        const content = fs.readFileSync(file.absolutePath, "utf-8");
        const { imports, exports } = this.extractImportsAndExports(content, file.path);

        if (imports.length > 0 || exports.length > 0) {
          graph.push({ file: file.path, imports, exports });
        }
      } catch {
        // Skip files we can't read
      }

      if (graph.length >= maxEdges) break;
    }

    return graph;
  }

  /**
   * Extract import and export statements from file content.
   */
  private extractImportsAndExports(
    content: string,
    filePath: string,
  ): { imports: string[]; exports: string[] } {
    const imports: string[] = [];
    const exports: string[] = [];

    // Simple regex-based extraction (not full TypeScript parser)
    // Matches: import foo from 'bar'
    //          import { foo } from 'bar'
    //          import * as foo from 'bar'
    const importRe =
      /^import\s+(?:(?:[\w*{}\s,]+\s+from\s+)?['"]([^'"]+)['"]|type\s+['"]([^'"]+)['"])/gm;
    let match: RegExpExecArray | null;
    while ((match = importRe.exec(content)) !== null) {
      const modulePath = match[1] ?? match[2];
      if (modulePath) {
        // Resolve relative imports
        if (modulePath.startsWith(".")) {
          imports.push(this.resolveImportPath(modulePath, filePath));
        } else {
          imports.push(modulePath);
        }
      }
    }

    // Matches: export { foo }
    //          export foo from 'bar'
    const exportRe = /^export\s+(?:\{([^}]+)\}|default\s+|const\s+|function\s+|class\s+)/gm;
    while ((match = exportRe.exec(content)) !== null) {
      if (match[1]) {
        // Named exports
        exports.push(
          ...match[1]
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        );
      }
    }

    return { imports, exports };
  }

  /**
   * Resolve a relative import path.
   */
  private resolveImportPath(relativePath: string, fromFile: string): string {
    const dir = path.dirname(fromFile);
    return path.join(dir, relativePath).replace(/\\/g, "/");
  }

  /**
   * Build test-to-source file associations.
   */
  private buildTestAssociations(
    files: FileEntry[],
    includeTests: boolean,
  ): TestAssociation[] {
    if (!includeTests) return [];

    const associations: TestAssociation[] = [];

    for (const file of files) {
      if (!file.isTest) continue;

      const sourceFile = getSourceFileForTest(file.path);
      if (!sourceFile) continue;

      let pattern: TestAssociation["pattern"] = "test_suffix";
      for (const tp of TEST_FILE_PATTERNS) {
        if (tp.regex.test(file.path)) {
          pattern = tp.pattern;
          break;
        }
      }

      associations.push({
        testFile: file.path,
        sourceFile,
        pattern,
      });
    }

    return associations;
  }

  /**
   * Trim the RepoMap to fit within the token budget.
   * Uses proportional allocation: 40% structure, 30% symbols, 20% module graph, 10% important files.
   * Also enforces hard max* limits from the budget.
   */
  private trimToTokenBudget(repoMap: RepoMap, budget: Required<RepoMapBudget>): RepoMap {
    const maxTokens = budget.maxTokens;

    // First, enforce hard limits on all collections
    let trimmed: RepoMap = {
      ...repoMap,
      exportedSymbols: repoMap.exportedSymbols.slice(0, budget.maxExportedSymbols),
      moduleGraph: repoMap.moduleGraph.slice(0, budget.maxModuleEdges),
      importantFiles: repoMap.importantFiles.slice(0, budget.maxImportantFiles),
    };

    // Estimate current token count
    const structureTokens = estimateTokensForObject({
      generatedAt: trimmed.generatedAt,
      root: trimmed.root,
      structure: trimmed.structure,
      packages: trimmed.packages,
    });

    const symbolTokens = estimateTokensForObject(trimmed.exportedSymbols);
    const graphTokens = estimateTokensForObject(trimmed.moduleGraph);
    const filesTokens = estimateTokensForObject(trimmed.importantFiles);
    const assocTokens = estimateTokensForObject(trimmed.testAssociations ?? []);

    const totalEstimate =
      structureTokens + symbolTokens + graphTokens + filesTokens + assocTokens;

    // If within budget, return as-is with token estimate
    if (totalEstimate <= maxTokens) {
      return { ...trimmed, tokenEstimate: totalEstimate };
    }

    // Calculate proportional budgets for sections that need further trimming
    const symbolBudget = Math.floor(maxTokens * BUDGET_ALLOCATION.symbols);
    const graphBudget = Math.floor(maxTokens * BUDGET_ALLOCATION.moduleGraph);
    const filesBudget = Math.floor(maxTokens * BUDGET_ALLOCATION.importantFiles);

    // Proportional trimming only if hard limits weren't enough
    if (symbolTokens > symbolBudget && trimmed.exportedSymbols.length > 0) {
      const ratio = symbolBudget / Math.max(1, symbolTokens);
      const keepCount = Math.max(1, Math.floor(trimmed.exportedSymbols.length * ratio));
      trimmed.exportedSymbols = trimmed.exportedSymbols.slice(0, keepCount);
    }

    if (graphTokens > graphBudget && trimmed.moduleGraph.length > 0) {
      const ratio = graphBudget / Math.max(1, graphTokens);
      const keepCount = Math.max(1, Math.floor(trimmed.moduleGraph.length * ratio));
      trimmed.moduleGraph = trimmed.moduleGraph.slice(0, keepCount);
    }

    if (filesTokens > filesBudget && trimmed.importantFiles.length > 0) {
      const ratio = filesBudget / Math.max(1, filesTokens);
      const keepCount = Math.max(1, Math.floor(trimmed.importantFiles.length * ratio));
      trimmed.importantFiles = trimmed.importantFiles.slice(0, keepCount);
    }

    // Recalculate token estimate
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
      estimateTokensForObject(trimmed.testAssociations ?? []);

    return { ...trimmed, tokenEstimate: newTotal };
  }

  /**
   * Convert a RepoMap to a human-readable one-line summary.
   */
  toSummary(map: RepoMap): string {
    const langParts: string[] = [];
    for (const [lang, count] of Object.entries(map.structure.byLanguage)) {
      langParts.push(`${lang}:${count}`);
    }

    const pkgNames = map.packages
      .map((p) => p.name)
      .filter(Boolean)
      .join(",");
    const pkgStr = pkgNames ? ` | Packages: ${pkgNames}` : "";

    const tokenStr = map.tokenEstimate ? ` | Tokens: ~${map.tokenEstimate}` : "";

    return (
      `Repo: ${map.root}` +
      ` | Files: ${map.structure.totalFiles}` +
      ` (${langParts.join(", ")})` +
      pkgStr +
      ` | Tests: ${map.structure.testFileCount}` +
      ` | Configs: ${map.structure.configFileCount}` +
      tokenStr
    );
  }
}