# Repository Intelligence — Phase 8 Design Spec

## Overview

Repository intelligence turns Altos from "chat with a repo" into "codebase-aware agent." Given any user prompt, the system selects exactly the files, symbols, and relationships needed — and nothing more. Token budgets are respected by design, not by trimming after the fact.

**Design principles:**
- Surgical context: exact files needed, not the entire repo
- Token budgets are first-class constraints
- Modules are independently testable and replaceable
- LSP and CodeGraph are adapters — swappable based on availability

---

## Scope

### In Scope (Phase 8)

- Full filesystem indexing: `WorkspaceScanner`, `FileTreeIndex`
- Git context: `GitContextProvider`
- Symbol extraction: `SymbolIndex` using tree-sitter (TypeScript/JavaScript only)
- Repo map: `RepoMapBuilder` — compact, model-friendly summary
- Context selection: `RelevantFileSelector` — prompt → files
- LSP adapter: read-only operations (goto-def, find-refs, hover, document symbols)
- CodeGraph adapter: placeholder interface + stub
- CLI commands: `altos index`, `altos map`, `altos search`
- Documentation: `docs/architecture/repository-intelligence.md`
- Tests: fixture repos + unit tests

### Out of Scope (Deferred)

- Write operations (inline rename, code actions)
- Completions and live diagnostics
- Multi-language tree-sitter parsers (Python, Go, Rust, etc.)
- Full CodeGraph integration
- Incremental indexing / watch mode (flag placeholder only)

---

## Defaults & Limits

```typescript
const DEFAULT_IGNORES = [
  "node_modules", ".git", "dist", "build", "out", ".turbo",
  "coverage", ".nyc_output", ".cache", "__pycache__",
  ".pytest_cache", "*.pyc", ".next", ".nuxt", ".output",
  ".vercel", ".netlify", "dist-ssr", ".tsbuildinfo",
  ".env", ".env.*", "*.log",
  "pnpm-lock.yaml", "package-lock.json", "yarn.lock",
];

const DEFAULT_LIMITS = {
  maxFileSizeBytes: 512 * 1024,    // 512 KB
  maxDepth: 20,
  maxFilesInTree: 50_000,
  maxSymbolsPerQuery: 50,
  maxRepoMapTokens: 2000,
  maxFilesPerSelection: 20,
  maxSymbolSnippetLines: 10,
};
```

---

## Module Specifications

### 1. WorkspaceScanner

**File:** `packages/code-index/src/scanner/workspace-scanner.ts`

Walks the filesystem, discovers the repo shape, and applies ignore patterns.

```typescript
export interface ScanOptions {
  ignores?: string[];          // additional ignores beyond DEFAULT_IGNORES
  maxDepth?: number;           // default: 20
  maxFileSize?: number;        // default: 512KB
  includeLanguages?: LanguageHint[];  // filter by language
}

export interface FileEntry {
  path: string;               // relative to root
  absolutePath: string;
  size: number;
  mtime: number;
  language: LanguageHint;
  isTest: boolean;
  isConfig: boolean;
  isBuild: boolean;
}

export interface ScanStats {
  totalFiles: number;
  totalDirs: number;
  byLanguage: Record<string, number>;
  ignoredFiles: number;
  scanTimeMs: number;
}

export interface WorkspaceScanner {
  scan(root: string, options?: ScanOptions): AsyncGenerator<FileEntry>;
  scanSync(root: string, options?: ScanOptions): FileEntry[];
  getStats(): ScanStats;
}
```

**Implementation notes:**
- Uses `fs.readdir` with `withFileTypes` for efficiency
- Detects language from extension: `.ts`/`.tsx` → `typescript`, `.js`/` .jsx` → `javascript`, `.json` → `json`, etc.
- Test detection: filename matches `*.test.ts`, `*.spec.ts`, `*_test.ts`, `*.test.tsx`, `*.spec.tsx`
- Config detection: filename matches `package.json`, `tsconfig*.json`, `vite.config.*`, `next.config.*`, `tailwind.config.*`, `.eslintrc*`, `.prettierrc*`, `biome.json`, ` turbo.json`
- Uses ` micromatch` or equivalent for ignore patterns

---

### 2. FileTreeIndex

**File:** `packages/code-index/src/tree/file-tree-index.ts`

