export type LanguageHint =
  | "typescript"
  | "javascript"
  | "json"
  | "yaml"
  | "markdown"
  | "css"
  | "html"
  | "unknown";

export interface Location {
  uri: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

export type SymbolKind =
  | "function"
  | "method"
  | "class"
  | "interface"
  | "type"
  | "enum"
  | "constant"
  | "variable"
  | "property"
  | "parameter"
  | "namespace"
  | "module";

export type Visibility = "exported" | "internal" | "private" | "protected";

export type SelectionReasonType =
  | "symbol_match"
  | "file_name_match"
  | "directory_match"
  | "config_match"
  | "test_match"
  | "git_match"
  | "recent_change"
  | "import_graph"
  | "lexical_match"
  | "path_proximity"
  | "test_proximity";

export interface IndexedSymbol {
  id: string;
  name: string;
  kind: SymbolKind;
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  visibility: Visibility;
  signatures?: string[];
  extends?: string[];
  implements?: string[];
  imports?: string[];
  exports?: string[];
  docComment?: string;
  scope?: string;
}

export interface FileEntry {
  path: string;
  absolutePath: string;
  size: number;
  mtime: number;
  language: LanguageHint;
  isTest: boolean;
  isConfig: boolean;
  isBuild: boolean;
}

export interface ScanOptions {
  ignores?: string[];
  maxDepth?: number;
  maxFileSize?: number;
  includeLanguages?: LanguageHint[];
}

export interface ScanStats {
  totalFiles: number;
  totalDirs: number;
  byLanguage: Record<string, number>;
  ignoredFiles: number;
  scanTimeMs: number;
}

export interface ChangedFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed" | "copied" | "unmerged";
  hunks?: string[];
}

export interface CommitInfo {
  hash: string;
  message: string;
  author: string;
  date: number;
  filesChanged: number;
}

export interface GitContext {
  root: string;
  branch: string;
  branches: string[];
  remoteUrl?: string;
  lastModified: Map<string, number>;
  changedFiles: ChangedFile[];
  recentCommits: CommitInfo[];
  stagedFiles: string[];
  unstagedFiles: string[];
  untrackedFiles: string[];
  hasUncommittedChanges: boolean;
}

export interface PackageInfo {
  path: string;
  name: string;
  version: string;
  scripts: Record<string, string>;
  dependencies: string[];
  devDependencies: string[];
}

export interface ExportedSymbol {
  name: string;
  kind: SymbolKind;
  file: string;
  line: number;
  signature?: string;
  doc?: string;
}

export interface ModuleGraphEntry {
  file: string;
  imports: string[];
  exports: string[];
}

export interface ImportantFile {
  path: string;
  purpose: string;
  lineCount: number;
  exportsCount: number;
}

export interface RepoMap {
  generatedAt: number;
  root: string;
  structure: {
    totalFiles: number;
    totalDirs: number;
    byLanguage: Record<string, number>;
    testFileCount: number;
    configFileCount: number;
  };
  packages: PackageInfo[];
  exportedSymbols: ExportedSymbol[];
  moduleGraph: ModuleGraphEntry[];
  importantFiles: ImportantFile[];
  /** Optional test file to source file associations */
  testAssociations?: TestAssociation[];
  /** Estimated token count for this repo map (post-trimming) */
  tokenEstimate?: number;
}

export interface SelectedFile {
  path: string;
  reason: SelectionReason;
  relevanceScore: number;
  content?: string;
  symbols?: IndexedSymbol[];
}

/**
 * Selection reason with component attribution for explainability.
 */
export interface SelectionReason {
  type: SelectionReasonType;
  detail: string;
  score: number;
  /** Which scoring component this reason belongs to */
  component?: keyof FileScoreComponents;
  /** Human-readable evidence for this selection */
  evidence?: string;
}

export interface SelectionResult {
  selectedFiles: SelectedFile[];
  repoMapSlice: RepoMap;
  gitContext?: GitContext;
  totalTokens: number;
  reasoning: SelectionReason[];
}

export interface SelectionOptions {
  maxFiles?: number;
  maxSymbols?: number;
  maxRepoMapTokens?: number;
  includeGitContext?: boolean;
  includeFileTree?: boolean;
  includeTests?: boolean;
}

export interface LSPDocumentSymbol {
  name: string;
  kind: string;
  location: Location;
  children?: LSPDocumentSymbol[];
  detail?: string;
}

export interface LSPHover {
  contents: string;
  range?: Location;
}

export interface LSPDiagnostic {
  severity: "error" | "warning" | "info" | "hint";
  message: string;
  range: Location;
  code?: string | number;
  source?: string;
}

export interface ILSPAdapter {
  start(root: string): Promise<void>;
  stop(): void;
  isReady(): boolean;
  getDocumentSymbols(file: string): Promise<LSPDocumentSymbol[]>;
  gotoDefinition(file: string, line: number, column: number): Promise<Location | null>;
  findReferences(file: string, line: number, column: number): Promise<Location[]>;
  getHover(file: string, line: number, column: number): Promise<LSPHover | null>;
  getDiagnostics(file: string): Promise<LSPDiagnostic[]>;
}