Stores the hierarchical file tree. Lightweight — names and structure only.

```typescript
export interface FileTreeNode {
  name: string;
  path: string;        // relative to root
  type: "file" | "directory";
  language?: LanguageHint;
  children?: FileTreeNode[];
}

export interface FileTreeIndex {
  build(root: string, entries: FileEntry[]): FileTreeNode;
  getNode(path: string): FileTreeNode | undefined;
  getChildren(path: string): FileTreeNode[];
  getRoot(): FileTreeNode;
  toJSON(): FileTreeNode;   // serialize for context
}
```

---

### 3. GitContextProvider

**File:** `packages/code-index/src/git/git-context-provider.ts`

Extracts git intelligence using fast, streaming git commands.

```typescript
export interface ChangedFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed" | "copied" | "unmerged";
  hunks?: string[];   // diff context, max 3 lines each
}

export interface CommitInfo {
  hash: string;
  message: string;
  author: string;
  date: number;       // unix timestamp
  filesChanged: number;
}

export interface GitContext {
  root: string;
  branch: string;
  branches: string[];
  remoteUrl?: string;
  lastModified: Map<string, number>;  // file → unix timestamp
  changedFiles: ChangedFile[];
  recentCommits: CommitInfo[];
  stagedFiles: string[];
  unstagedFiles: string[];
  untrackedFiles: string[];
  hasUncommittedChanges: boolean;
}

export interface GitContextProvider {
  getContext(root: string): Promise<GitContext>;
  getChangedFiles(root: string, since?: string): Promise<ChangedFile[]>;
  isRepo(root: string): Promise<boolean>;
}
```

**Implementation notes:**
- Uses `--porcelain=v1` and `--no-pager` for consistent output parsing
- `git log` limited to last 20 commits with `--oneline`
- Diff hunks extracted with `--unified=3 --no-color`
- Detects uncommitted changes with `git diff --name-only` and `git diff --cached --name-only`
- Non-git directories return `isRepo: false` gracefully

---

### 4. SymbolIndex

**File:** `packages/code-index/src/symbols/symbol-index.ts`

Full AST parsing with tree-sitter. TypeScript/JavaScript only in Phase 8.

```typescript
export type SymbolKind =
  | "function" | "method" | "class" | "interface"
  | "type" | "enum" | "constant" | "variable"
  | "property" | "parameter" | "namespace" | "module";

export type Visibility = "exported" | "internal" | "private" | "protected";

export interface IndexedSymbol {
  id: string;          // `${relativePath}:${line}:${column}`
  name: string;
  kind: SymbolKind;
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  visibility: Visibility;
  signatures?: string[];
  extends?: string[];      // parent class/interface names
  implements?: string[];    // interface names
  imports?: string[];       // imported module paths
  exports?: string[];       // exported names (for modules)
  docComment?: string;
  scope?: string;          // containing class/module name
}

export interface Location {
  uri: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

export interface SymbolIndex {
  indexFile(file: string, content: string): Promise<void>;
  indexFiles(files: Map<string, string>): Promise<void>;
  removeFile(file: string): void;
  getSymbol(id: string): IndexedSymbol | undefined;
  getFileSymbols(file: string): IndexedSymbol[];
  getExportedSymbols(): IndexedSymbol[];
  getSymbolsByName(name: string): IndexedSymbol[];
  search(query: string, limit?: number): IndexedSymbol[];
  findDefinition(symbolId: string): Location | undefined;
  findReferences(symbolId: string): Location[];
  getCallers(symbolId: string): Location[];
  getCallees(symbolId: string): Location[];
  clear(): void;
  getStats(): { totalSymbols: number; totalFiles: number };
}
```

**Implementation notes:**
- Uses `tree-sitter` with `@tree-sitter/typescript` and `tree-sitter-javascript`
- Symbols are indexed in a `Map<string, IndexedSymbol>` keyed by stable ID
- File symbols stored in a `Map<string, Set<string>>` (file → symbol IDs)
- Search uses case-insensitive substring match on name + signatures
- Visibility: `export` keyword → `exported`, no `export` → `internal`; class members with `#` → `private`
- Relationships (`extends`, `implements`, `imports`) extracted via AST queries
- `extends`/`implements` look at the AST node type `extends_clause` and `class_implements_clause`
- `imports` extracted from `import` and `import_require` nodes

---

### 5. RepoMapBuilder

**File:** `packages/code-index/src/repo-map/repo-map-builder.ts`

Builds the compact repo map — the summary of the codebase included in model context.

```typescript
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
  purpose: string;       // inferred: "entry point", "type definitions", "build config"
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
}

export interface RepoMapBuilder {
  build(root: string, scanner: WorkspaceScanner, symbols: SymbolIndex): Promise<RepoMap>;
  buildPartial(roots: string[]): Promise<RepoMap>;
  toSummary(map: RepoMap): string;   // human-readable one-liner summary
}
```

**Implementation notes:**
- `PackageInfo` parsed directly from `package.json` files found by scanner
- `ExportedSymbol` filtered from symbol index where `visibility === "exported"`
- `ImportantFile` determined by: entry points (`index.ts`, `main.ts`, `app.ts`), files with >10 exports, config files
- `purpose` inferred from: filename patterns (`*.config.ts`, `types.ts`, `index.ts`) and export signatures
- Repo map is serialized to JSON and can be truncated to token budget via `toSummary()`

---

### 6. RelevantFileSelector

**File:** `packages/code-index/src/selection/relevant-file-selector.ts`

Given a user prompt, selects relevant files and repo map slices.

```typescript
export interface SelectionOptions {
  maxFiles?: number;         // default: 20
  maxSymbols?: number;       // default: 50
  maxRepoMapTokens?: number;  // default: 2000
  includeGitContext?: boolean;
  includeFileTree?: boolean;
  includeTests?: boolean;    // include test files for selected source
}

export type SelectionReasonType =
  | "symbol_match"
  | "file_name_match"
  | "directory_match"
  | "config_match"
  | "test_match"
  | "git_match"
  | "recent_change"
  | "import_graph";

export interface SelectionReason {
  type: SelectionReasonType;
  detail: string;
  score: number;            // contribution to relevance score
}

export interface SelectedFile {
  path: string;
  reason: SelectionReason;
  relevanceScore: number;   // 0.0–1.0
  content?: string;          // loaded on demand
  symbols?: IndexedSymbol[]; // symbols from this file relevant to query
}

export interface SelectionResult {
  selectedFiles: SelectedFile[];
  repoMapSlice: RepoMap;
  gitContext?: GitContext;
  totalTokens: number;       // estimated
  reasoning: SelectionReason[];
}

export interface RelevantFileSelector {
  select(
    prompt: string,
    repoMap: RepoMap,
    symbols: SymbolIndex,
    options?: SelectionOptions
  ): Promise<SelectionResult>;
}
```

**Selection algorithm:**
1. **Parse prompt** — extract keywords, symbol names, file paths, directory names
2. **Symbol search** — query symbol index for name/signature matches
3. **File search** — query file tree for name/pattern matches
4. **Import graph expansion** — for each matched symbol, traverse 1-2 hops outward via import relationships
5. **Score and rank** — weight: symbol exact match (1.0) > symbol fuzzy (0.8) > file name (0.6) > directory (0.4) > git change (0.3)
6. **Filter** — apply `maxFiles`, remove duplicates
7. **Include tests** — if `includeTests: true`, add corresponding test files for selected source files
8. **Assemble** — build partial `RepoMap` slice, optionally include git context

---

### 7. LSPAdapter

**File:** `packages/code-index/src/lsp/lsp-adapter.ts`

Lightweight bridge to TypeScript/JavaScript language servers. Read-only operations only.

```typescript
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

export interface LSPAdapter {
  start(root: string): Promise<void>;
  stop(): void;
  isReady(): boolean;

  // Document symbols
  getDocumentSymbols(file: string): Promise<LSPDocumentSymbol[]>;

  // Navigation
  gotoDefinition(file: string, line: number, column: number): Promise<Location | null>;
  findReferences(file: string, line: number, column: number): Promise<Location[]>;

  // Inspection
  getHover(file: string, line: number, column: number): Promise<LSPHover | null>;
  getDiagnostics(file: string): Promise<LSPDiagnostic[]>;
}
```

**Implementation notes:**
- Starts `typescript-language-server` via stdio (or falls back to `tsserver`)
- One server instance per `root` directory (cached)
- Communicates using LSP JSON protocol over stdio
- Initialization: sends `initialize` → `initialized` → `textDocument/didOpen` for each file
- Timeouts: 5s per request, configurable
- Graceful fallback: if no LSP server available, operations return empty/null without throwing
- File content kept in sync via `textDocument/didChange` notifications