export interface ICodeGraphAdapter {
  name: string;
  isAvailable(root: string): Promise<boolean>;
  explore(query: string): Promise<CodeGraphResult[]>;
  getCallers(symbolName: string): Promise<CodeGraphResult[]>;
  getCallees(symbolName: string): Promise<CodeGraphResult[]>;
}

export interface CodeGraphResult {
  symbol: string;
  file: string;
  line: number;
  column: number;
  kind: string;
  callers?: string[];
  callees?: string[];
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  language?: LanguageHint;
  children?: FileTreeNode[];
}

export interface BuildContextOptions extends SelectionOptions {
  workspaceRoot: string;
  prompt: string;
  loadFileContent?: boolean;
  includeLSP?: boolean;
  includeFileTree?: boolean;
}

export interface ContextMessage {
  role: "system";
  content: string;
  metadata?: {
    files?: string[];
    symbols?: string[];
    repoMap?: RepoMap;
  };
}

export interface BuiltContext {
  workspaceRoot: string;
  prompt: string;
  selectedFiles: SelectedFile[];
  repoMap: RepoMap;
  fileTree?: FileTreeNode;
  gitContext?: GitContext;
  lspDiagnostics?: Record<string, LSPDiagnostic[]>;
  totalTokens: number;
  generatedAt: number;
  toMessages(): ContextMessage[];
}

export interface IndexStats {
  totalSymbols: number;
  totalFiles: number;
  indexedAt: number;
}

export const DEFAULT_IGNORES = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".turbo",
  "coverage",
  ".nyc_output",
  ".cache",
  "__pycache__",
  ".pytest_cache",
  "*.pyc",
  ".next",
  ".nuxt",
  ".output",
  ".vercel",
  ".netlify",
  "dist-ssr",
  ".tsbuildinfo",
  ".env",
  ".env.*",
  "*.log",
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
];

/**
 * Multi-dimensional scoring components for file selection explainability.
 * Each component is scored 0-1 independently, then weighted and combined.
 */
export interface FileScoreComponents {
  /** Substring match in file path (not just file name) */
  lexicalScore: number;
  /** Match quality of symbols in this file */
  symbolScore: number;
  /** File was modified in last 30 days (from git) */
  gitRecencyScore: number;
  /** Close to other high-scoring files in directory tree */
  pathProximityScore: number;
  /** Is a test file for a selected source file */
  testProximityScore: number;
  /** Imports or is imported by selected files */
  importGraphScore: number;
}

/**
 * File selection with per-component scoring breakdown.
 */
export interface ExplainedFileSelection {
  path: string;
  finalScore: number;
  components: FileScoreComponents;
  reasons: SelectionReason[];
  topEvidence: string[];
}

/**
 * Selection result with optional explainability.
 */
export interface ExplainedSelectionResult {
  selectedFiles: ExplainedFileSelection[];
  repoMapSlice: RepoMap;
  totalTokens: number;
  scoringWeights: Record<keyof FileScoreComponents, number>;
}

/** Token budget configuration for RepoMap */
export interface RepoMapBudget {
  maxTokens: number;
  maxExportedSymbols: number;
  maxModuleEdges: number;
  maxImportantFiles: number;
  /** Include test files in important files and test associations. Default: true */
  includeTests?: boolean;
  /** Include package.json scripts as architecture signals. Default: true */
  includePackageScripts?: boolean;
}

/** Architecture signal extracted from package.json scripts */
export interface ArchitectureSignal {
  script: string;
  command: string;
  category: "build" | "test" | "dev" | "lint" | "typecheck" | "other";
}

/** Extended PackageInfo with architecture signals */
export interface PackageInfo {
  path: string;
  name: string;
  version: string;
  scripts: Record<string, string>;
  dependencies: string[];
  devDependencies: string[];
  /** Architecture signals derived from scripts */
  architectureSignals?: ArchitectureSignal[];
}

/** Association between a test file and its source file */
export interface TestAssociation {
  testFile: string;
  sourceFile: string;
  pattern: "test_suffix" | "spec_suffix" | "dunder_tests";
}

/** Default scoring weights for file selection */
export const DEFAULT_SCORING_WEIGHTS: Record<keyof FileScoreComponents, number> = {
  lexicalScore: 0.15,
  symbolScore: 0.35,
  gitRecencyScore: 0.15,
  pathProximityScore: 0.10,
  testProximityScore: 0.10,
  importGraphScore: 0.15,
};

/** Default token budget */
export const DEFAULT_REPO_MAP_BUDGET: RepoMapBudget = {
  maxTokens: 2000,
  maxExportedSymbols: 100,
  maxModuleEdges: 200,
  maxImportantFiles: 50,
  includeTests: true,
  includePackageScripts: true,
};

export const DEFAULT_LIMITS = {
  maxFileSizeBytes: 512 * 1024,
  maxDepth: 20,
  maxFilesInTree: 50_000,
  maxSymbolsPerQuery: 50,
  maxRepoMapTokens: 2000,
  maxFilesPerSelection: 20,
  maxSymbolSnippetLines: 10,
};