---

### 8. CodeGraphAdapter

**File:** `packages/code-index/src/codegraph/codegraph-adapter.ts`

Placeholder adapter for CodeGraph SQLite knowledge graph.

```typescript
export interface CodeGraphResult {
  symbol: string;
  file: string;
  line: number;
  column: number;
  kind: string;
  callers?: string[];
  callees?: string[];
}

export interface CodeGraphAdapter {
  name: string;
  isAvailable(root: string): Promise<boolean>;
  explore(query: string): Promise<CodeGraphResult[]>;
  getCallers(symbolName: string): Promise<CodeGraphResult[]>;
  getCallees(symbolName: string): Promise<CodeGraphResult[]>;
}
```

**Stub implementation:**
```typescript
export class StubCodeGraphAdapter implements CodeGraphAdapter {
  name = "codegraph-stub";
  
  async isAvailable(_root: string): Promise<boolean> {
    return false;   // no .codegraph/ directory
  }
  
  async explore(_query: string): Promise<CodeGraphResult[]> {
    return [];       // no-op
  }
  
  async getCallers(_symbolName: string): Promise<CodeGraphResult[]> {
    return [];
  }
  
  async getCallees(_symbolName: string): Promise<CodeGraphResult[]> {
    return [];
  }
}
```

Real implementation: uses CodeGraph MCP server when `.codegraph/` directory exists in root. Hook point is clearly documented.

---

### 9. ContextBuilder

**File:** `packages/code-index/src/context/context-builder.ts`

Orchestrates all modules to assemble a full context for a prompt.

```typescript
export interface BuildContextOptions extends SelectionOptions {
  workspaceRoot: string;
  prompt: string;
  loadFileContent?: boolean;   // default: true — whether to load file content
  includeLSP?: boolean;         // default: false — include LSP diagnostics
  includeFileTree?: boolean;   // default: false — include full file tree
}

export interface BuiltContext {
  workspaceRoot: string;
  prompt: string;
  
  // Core: what the model needs
  selectedFiles: SelectedFile[];
  repoMap: RepoMap;
  
  // Optional additions
  fileTree?: FileTreeNode;
  gitContext?: GitContext;
  lspDiagnostics?: Record<string, LSPDiagnostic[]>;
  
  // Metadata
  totalTokens: number;
  generatedAt: number;
  
  // Serialized for model
  toMessages(): ContextMessage[];   // converts to a chat-compatible format
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

export class ContextBuilder {
  constructor(config: {
    scanner: WorkspaceScanner;
    symbolIndex: SymbolIndex;
    lspAdapter?: LSPAdapter;
    codeGraphAdapter?: CodeGraphAdapter;
  });

  async build(options: BuildContextOptions): Promise<BuiltContext>;
  
  // Incremental — update index for changed files
  async indexFile(path: string, content: string): Promise<void>;
  async removeFile(path: string): Promise<void>;
  
  // Repo map access
  getRepoMap(): RepoMap;
  
  // Stats
  getIndexStats(): IndexStats;
}
```

**Context assembly:**
1. Ensure workspace is scanned (cache results)
2. Ensure symbol index is populated
3. Run `RelevantFileSelector` to get file selection
4. Optionally load file content and run LSP diagnostics
5. Assemble `BuiltContext`
6. Estimate token count and truncate if needed

---

## Package Structure

```
packages/code-index/src/
├── index.ts                      # Main exports
├── scanner/
│   ├── workspace-scanner.ts
│   └── index.ts
├── tree/
│   ├── file-tree-index.ts
│   └── index.ts
├── git/
│   ├── git-context-provider.ts
│   └── index.ts
├── symbols/
│   ├── symbol-index.ts
│   ├── tree-sitter-parser.ts     # TS/JS parsing utilities
│   └── index.ts
├── repo-map/
│   ├── repo-map-builder.ts
│   └── index.ts
├── selection/
│   ├── relevant-file-selector.ts
│   └── index.ts
├── lsp/
│   ├── lsp-adapter.ts
│   └── index.ts
├── codegraph/
│   ├── codegraph-adapter.ts
│   └── index.ts
├── context/
│   ├── context-builder.ts
│   └── index.ts
└── types.ts                      # Shared types

packages/code-index/src/types.ts
// Shared types reused across modules
export type LanguageHint = "typescript" | "javascript" | "json" | "yaml" | "markdown" | "css" | "html" | "unknown";
export interface Location { uri: string; line: number; column: number; endLine: number; endColumn: number; }
```

---

## CLI Commands

### `altos index`

```bash
altos index [path]          # index current dir or specified path
altos index --force         # force rebuild (skip cache)
altos index --stats         # show index statistics
altos index --json          # JSON output
altos index --quiet         # minimal output
```

**Exit codes:** `0` success, `1` scan error, `2` parse error, `3` no workspace found

### `altos map`

```bash
altos map [path]             # show repo map for current dir or specified path
altos map --focus src/       # focus on subdirectory
altos map --exports          # show only exported symbols
altos map --packages         # show only package info
altos map --important        # show only important files
altos map --json             # machine-readable output
altos map --no-color         # plain text output
```

**Exit codes:** `0` success, `1` workspace error, `2` not indexed yet (run `altos index` first)

### `altos search`

```bash
altos search <query> [path]   # search symbols by name
altos search <query> --refs  # also find references
altos search --file "*.test.ts"   # search files by pattern
altos search --kind class     # filter by symbol kind
altos search --json           # machine-readable output
altos search --limit 20      # limit results
```

**Exit codes:** `0` success, `1` search error, `2` not indexed yet

---

## Configuration

Via `altos.config.json` or environment variables:

```json
{
  "codeIndex": {
    "ignores": ["vendor", ".foo"],
    "maxFileSize": 1024000,
    "maxDepth": 15,
    "includeLanguages": ["typescript", "javascript"],
    "lspEnabled": true,
    "codeGraphEnabled": false
  }
}
```

Environment variables:
- `ALTOS_CODE_INDEX_IGNORES` — comma-separated list
- `ALTOS_CODE_INDEX_MAX_FILE_SIZE` — bytes
- `ALTOS_CODE_INDEX_LSP_ENABLED` — `true`/`false`

---

## Test Fixtures

```
packages/code-index/fixtures/
├── simple-ts/
│   ├── src/
│   │   ├── index.ts           # entry point, re-exports
│   │   ├── foo.ts             # class Foo, function getFoo
│   │   ├── bar.ts             # interface Bar, type BarOptions
│   │   └── utils/
│   │       ├── math.ts        # pure functions
│   │       └── strings.ts     # string utilities
│   ├── test/
│   │   └── foo.test.ts        # tests for Foo
│   ├── package.json
│   └── tsconfig.json
├── multi-package/
│   ├── packages/
│   │   ├── pkg-a/
│   │   │   ├── src/index.ts   # exported function a()
│   │   │   └── package.json
│   │   └── pkg-b/
│   │       ├── src/index.ts   # imports from pkg-a
│   │       └── package.json
│   ├── package.json
│   └── tsconfig.json
└── with-git/
    ├── src/index.ts
    ├── package.json
    └── .git/                  # real git repo with history
```

---

## Test Cases

### WorkspaceScanner
- Scans ignores node_modules, .git, dist
- Respects additional ignores
- Detects max depth boundary
- Correctly identifies test files, config files, build artifacts
- Handles empty directories
- Handles permission errors gracefully (skip and log)

### SymbolIndex
- Indexes TypeScript function declarations
- Extracts class with methods, properties, constructor
- Extracts interface with property signatures
- Extracts type aliases and enums
- Correct visibility: exported vs internal
- `extends` and `implements` relationships
- Search finds symbols by name (exact and substring)

### RepoMapBuilder
- Counts files by language correctly
- Extracts package info from package.json
- Filters to exported symbols only
- Identifies entry points
- Builds module graph from imports/exports

### RelevantFileSelector
- Exact symbol name match ranks highest
- Import graph expansion includes indirect dependencies
- File name match in relevant directory scores higher
- Test files included when `includeTests: true`
- Respects `maxFiles` limit
- Empty prompt returns minimal context

### LSPAdapter (with mock)
- Starts and stops server cleanly
- Returns document symbols for a file
- gotoDefinition returns correct location
- findReferences returns all references
- Gracefully handles unavailable server

### CodeGraphAdapter (stub)
- `isAvailable` returns `false` when no `.codegraph/` dir
- All query methods return empty array

---

## Token Budget Strategy

1. **Repo map first** — always include the repo map (compact summary, ~500-2000 tokens)
2. **Selected files next** — add file contents up to budget
3. **Truncate from bottom** — lowest-scored files dropped last
4. **Symbol snippets** — when adding symbols, use `maxSymbolSnippetLines: 10` to limit
5. **No full repo dump** — never include all files; always filter

Token estimation: `≈ 4 * (chars in content)` for mixed English/code. Rough estimate used for fast pruning.

---

## Future Extension Points

- **Incremental indexing**: watch mode via `chokidar` or native fs watchers
- **Multi-language parsers**: tree-sitter parsers for Python, Go, Rust, etc.
- **Write operations**: LSP code actions, inline rename via adapter
- **Vector search**: embed symbols and use similarity search for semantic queries
- **CodeGraph full integration**: wire up CodeGraph MCP server when available
- **Cross-repo navigation**: handle monorepo boundaries for goto-definition across packages

---

## Dependencies

```json
{
  "tree-sitter": "^0.21.0",
  "tree-sitter-typescript": "^0.21.0",
  "tree-sitter-javascript": "^0.21.0",
  "micromatch": "^4.0.0"
}
```

Dev dependencies for testing:
- Real fixture repos with TypeScript source

---

## Files to Create

```
packages/code-index/src/
├── index.ts                          # Updated: add all new exports
├── types.ts                          # NEW: shared types
├── scanner/
│   ├── workspace-scanner.ts           # NEW
│   └── index.ts                       # NEW
├── tree/
│   ├── file-tree-index.ts             # NEW
│   └── index.ts                       # NEW
├── git/
│   ├── git-context-provider.ts        # NEW
│   └── index.ts                       # NEW
├── symbols/
│   ├── symbol-index.ts                # NEW
│   ├── tree-sitter-parser.ts          # NEW
│   └── index.ts                       # NEW
├── repo-map/
│   ├── repo-map-builder.ts            # NEW
│   └── index.ts                       # NEW
├── selection/
│   ├── relevant-file-selector.ts      # NEW
│   └── index.ts                       # NEW
├── lsp/
│   ├── lsp-adapter.ts                 # NEW
│   └── index.ts                       # NEW
├── codegraph/
│   ├── codegraph-adapter.ts           # NEW
│   └── index.ts                       # NEW
└── context/
    ├── context-builder.ts             # NEW
    └── index.ts                       # NEW

packages/code-index/fixtures/
├── simple-ts/
│   ├── src/index.ts
│   ├── src/foo.ts
│   ├── src/bar.ts
│   ├── src/utils/math.ts
│   ├── src/utils/strings.ts
│   ├── test/foo.test.ts
│   ├── package.json
│   └── tsconfig.json
├── multi-package/
│   ├── package.json
│   ├── tsconfig.json
│   └── packages/
│       ├── pkg-a/src/index.ts
│       ├── pkg-a/package.json
│       ├── pkg-b/src/index.ts
│       └── pkg-b/package.json
└── with-git/
    ├── src/index.ts
    └── package.json

docs/architecture/repository-intelligence.md   # NEW
```

---

## Done Criteria

- [ ] `WorkspaceScanner` — scans ignores, detects types, stats
- [ ] `FileTreeIndex` — builds tree, serialize/deserialize
- [ ] `GitContextProvider` — git state, changed files, recent commits
- [ ] `SymbolIndex` — tree-sitter TS/JS parsing, symbol extraction, search
- [ ] `RepoMapBuilder` — compact summary, package info, exported symbols
- [ ] `RelevantFileSelector` — prompt → files, scoring, truncation
- [ ] `LSPAdapter` — start/stop, read-only LSP operations
- [ ] `CodeGraphAdapter` — placeholder interface + stub
- [ ] `ContextBuilder` — orchestrates all modules
- [ ] CLI `altos index` — scan and index workspace
- [ ] CLI `altos map` — display repo map
- [ ] CLI `altos search` — search symbols
- [ ] `docs/architecture/repository-intelligence.md` — full documentation
- [ ] Tests — unit tests + fixture repos
- [ ] All packages build without errors
- [ ] All tests pass
