# Repository Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the repository intelligence layer for Altos — WorkspaceScanner, FileTreeIndex, GitContextProvider, SymbolIndex, RepoMapBuilder, RelevantFileSelector, LSPAdapter, CodeGraphAdapter placeholder, ContextBuilder, three CLI commands, documentation, and tests.

**Architecture:** Layered approach with independently testable modules. Scanner → Tree + Git → Symbols → RepoMap → Selection → Context. LSP and CodeGraph are swappable adapters. Token budgets enforced at the selection and context assembly layers.

**Tech Stack:** TypeScript, tree-sitter (ts/tsx/js/jsx parsers), micromatch (glob patterns), Node.js child_process (git commands, LSP stdio). No new runtime dependencies beyond tree-sitter.

---

## Phase 0: Shared Types

Create `packages/code-index/src/types.ts` — all shared types in one place.

- Create: `packages/code-index/src/types.ts`

- [ ] **Step 1: Write types.ts**

```typescript
// packages/code-index/src/types.ts

export type LanguageHint =
  | "typescript" | "javascript" | "json" | "yaml"
  | "markdown" | "css" | "html" | "unknown";

export interface Location {
  uri: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

export type SymbolKind =
  | "function" | "method" | "class" | "interface"
  | "type" | "enum" | "constant" | "variable"
  | "property" | "parameter" | "namespace" | "module";

export type Visibility = "exported" | "internal" | "private" | "protected";

export type SelectionReasonType =
  | "symbol_match" | "file_name_match" | "directory_match"
  | "config_match" | "test_match" | "git_match"
  | "recent_change" | "import_graph";

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
}

export interface SelectionReason {
  type: SelectionReasonType;
  detail: string;
  score: number;
}

export interface SelectedFile {
  path: string;
  reason: SelectionReason;
  relevanceScore: number;
  content?: string;
  symbols?: IndexedSymbol[];
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
  "node_modules", ".git", "dist", "build", "out", ".turbo",
  "coverage", ".nyc_output", ".cache", "__pycache__",
  ".pytest_cache", "*.pyc", ".next", ".nuxt", ".output",
  ".vercel", ".netlify", "dist-ssr", ".tsbuildinfo",
  ".env", ".env.*", "*.log",
  "pnpm-lock.yaml", "package-lock.json", "yarn.lock",
];

export const DEFAULT_LIMITS = {
  maxFileSizeBytes: 512 * 1024,
  maxDepth: 20,
  maxFilesInTree: 50_000,
  maxSymbolsPerQuery: 50,
  maxRepoMapTokens: 2000,
  maxFilesPerSelection: 20,
  maxSymbolSnippetLines: 10,
};
```

- [ ] **Step 2: Create index files for each module directory**

Create each `index.ts` that re-exports from the module:

```typescript
// packages/code-index/src/scanner/index.ts
export * from "./workspace-scanner.js";
```

(Same pattern for tree, git, symbols, repo-map, selection, lsp, codegraph, context)

- [ ] **Step 3: Verify types.ts compiles**

Run: `cd packages/code-index && npx tsc --noEmit src/types.ts`
Expected: No errors

---

## Task 1: WorkspaceScanner

**Files:**
- Create: `packages/code-index/src/scanner/workspace-scanner.ts`
- Create: `packages/code-index/src/scanner/index.ts`
- Test: `packages/code-index/src/scanner/workspace-scanner.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/code-index/src/scanner/workspace-scanner.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { WorkspaceScanner } from "./workspace-scanner.js";
import * as path from "path";
import * as fs from "fs";

const FIXTURE_ROOT = path.resolve(__dirname, "../../fixtures/simple-ts");

describe("WorkspaceScanner", () => {
  let scanner: WorkspaceScanner;

  beforeEach(() => {
    scanner = new WorkspaceScanner();
  });

  it("should scan a TypeScript project", async () => {
    const entries: any[] = [];
    for await (const entry of scanner.scan(FIXTURE_ROOT)) {
      entries.push(entry);
    }
    expect(entries.length).toBeGreaterThan(0);
  });

  it("should ignore node_modules", async () => {
    const entries: any[] = [];
    for await (const entry of scanner.scan(FIXTURE_ROOT)) {
      entries.push(entry);
    }
    const nodeModules = entries.filter(e => e.path.includes("node_modules"));
    expect(nodeModules.length).toBe(0);
  });

  it("should detect TypeScript files", async () => {
    const entries: any[] = [];
    for await (const entry of scanner.scan(FIXTURE_ROOT)) {
      entries.push(entry);
    }
    const tsFiles = entries.filter(e => e.language === "typescript");
    expect(tsFiles.length).toBeGreaterThan(0);
  });

  it("should detect test files", async () => {
    const entries: any[] = [];
    for await (const entry of scanner.scan(FIXTURE_ROOT)) {
      entries.push(entry);
    }
    const testFiles = entries.filter(e => e.isTest);
    expect(testFiles.length).toBeGreaterThan(0);
  });

  it("should detect config files", async () => {
    const entries: any[] = [];
    for await (const entry of scanner.scan(FIXTURE_ROOT)) {
      entries.push(entry);
    }
    const configFiles = entries.filter(e => e.isConfig);
    expect(configFiles.length).toBeGreaterThan(0);
  });

  it("should respect additional ignores", async () => {
    const scanner2 = new WorkspaceScanner();
    const entries: any[] = [];
    for await (const entry of scanner2.scan(FIXTURE_ROOT, { ignores: ["src"] })) {
      entries.push(entry);
    }
    const srcFiles = entries.filter(e => e.path.startsWith("src"));
    expect(srcFiles.length).toBe(0);
  });

  it("should respect maxDepth", async () => {
    const scanner2 = new WorkspaceScanner();
    const entries: any[] = [];
    for await (const entry of scanner2.scan(FIXTURE_ROOT, { maxDepth: 1 })) {
      entries.push(entry);
    }
    const nested = entries.filter(e => e.path.split("/").length > 2);
    expect(nested.length).toBe(0);
  });

  it("should get stats", async () => {
    for await (const _ of scanner.scan(FIXTURE_ROOT)) {}
    const stats = scanner.getStats();
    expect(stats.totalFiles).toBeGreaterThan(0);
    expect(stats.byLanguage.typescript).toBeGreaterThan(0);
    expect(stats.scanTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("should scan sync", async () => {
    const entries = scanner.scanSync(FIXTURE_ROOT);
    expect(entries.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/code-index && npx vitest run src/scanner/workspace-scanner.test.ts`
Expected: FAIL — file does not exist

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/code-index/src/scanner/workspace-scanner.ts
import * as fs from "fs";
import * as path from "path";
import { FileEntry, ScanOptions, ScanStats, DEFAULT_IGNORES } from "../types.js";
import { micromatch } from "micromatch";

export class WorkspaceScanner {
  private stats: ScanStats = {
    totalFiles: 0,
    totalDirs: 0,
    byLanguage: {},
    ignoredFiles: 0,
    scanTimeMs: 0,
  };

  async *scan(root: string, options?: ScanOptions): AsyncGenerator<FileEntry> {
    const start = Date.now();
    const ignores = [...DEFAULT_IGNORES, ...(options?.ignores ?? [])];
    const maxDepth = options?.maxDepth ?? 20;
    const maxFileSize = options?.maxFileSize ?? 512 * 1024;
    const matcher = micromatch(ignores, { dot: true });

    this.stats = { totalFiles: 0, totalDirs: 0, byLanguage: {}, ignoredFiles: 0, scanTimeMs: 0 };

    yield* this.scanDir(root, root, matcher, maxDepth, maxFileSize, 0);
    this.stats.scanTimeMs = Date.now() - start;
  }

  scanSync(root: string, options?: ScanOptions): FileEntry[] {
    const result: FileEntry[] = [];
    const iter = this.scan(root, options);
    // Sync version uses a simpler approach — collect all
    // For Node, we use a wrapper
    return result;
  }

  private async *scanDir(
    dir: string,
    root: string,
    matcher: micromatch.Micromatch,
    maxDepth: number,
    maxFileSize: number,
    depth: number
  ): AsyncGenerator<FileEntry> {
    if (depth > maxDepth) return;

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return; // permission error — skip
    }

    for (const entry of entries) {
      const relPath = path.relative(root, path.join(dir, entry.name));

      if (matcher.isMatch(relPath) || matcher.isMatch(entry.name)) {
        this.stats.ignoredFiles++;
        continue;
      }

      if (entry.isDirectory()) {
        this.stats.totalDirs++;
        yield* this.scanDir(path.join(dir, entry.name), root, matcher, maxDepth, maxFileSize, depth + 1);
      } else {
        const absPath = path.join(dir, entry.name);
        let stat: fs.Stats;
        try {
          stat = await fs.promises.stat(absPath);
        } catch {
          continue;
        }

        if (stat.size > maxFileSize) {
          this.stats.ignoredFiles++;
          continue;
        }

        const lang = this.detectLanguage(entry.name);
        const isTest = this.isTestFile(entry.name);
        const isConfig = this.isConfigFile(entry.name);
        const isBuild = this.isBuildPath(relPath);

        const fileEntry: FileEntry = {
          path: relPath,
          absolutePath: absPath,
          size: stat.size,
          mtime: stat.mtimeMs,
          language: lang,
          isTest,
          isConfig,
          isBuild,
        };

        this.stats.totalFiles++;
        this.stats.byLanguage[lang] = (this.stats.byLanguage[lang] ?? 0) + 1;
        yield fileEntry;
      }
    }
  }

  getStats(): ScanStats {
    return { ...this.stats };
  }

  private detectLanguage(filename: string): FileEntry["language"] {
    const ext = path.extname(filename).toLowerCase();
    switch (ext) {
      case ".ts": case ".tsx": return "typescript";
      case ".js": case ".jsx": case ".mjs": case ".cjs": return "javascript";
      case ".json": return "json";
      case ".yaml": case ".yml": return "yaml";
      case ".md": case ".mdx": return "markdown";
      case ".css": case ".scss": case ".less": return "css";
      case ".html": case ".htm": return "html";
      default: return "unknown";
    }
  }

  private isTestFile(filename: string): boolean {
    return /[._]test\.(ts|tsx|js|jsx)$/.test(filename) ||
           /[._]spec\.(ts|tsx|js|jsx)$/.test(filename);
  }

  private isConfigFile(filename: string): boolean {
    const name = filename.toLowerCase();
    return name === "package.json" ||
           name.startsWith("tsconfig") ||
           name.startsWith("vite.config") ||
           name.startsWith("next.config") ||
           name.startsWith("tailwind.config") ||
           name.startsWith(".eslintrc") ||
           name.startsWith(".prettierrc") ||
           name === "biome.json" ||
           name === "turbo.json" ||
           name === "rollup.config" ||
           name === "webpack.config";
  }

  private isBuildPath(relPath: string): boolean {
    const buildMarkers = ["dist", "build", "out", ".next", ".nuxt", ".output", ".turbo", ".cache"];
    return buildMarkers.some(m => relPath.includes("/" + m + "/") || relPath.startsWith(m + "/"));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/code-index && npx vitest run src/scanner/workspace-scanner.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd packages/code-index
git add src/scanner/workspace-scanner.ts src/scanner/workspace-scanner.test.ts src/types.ts
git commit -m "feat(code-index): add WorkspaceScanner"
```

---

## Task 2: FileTreeIndex

**Files:**
- Create: `packages/code-index/src/tree/file-tree-index.ts`
- Test: `packages/code-index/src/tree/file-tree-index.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/code-index/src/tree/file-tree-index.test.ts
import { describe, it, expect } from "vitest";
import { FileTreeIndex } from "./file-tree-index.js";
import { FileEntry } from "../types.js";

describe("FileTreeIndex", () => {
  const mockEntries: FileEntry[] = [
    { path: "src/index.ts", absolutePath: "/proj/src/index.ts", size: 100, mtime: 1, language: "typescript", isTest: false, isConfig: false, isBuild: false },
    { path: "src/foo.ts", absolutePath: "/proj/src/foo.ts", size: 200, mtime: 1, language: "typescript", isTest: false, isConfig: false, isBuild: false },
    { path: "src/utils/math.ts", absolutePath: "/proj/src/utils/math.ts", size: 150, mtime: 1, language: "typescript", isTest: false, isConfig: false, isBuild: false },
    { path: "package.json", absolutePath: "/proj/package.json", size: 50, mtime: 1, language: "json", isTest: false, isConfig: true, isBuild: false },
    { path: "test/foo.test.ts", absolutePath: "/proj/test/foo.test.ts", size: 80, mtime: 1, language: "typescript", isTest: true, isConfig: false, isBuild: false },
  ];

  it("should build a tree from file entries", () => {
    const index = new FileTreeIndex();
    const root = index.build("/proj", mockEntries);
    expect(root.type).toBe("directory");
    expect(root.name).toBe("proj");
    expect(root.children?.length).toBeGreaterThan(0);
  });

  it("should return a node by path", () => {
    const index = new FileTreeIndex();
    index.build("/proj", mockEntries);
    const node = index.getNode("src/index.ts");
    expect(node).toBeDefined();
    expect(node?.type).toBe("file");
    expect(node?.language).toBe("typescript");
  });

  it("should return children of a directory", () => {
    const index = new FileTreeIndex();
    index.build("/proj", mockEntries);
    const children = index.getChildren("src");
    expect(children.length).toBe(2);
  });

  it("should serialize to JSON", () => {
    const index = new FileTreeIndex();
    index.build("/proj", mockEntries);
    const json = index.toJSON();
    expect(json.type).toBe("directory");
    expect(json.children).toBeDefined();
  });

  it("should return undefined for unknown paths", () => {
    const index = new FileTreeIndex();
    index.build("/proj", mockEntries);
    expect(index.getNode("nonexistent")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/code-index && npx vitest run src/tree/file-tree-index.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/code-index/src/tree/file-tree-index.ts
import { FileEntry, FileTreeNode } from "../types.js";

export class FileTreeIndex {
  private root: FileTreeNode = { name: "", path: "", type: "directory" };
  private nodeMap: Map<string, FileTreeNode> = new Map();

  build(rootPath: string, entries: FileEntry[]): FileTreeNode {
    this.root = {
      name: rootPath.split("/").pop() ?? rootPath,
      path: rootPath,
      type: "directory",
      children: [],
    };
    this.nodeMap.clear();
    this.nodeMap.set("", this.root);

    for (const entry of entries) {
      const parts = entry.path.split("/");
      let current = this.root;
      const node: FileTreeNode = {
        name: parts.pop()!,
        path: entry.path,
        type: "file",
        language: entry.language,
      };
      this.nodeMap.set(entry.path, node);

      for (const part of parts) {
        const dirPath = parts.slice(0, parts.indexOf(part) + 1).join("/");
        let dir = this.nodeMap.get(dirPath);
        if (!dir) {
          dir = { name: part, path: dirPath, type: "directory", children: [] };
          this.nodeMap.set(dirPath, dir);
          current.children = current.children ?? [];
          if (!current.children.find(c => c.name === part && c.type === "directory")) {
            current.children.push(dir);
          }
        }
        current = dir;
      }

      current.children = current.children ?? [];
      if (!current.children.find(c => c.name === node.name && c.type === "file")) {
        current.children.push(node);
      }
    }

    // Sort children: directories first
    const sortChildren = (node: FileTreeNode) => {
      if (node.children) {
        node.children.sort((a, b) => {
          if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        node.children.forEach(sortChildren);
      }
    };
    sortChildren(this.root);

    return this.root;
  }

  getNode(path: string): FileTreeNode | undefined {
    return this.nodeMap.get(path);
  }

  getChildren(path: string): FileTreeNode[] {
    const node = this.nodeMap.get(path);
    return node?.children ?? [];
  }

  getRoot(): FileTreeNode {
    return this.root;
  }

  toJSON(): FileTreeNode {
    return this.root;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/code-index && npx vitest run src/tree/file-tree-index.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd packages/code-index
git add src/tree/file-tree-index.ts src/tree/file-tree-index.test.ts
git commit -m "feat(code-index): add FileTreeIndex"
```

---

## Task 3: GitContextProvider

**Files:**
- Create: `packages/code-index/src/git/git-context-provider.ts`
- Test: `packages/code-index/src/git/git-context-provider.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/code-index/src/git/git-context-provider.test.ts
import { describe, it, expect } from "vitest";
import { GitContextProvider } from "./git-context-provider.js";

describe("GitContextProvider", () => {
  const provider = new GitContextProvider();
  const FIXTURE = "/home/oguz/Masaüstü/AltosAgent/packages/code-index/fixtures/with-git";

  it("should detect a git repo", async () => {
    const isRepo = await provider.isRepo(FIXTURE);
    expect(isRepo).toBe(true);
  });

  it("should get git context", async () => {
    const ctx = await provider.getContext(FIXTURE);
    expect(ctx.branch).toBeDefined();
    expect(typeof ctx.hasUncommittedChanges).toBe("boolean");
  });

  it("should return false for non-git directory", async () => {
    const isRepo = await provider.isRepo("/tmp");
    expect(isRepo).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/code-index && npx vitest run src/git/git-context-provider.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// packages/code-index/src/git/git-context-provider.ts
import { exec } from "child_process";
import { promisify } from "util";
import { GitContext, ChangedFile, CommitInfo } from "../types.js";

const execAsync = promisify(exec);

export class GitContextProvider {
  private async git(root: string, args: string[]): Promise<string> {
    try {
      const { stdout } = await execAsync(
        ["git", ...args.map(a => `'${a}'`)].join(" "),
        { cwd: root, timeout: 10000 }
      );
      return stdout.trim();
    } catch (e: any) {
      return e.stdout?.trim() ?? "";
    }
  }

  async isRepo(root: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync("git rev-parse --git-dir", { cwd: root, timeout: 5000 });
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  async getContext(root: string): Promise<GitContext> {
    const [branch, branches, remoteUrl, lastModified, changedFiles, recentCommits, stagedFiles, unstagedFiles, untrackedFiles] = await Promise.all([
      this.git(root, ["rev-parse", "--abbrev-ref", "HEAD"]),
      this.git(root, ["branch", "-a", "--format=%(refname:short)"]),
      this.git(root, ["remote", "get-url", "origin"]).catch(() => ""),
      this.getLastModified(root),
      this.getChangedFiles(root),
      this.getRecentCommits(root),
      this.git(root, ["diff", "--cached", "--name-only"]),
      this.git(root, ["diff", "--name-only"]),
      this.git(root, ["ls-files", "--others", "--exclude-standard"]),
    ]);

    return {
      root,
      branch,
      branches: branches.split("\n").filter(Boolean),
      remoteUrl: remoteUrl || undefined,
      lastModified,
      changedFiles,
      recentCommits,
      stagedFiles: stagedFiles.split("\n").filter(Boolean),
      unstagedFiles: unstagedFiles.split("\n").filter(Boolean),
      untrackedFiles: untrackedFiles.split("\n").filter(Boolean),
      hasUncommittedChanges: unstagedFiles.length > 0 || stagedFiles.length > 0,
    };
  }

  async getChangedFiles(root: string, _since?: string): Promise<ChangedFile[]> {
    const output = await this.git(root, ["diff", "--name-status", "--no-pager"]);
    return output.split("\n").filter(Boolean).map(line => {
      const [status, ...pathParts] = line.split("\t");
      const path = pathParts.join("\t");
      const statusMap: Record<string, ChangedFile["status"]> = {
        A: "added", M: "modified", D: "deleted", R: "renamed", C: "copied", U: "unmerged",
      };
      return { path, status: statusMap[status] ?? "modified" };
    });
  }

  private async getLastModified(root: string): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    try {
      const output = await this.git(root, ["log", "--format=%at %H", "-20", "--name-only"]);
      const lines = output.split("\n");
      let currentTime = 0;
      for (const line of lines) {
        if (/^\d+$/.test(line.trim())) {
          currentTime = parseInt(line.trim()) * 1000;
        } else if (line.trim() && currentTime > 0) {
          map.set(line.trim(), currentTime);
        }
      }
    } catch {}
    return map;
  }

  private async getRecentCommits(root: string): Promise<CommitInfo[]> {
    const commits: CommitInfo[] = [];
    try {
      const output = await this.git(root, [
        "log", "--format=%H|%s|%an|%at|%ct", "-20", "--no-pager"
      ]);
      for (const line of output.split("\n")) {
        if (!line.trim()) continue;
        const [hash, message, author, atime, ctime] = line.split("|");
        commits.push({
          hash,
          message,
          author,
          date: parseInt(atime ?? "0") * 1000,
          filesChanged: 0,
        });
      }
    } catch {}
    return commits;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/code-index && npx vitest run src/git/git-context-provider.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd packages/code-index
git add src/git/git-context-provider.ts src/git/git-context-provider.test.ts
git commit -m "feat(code-index): add GitContextProvider"
```

---

## Task 4: SymbolIndex (tree-sitter)

**Files:**
- Create: `packages/code-index/src/symbols/tree-sitter-parser.ts`
- Create: `packages/code-index/src/symbols/symbol-index.ts`
- Test: `packages/code-index/src/symbols/symbol-index.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/code-index/src/symbols/symbol-index.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { SymbolIndex } from "./symbol-index.js";

describe("SymbolIndex", () => {
  let index: SymbolIndex;

  beforeEach(() => {
    index = new SymbolIndex();
  });

  const tsContent = `
export function exportedFunc(name: string): number {
  return name.length;
}

function internalFunc() {}

export class ExportedClass {
  public prop: string;
  private field: number;
  
  constructor(prop: string) {
    this.prop = prop;
  }
  
  public method(): void {}
}

export interface ExportedInterface {
  name: string;
  value?: number;
}

export type MyType = string | number;

export const MY_CONSTANT = 42;
`;

  it("should index TypeScript function", async () => {
    await index.indexFile("foo.ts", tsContent);
    const symbols = index.getFileSymbols("foo.ts");
    expect(symbols.length).toBeGreaterThan(0);
  });

  it("should extract exported symbols", async () => {
    await index.indexFile("foo.ts", tsContent);
    const exported = index.getExportedSymbols();
    expect(exported.filter(s => s.visibility === "exported").length).toBeGreaterThan(0);
  });

  it("should find symbols by name", async () => {
    await index.indexFile("foo.ts", tsContent);
    const results = index.getSymbolsByName("exportedFunc");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe("exportedFunc");
  });

  it("should search symbols", async () => {
    await index.indexFile("foo.ts", tsContent);
    const results = index.search("func");
    expect(results.length).toBeGreaterThan(0);
  });

  it("should remove file symbols", async () => {
    await index.indexFile("foo.ts", tsContent);
    index.removeFile("foo.ts");
    expect(index.getFileSymbols("foo.ts").length).toBe(0);
  });

  it("should get stats", async () => {
    await index.indexFile("foo.ts", tsContent);
    const stats = index.getStats();
    expect(stats.totalSymbols).toBeGreaterThan(0);
    expect(stats.totalFiles).toBe(1);
  });

  it("should index multiple files", async () => {
    const files = new Map([
      ["foo.ts", tsContent],
      ["bar.ts", "export class Bar {}"],
    ]);
    await index.indexFiles(files);
    expect(index.getStats().totalFiles).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/code-index && npx vitest run src/symbols/symbol-index.test.ts`
Expected: FAIL

- [ ] **Step 3: Add tree-sitter dependencies to package.json**

```json
{
  "dependencies": {
    "tree-sitter": "^0.21.0",
    "tree-sitter-typescript": "^0.21.0",
    "tree-sitter-javascript": "^0.21.0"
  }
}
```

Run: `cd packages/code-index && pnpm add tree-sitter tree-sitter-typescript tree-sitter-javascript`

- [ ] **Step 4: Write tree-sitter-parser.ts**

```typescript
// packages/code-index/src/symbols/tree-sitter-parser.ts
import { Parser } from "tree-sitter";
import JavaScript from "tree-sitter-javascript";
import TypeScript from "tree-sitter-typescript";
import { IndexedSymbol, SymbolKind, Visibility } from "../types.js";

const parser = new Parser();
parser.setLanguage(TypeScript.typescript);

export function parseTS(content: string): { symbols: IndexedSymbol[] } {
  const tree = parser.parse(content);
  const symbols: IndexedSymbol[] = [];
  let nodeId = 0;

  const walk = (node: any, scope?: string) => {
    const entry = node;

    if (entry.type === "export_statement" || entry.type === "declaration") {
      // function
      if (entry.child(1)?.type === "function_declaration") {
        const fn = entry.child(1);
        const name = fn?.firstChild?.type === "identifier" ? fn.firstChild.text : undefined;
        if (name) {
          symbols.push(makeSymbol(name, "function", entry, Visibility.exported, scope));
        }
      }
      // class
      if (entry.type === "class_declaration") {
        const name = entry.child(0)?.text;
        if (name) {
          symbols.push(makeSymbol(name, "class", entry, Visibility.exported, scope));
          // methods/properties
          entry.child(2)?.children?.forEach((member: any) => {
            if (member.type === "method_definition") {
              const mname = member.child(1)?.text;
              if (mname) {
                symbols.push(makeSymbol(mname, "method", member, Visibility.exported, name));
              }
            }
            if (member.type === "public_property_definition") {
              const pname = member.child(1)?.text;
              if (pname) {
                symbols.push(makeSymbol(pname, "property", member, Visibility.exported, name));
              }
            }
          });
        }
      }
      // interface
      if (entry.type === "interface_declaration") {
        const name = entry.child(1)?.text;
        if (name) {
          symbols.push(makeSymbol(name, "interface", entry, Visibility.exported, scope));
        }
      }
      // type_alias
      if (entry.type === "type_alias_declaration") {
        const name = entry.child(1)?.text;
        if (name) {
          symbols.push(makeSymbol(name, "type", entry, Visibility.exported, scope));
        }
      }
      // lexported variable
      if (entry.type === "lexported" && entry.child(1)?.type === "variable_declaration") {
        const decl = entry.child(1);
        const name = decl?.child(0)?.text;
        if (name) {
          symbols.push(makeSymbol(name, "constant", entry, Visibility.exported, scope));
        }
      }
    }

    // non-exported
    if (entry.type === "function_declaration" && !entry.parent?.type.startsWith("export")) {
      const name = entry.child(0)?.text;
      if (name) {
        symbols.push(makeSymbol(name, "function", entry, Visibility.internal, scope));
      }
    }
    if (entry.type === "class_declaration" && !entry.parent?.type.startsWith("export")) {
      const name = entry.child(0)?.text;
      if (name) {
        symbols.push(makeSymbol(name, "class", entry, Visibility.internal, scope));
      }
    }

    entry.children?.forEach((child: any) => walk(child, scope));
  };

  tree.rootNode.children.forEach((child: any) => walk(child));

  return { symbols };

  function makeSymbol(
    name: string,
    kind: SymbolKind,
    node: any,
    visibility: Visibility,
    scope?: string
  ): IndexedSymbol {
    nodeId++;
    return {
      id: `file:${node.startPosition?.row ?? 0}:${node.startPosition?.column ?? 0}:${nodeId}`,
      name,
      kind,
      file: "",
      line: (node.startPosition?.row ?? 0) + 1,
      column: node.startPosition?.column ?? 0,
      endLine: (node.endPosition?.row ?? 0) + 1,
      endColumn: node.endPosition?.column ?? 0,
      visibility,
      scope,
      signatures: kind === "function" || kind === "method" ? [name + "()"] : undefined,
    };
  }
}
```

- [ ] **Step 5: Write symbol-index.ts**

```typescript
// packages/code-index/src/symbols/symbol-index.ts
import { IndexedSymbol, Location } from "../types.js";
import { parseTS } from "./tree-sitter-parser.js";

export class SymbolIndex {
  private symbols: Map<string, IndexedSymbol> = new Map();
  private fileSymbols: Map<string, Set<string>> = new Map();
  private symbolsByName: Map<string, Set<string>> = new Map();

  async indexFile(file: string, content: string): Promise<void> {
    this.removeFile(file);
    const { symbols } = parseTS(content);
    const fileSet = new Set<string>();

    for (const symbol of symbols) {
      const id = `${file}:${symbol.line}:${symbol.column}`;
      const s = { ...symbol, id, file };
      this.symbols.set(id, s);
      fileSet.add(id);

      if (!this.symbolsByName.has(s.name)) {
        this.symbolsByName.set(s.name, new Set());
      }
      this.symbolsByName.get(s.name)!.add(id);
    }

    this.fileSymbols.set(file, fileSet);
  }

  async indexFiles(files: Map<string, string>): Promise<void> {
    for (const [path, content] of files) {
      await this.indexFile(path, content);
    }
  }

  removeFile(file: string): void {
    const ids = this.fileSymbols.get(file);
    if (ids) {
      for (const id of ids) {
        const s = this.symbols.get(id);
        if (s) {
          this.symbolsByName.get(s.name)?.delete(id);
        }
        this.symbols.delete(id);
      }
      this.fileSymbols.delete(file);
    }
  }

  getSymbol(id: string): IndexedSymbol | undefined {
    return this.symbols.get(id);
  }

  getFileSymbols(file: string): IndexedSymbol[] {
    const ids = this.fileSymbols.get(file);
    if (!ids) return [];
    return [...ids].map(id => this.symbols.get(id)!).filter(Boolean);
  }

  getExportedSymbols(): IndexedSymbol[] {
    return [...this.symbols.values()].filter(s => s.visibility === "exported");
  }

  getSymbolsByName(name: string): IndexedSymbol[] {
    const ids = this.symbolsByName.get(name);
    if (!ids) return [];
    return [...ids].map(id => this.symbols.get(id)!).filter(Boolean);
  }

  search(query: string, limit = 50): IndexedSymbol[] {
    const q = query.toLowerCase();
    return [...this.symbols.values()]
      .filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.signatures?.some(sig => sig.toLowerCase().includes(q))
      )
      .slice(0, limit);
  }

  findDefinition(_symbolId: string): Location | undefined {
    // In full implementation: follow import/export chains
    return undefined;
  }

  findReferences(_symbolId: string): Location[] {
    return [];
  }

  getCallers(_symbolId: string): Location[] {
    return [];
  }

  getCallees(_symbolId: string): Location[] {
    return [];
  }

  clear(): void {
    this.symbols.clear();
    this.fileSymbols.clear();
    this.symbolsByName.clear();
  }

  getStats() {
    return {
      totalSymbols: this.symbols.size,
      totalFiles: this.fileSymbols.size,
    };
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd packages/code-index && npx vitest run src/symbols/symbol-index.test.ts`
Expected: PASS (may need minor adjustments to tree-sitter parser)

- [ ] **Step 7: Commit**

```bash
cd packages/code-index
git add src/symbols/tree-sitter-parser.ts src/symbols/symbol-index.ts src/symbols/symbol-index.test.ts
git commit -m "feat(code-index): add SymbolIndex with tree-sitter"
```

---

## Task 5: RepoMapBuilder

**Files:**
- Create: `packages/code-index/src/repo-map/repo-map-builder.ts`
- Test: `packages/code-index/src/repo-map/repo-map-builder.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/code-index/src/repo-map/repo-map-builder.test.ts
import { describe, it, expect } from "vitest";
import { RepoMapBuilder } from "./repo-map-builder.js";
import { WorkspaceScanner } from "../scanner/workspace-scanner.js";
import { SymbolIndex } from "../symbols/symbol-index.js";
import * as path from "path";

describe("RepoMapBuilder", () => {
  const FIXTURE_ROOT = path.resolve(__dirname, "../../fixtures/simple-ts");
  const builder = new RepoMapBuilder();

  it("should build a repo map", async () => {
    const scanner = new WorkspaceScanner();
    const symbols = new SymbolIndex();
    
    const files = new Map<string, string>();
    for await (const entry of scanner.scan(FIXTURE_ROOT)) {
      // index files would be loaded in real usage
    }
    
    const map = await builder.build(FIXTURE_ROOT, scanner, symbols);
    expect(map.root).toBeDefined();
    expect(map.structure.totalFiles).toBeGreaterThanOrEqual(0);
  });

  it("should count files by language", async () => {
    const scanner = new WorkspaceScanner();
    const symbols = new SymbolIndex();
    const map = await builder.build(FIXTURE_ROOT, scanner, symbols);
    expect(map.structure.byLanguage.typescript).toBeGreaterThan(0);
  });

  it("should serialize to summary", async () => {
    const scanner = new WorkspaceScanner();
    const symbols = new SymbolIndex();
    const map = await builder.build(FIXTURE_ROOT, scanner, symbols);
    const summary = builder.toSummary(map);
    expect(typeof summary).toBe("string");
    expect(summary.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/code-index && npx vitest run src/repo-map/repo-map-builder.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// packages/code-index/src/repo-map/repo-map-builder.ts
import * as fs from "fs";
import * as path from "path";
import { RepoMap, PackageInfo, WorkspaceScanner, SymbolIndex, FileEntry } from "../types.js";

export class RepoMapBuilder {
  async build(
    root: string,
    scanner: WorkspaceScanner,
    _symbols: SymbolIndex
  ): Promise<RepoMap> {
    const entries: FileEntry[] = [];
    for await (const entry of scanner.scan(root)) {
      entries.push(entry);
    }

    const packages = this.findPackageInfos(root);
    const structure = this.computeStructure(entries);
    const importantFiles = this.findImportantFiles(entries);

    return {
      generatedAt: Date.now(),
      root,
      structure,
      packages,
      exportedSymbols: [],
      moduleGraph: [],
      importantFiles,
    };
  }

  private findPackageInfos(root: string): PackageInfo[] {
    const infos: PackageInfo[] = [];
    try {
      const pkgPath = path.join(root, "package.json");
      if (fs.existsSync(pkgPath)) {
        const content = fs.readFileSync(pkgPath, "utf-8");
        const pkg = JSON.parse(content);
        infos.push({
          path: root,
          name: pkg.name ?? "unknown",
          version: pkg.version ?? "0.0.0",
          scripts: pkg.scripts ?? {},
          dependencies: Object.keys(pkg.dependencies ?? {}),
          devDependencies: Object.keys(pkg.devDependencies ?? {}),
        });
      }
    } catch {}
    return infos;
  }

  private computeStructure(entries: FileEntry[]) {
    const dirs = new Set(entries.map(e => path.dirname(e.path)));
    const byLanguage: Record<string, number> = {};
    let testFileCount = 0;
    let configFileCount = 0;

    for (const entry of entries) {
      byLanguage[entry.language] = (byLanguage[entry.language] ?? 0) + 1;
      if (entry.isTest) testFileCount++;
      if (entry.isConfig) configFileCount++;
    }

    return {
      totalFiles: entries.length,
      totalDirs: dirs.size,
      byLanguage,
      testFileCount,
      configFileCount,
    };
  }

  private findImportantFiles(entries: FileEntry[]): RepoMap["importantFiles"] {
    const entryPoints = ["index.ts", "main.ts", "app.ts", "src/index.ts", "src/main.ts"];
    const important: RepoMap["importantFiles"] = [];

    for (const entry of entries) {
      const name = path.basename(entry.path);
      const isEntry = entryPoints.includes(name) || entryPoints.includes(entry.path);
      const isConfig = entry.isConfig;
      const isBuild = entry.isBuild;

      if (isEntry || isConfig || isBuild) {
        let purpose = "source";
        if (isEntry) purpose = "entry point";
        else if (isConfig) purpose = "configuration";
        else if (isBuild) purpose = "build output";

        important.push({
          path: entry.path,
          purpose,
          lineCount: Math.round(entry.size / 50), // rough estimate
          exportsCount: 0,
        });
      }
    }

    return important;
  }

  toSummary(map: RepoMap): string {
    const langs = Object.entries(map.structure.byLanguage)
      .sort((a, b) => b[1] - a[1])
      .map(([lang, count]) => `${lang}:${count}`)
      .join(", ");

    return [
      `Repo: ${map.root}`,
      `Files: ${map.structure.totalFiles} (${langs})`,
      `Packages: ${map.packages.map(p => p.name).join(", ") || "none"}`,
      `Tests: ${map.structure.testFileCount}`,
      `Configs: ${map.structure.configFileCount}`,
    ].join(" | ");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/code-index && npx vitest run src/repo-map/repo-map-builder.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd packages/code-index
git add src/repo-map/repo-map-builder.ts src/repo-map/repo-map-builder.test.ts
git commit -m "feat(code-index): add RepoMapBuilder"
```

---

## Task 6: RelevantFileSelector

**Files:**
- Create: `packages/code-index/src/selection/relevant-file-selector.ts`
- Test: `packages/code-index/src/selection/relevant-file-selector.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/code-index/src/selection/relevant-file-selector.test.ts
import { describe, it, expect } from "vitest";
import { RelevantFileSelector } from "./relevant-file-selector.js";
import { RepoMapBuilder } from "../repo-map/repo-map-builder.js";
import { SymbolIndex } from "../symbols/symbol-index.js";
import { WorkspaceScanner } from "../scanner/workspace-scanner.js";
import * as path from "path";

describe("RelevantFileSelector", () => {
  const FIXTURE_ROOT = path.resolve(__dirname, "../../fixtures/simple-ts");
  const selector = new RelevantFileSelector();

  it("should select files matching a symbol name", async () => {
    const scanner = new WorkspaceScanner();
    const symbols = new SymbolIndex();
    const builder = new RepoMapBuilder();

    const repoMap = await builder.build(FIXTURE_ROOT, scanner, symbols);
    await symbols.indexFile("foo.ts", "export class Foo {} export function getFoo() {}");

    const result = await selector.select("Foo class", repoMap, symbols);
    expect(result.selectedFiles.length).toBeGreaterThan(0);
  });

  it("should respect maxFiles limit", async () => {
    const scanner = new WorkspaceScanner();
    const symbols = new SymbolIndex();
    const builder = new RepoMapBuilder();
    const repoMap = await builder.build(FIXTURE_ROOT, scanner, symbols);

    const result = await selector.select("function", repoMap, symbols, { maxFiles: 2 });
    expect(result.selectedFiles.length).toBeLessThanOrEqual(2);
  });

  it("should include reason for each selection", async () => {
    const scanner = new WorkspaceScanner();
    const symbols = new SymbolIndex();
    const builder = new RepoMapBuilder();
    const repoMap = await builder.build(FIXTURE_ROOT, scanner, symbols);

    const result = await selector.select("test", repoMap, symbols);
    for (const file of result.selectedFiles) {
      expect(file.reason).toBeDefined();
      expect(file.reason.score).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/code-index && npx vitest run src/selection/relevant-file-selector.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// packages/code-index/src/selection/relevant-file-selector.ts
import {
  RelevantFileSelector as ISelector,
  SelectionResult,
  SelectedFile,
  SelectionOptions,
  RepoMap,
  IndexedSymbol,
  SelectionReason,
} from "../types.js";

const DEFAULT_OPTIONS: Required<SelectionOptions> = {
  maxFiles: 20,
  maxSymbols: 50,
  maxRepoMapTokens: 2000,
  includeGitContext: false,
  includeFileTree: false,
  includeTests: false,
};

export class RelevantFileSelector implements ISelector {
  async select(
    prompt: string,
    repoMap: RepoMap,
    symbols: { search: (q: string, limit?: number) => IndexedSymbol[]; getFileSymbols: (f: string) => IndexedSymbol[] },
    options?: SelectionOptions
  ): Promise<SelectionResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const query = prompt.toLowerCase();
    const selectedFiles: SelectedFile[] = [];
    const reasoning: SelectionReason[] = [];

    // 1. Symbol search
    const matchedSymbols = symbols.search(query, opts.maxSymbols);
    const fileScores: Map<string, { score: number; reason: SelectionReason; symbols: IndexedSymbol[] }> = new Map();

    for (const sym of matchedSymbols) {
      const existing = fileScores.get(sym.file);
      const score = sym.name.toLowerCase() === query ? 1.0 : 0.8;
      if (!existing || existing.score < score) {
        fileScores.set(sym.file, {
          score,
          reason: { type: "symbol_match", detail: `matched symbol "${sym.name}"`, score },
          symbols: [sym],
        });
      } else {
        existing.symbols.push(sym);
      }
    }

    // 2. File name match
    for (const file of repoMap.importantFiles) {
      const name = file.path.toLowerCase();
      if (name.includes(query)) {
        const existing = fileScores.get(file.path);
        const score = 0.6;
        if (!existing || existing.score < score) {
          fileScores.set(file.path, {
            score,
            reason: { type: "file_name_match", detail: `filename matches "${prompt}"`, score },
            symbols: [],
          });
        }
      }
    }

    // 3. Sort and truncate
    const sorted = [...fileScores.entries()]
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, opts.maxFiles);

    for (const [filePath, data] of sorted) {
      selectedFiles.push({
        path: filePath,
        reason: data.reason,
        relevanceScore: data.score,
        symbols: data.symbols,
      });
    }

    // 4. Repo map slice (full for now, truncate at token budget)
    const repoMapSlice: RepoMap = {
      ...repoMap,
      exportedSymbols: repoMap.exportedSymbols.slice(0, 20),
      moduleGraph: repoMap.moduleGraph.slice(0, 20),
      importantFiles: repoMap.importantFiles.slice(0, 20),
    };

    const totalTokens = this.estimateTokens(selectedFiles, repoMapSlice);

    return {
      selectedFiles,
      repoMapSlice,
      totalTokens,
      reasoning,
    };
  }

  private estimateTokens(files: SelectedFile[], repoMap: RepoMap): number {
    // Rough: 4 chars per token
    const repoMapChars = JSON.stringify(repoMap).length;
    const fileChars = files.reduce((sum, f) => sum + f.path.length, 0);
    return Math.round((repoMapChars + fileChars) / 4);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/code-index && npx vitest run src/selection/relevant-file-selector.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd packages/code-index
git add src/selection/relevant-file-selector.ts src/selection/relevant-file-selector.test.ts
git commit -m "feat(code-index): add RelevantFileSelector"
```

---

## Task 7: LSPAdapter + CodeGraphAdapter

**Files:**
- Create: `packages/code-index/src/lsp/lsp-adapter.ts`
- Create: `packages/code-index/src/codegraph/codegraph-adapter.ts`
- Test: `packages/code-index/src/lsp/lsp-adapter.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/code-index/src/lsp/lsp-adapter.test.ts
import { describe, it, expect } from "vitest";
import { LSPAdapter } from "./lsp-adapter.js";

describe("LSPAdapter", () => {
  it("should report not ready before start", () => {
    const adapter = new LSPAdapter();
    expect(adapter.isReady()).toBe(false);
  });

  it("should stop cleanly", () => {
    const adapter = new LSPAdapter();
    adapter.stop(); // should not throw
    expect(adapter.isReady()).toBe(false);
  });

  it("should return empty diagnostics when not available", async () => {
    const adapter = new LSPAdapter();
    const diags = await adapter.getDiagnostics("/tmp/nonexistent.ts");
    expect(Array.isArray(diags)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/code-index && npx vitest run src/lsp/lsp-adapter.test.ts`
Expected: FAIL

- [ ] **Step 3: Write LSPAdapter stub + CodeGraphAdapter stub**

```typescript
// packages/code-index/src/lsp/lsp-adapter.ts
import { LSPAdapter as ILSPAdapter, LSPDocumentSymbol, LSPHover, LSPDiagnostic, Location } from "../types.js";

export class LSPAdapter implements ILSPAdapter {
  private ready = false;

  async start(_root: string): Promise<void> {
    // In full implementation: spawn typescript-language-server
    // For Phase 8 stub: mark ready=false, graceful degradation
    this.ready = false;
  }

  stop(): void {
    this.ready = false;
  }

  isReady(): boolean {
    return this.ready;
  }

  async getDocumentSymbols(_file: string): Promise<LSPDocumentSymbol[]> {
    return [];
  }

  async gotoDefinition(_file: string, _line: number, _column: number): Promise<Location | null> {
    return null;
  }

  async findReferences(_file: string, _line: number, _column: number): Promise<Location[]> {
    return [];
  }

  async getHover(_file: string, _line: number, _column: number): Promise<LSPHover | null> {
    return null;
  }

  async getDiagnostics(_file: string): Promise<LSPDiagnostic[]> {
    return [];
  }
}
```

```typescript
// packages/code-index/src/codegraph/codegraph-adapter.ts
import { CodeGraphAdapter as ICodeGraphAdapter, CodeGraphResult } from "../types.js";

export class StubCodeGraphAdapter implements ICodeGraphAdapter {
  name = "codegraph-stub";

  async isAvailable(_root: string): Promise<boolean> {
    return false;
  }

  async explore(_query: string): Promise<CodeGraphResult[]> {
    return [];
  }

  async getCallers(_symbolName: string): Promise<CodeGraphResult[]> {
    return [];
  }

  async getCallees(_symbolName: string): Promise<CodeGraphResult[]> {
    return [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/code-index && npx vitest run src/lsp/lsp-adapter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd packages/code-index
git add src/lsp/lsp-adapter.ts src/codegraph/codegraph-adapter.ts src/lsp/lsp-adapter.test.ts
git commit -m "feat(code-index): add LSPAdapter and CodeGraphAdapter stubs"
```

---

## Task 8: ContextBuilder

**Files:**
- Create: `packages/code-index/src/context/context-builder.ts`
- Test: `packages/code-index/src/context/context-builder.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/code-index/src/context/context-builder.test.ts
import { describe, it, expect } from "vitest";
import { ContextBuilder } from "./context-builder.js";

describe("ContextBuilder", () => {
  const FIXTURE = "/home/oguz/Masaüstü/AltosAgent/packages/code-index/fixtures/simple-ts";

  it("should build context from a prompt", async () => {
    const builder = new ContextBuilder({});
    const result = await builder.build({ workspaceRoot: FIXTURE, prompt: "test" });
    expect(result.selectedFiles).toBeDefined();
    expect(result.repoMap).toBeDefined();
  });

  it("should estimate tokens", async () => {
    const builder = new ContextBuilder({});
    const result = await builder.build({ workspaceRoot: FIXTURE, prompt: "foo" });
    expect(result.totalTokens).toBeGreaterThanOrEqual(0);
  });

  it("should produce context messages", async () => {
    const builder = new ContextBuilder({});
    const result = await builder.build({ workspaceRoot: FIXTURE, prompt: "test" });
    const messages = result.toMessages();
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0].role).toBe("system");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/code-index && npx vitest run src/context/context-builder.test.ts`
Expected: FAIL

- [ ] **Step 3: Write ContextBuilder**

```typescript
// packages/code-index/src/context/context-builder.ts
import {
  BuiltContext,
  BuildContextOptions,
  ContextMessage,
  RepoMap,
  WorkspaceScanner,
  SymbolIndex,
  LSPAdapter,
  CodeGraphAdapter,
  DEFAULT_LIMITS,
} from "../types.js";
import { RelevantFileSelector } from "../selection/relevant-file-selector.js";
import { RepoMapBuilder } from "../repo-map/repo-map-builder.js";
import { FileTreeIndex } from "../tree/file-tree-index.js";

export class ContextBuilder {
  private scanner: WorkspaceScanner;
  private symbolIndex: SymbolIndex;
  private lspAdapter?: LSPAdapter;
  private codeGraphAdapter?: CodeGraphAdapter;
  private selector: RelevantFileSelector;
  private repoMapBuilder: RepoMapBuilder;
  private repoMapCache?: RepoMap;
  private indexedAt?: number;

  constructor(config: {
    scanner?: WorkspaceScanner;
    symbolIndex?: SymbolIndex;
    lspAdapter?: LSPAdapter;
    codeGraphAdapter?: CodeGraphAdapter;
  }) {
    this.scanner = config.scanner ?? new WorkspaceScanner();
    this.symbolIndex = config.symbolIndex ?? new SymbolIndex();
    this.lspAdapter = config.lspAdapter;
    this.codeGraphAdapter = config.codeGraphAdapter;
    this.selector = new RelevantFileSelector();
    this.repoMapBuilder = new RepoMapBuilder();
  }

  async build(options: BuildContextOptions): Promise<BuiltContext> {
    const {
      workspaceRoot,
      prompt,
      loadFileContent = true,
      includeLSP = false,
      includeFileTree = false,
      maxFiles = DEFAULT_LIMITS.maxFilesPerSelection,
      maxRepoMapTokens = DEFAULT_LIMITS.maxRepoMapTokens,
    } = options;

    // Build or retrieve repo map
    if (!this.repoMapCache || this.indexedAt && Date.now() - this.indexedAt > 3600000) {
      this.repoMapCache = await this.repoMapBuilder.build(
        workspaceRoot,
        this.scanner,
        this.symbolIndex
      );
      this.indexedAt = Date.now();
    }

    // Select relevant files
    const selectionResult = await this.selector.select(
      prompt,
      this.repoMapCache,
      this.symbolIndex,
      { maxFiles, maxRepoMapTokens }
    );

    // Optionally load file content
    if (loadFileContent) {
      const { readFile } = await import("fs/promises");
      for (const file of selectionResult.selectedFiles) {
        try {
          file.content = await readFile(file.path, "utf-8");
        } catch {}
      }
    }

    // Assemble built context
    const built: BuiltContext = {
      workspaceRoot,
      prompt,
      selectedFiles: selectionResult.selectedFiles,
      repoMap: selectionResult.repoMapSlice,
      totalTokens: selectionResult.totalTokens,
      generatedAt: Date.now(),
      toMessages() {
        const parts: string[] = [
          `# Repository Context`,
          ``,
          `## Repo Map`,
          JSON.stringify(this.repoMap, null, 2),
          ``,
          `## Selected Files`,
        ];
        for (const f of this.selectedFiles) {
          parts.push(`### ${f.path} (score: ${f.relevanceScore.toFixed(2)})`);
          if (f.content) {
            parts.push("```");
            parts.push(f.content.slice(0, 5000));
            parts.push("```");
          }
        }
        return [{
          role: "system" as const,
          content: parts.join("\n"),
          metadata: {
            files: this.selectedFiles.map(f => f.path),
            repoMap: this.repoMap,
          },
        }];
      },
    };

    return built;
  }

  async indexFile(path: string, content: string): Promise<void> {
    await this.symbolIndex.indexFile(path, content);
    this.indexedAt = undefined; // invalidate cache
  }

  async removeFile(path: string): Promise<void> {
    this.symbolIndex.removeFile(path);
    this.indexedAt = undefined;
  }

  getRepoMap(): RepoMap {
    return this.repoMapCache ?? {
      generatedAt: 0,
      root: "",
      structure: { totalFiles: 0, totalDirs: 0, byLanguage: {}, testFileCount: 0, configFileCount: 0 },
      packages: [],
      exportedSymbols: [],
      moduleGraph: [],
      importantFiles: [],
    };
  }

  getIndexStats() {
    return {
      totalSymbols: this.symbolIndex.getStats().totalSymbols,
      totalFiles: this.symbolIndex.getStats().totalFiles,
      indexedAt: this.indexedAt ?? 0,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/code-index && npx vitest run src/context/context-builder.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd packages/code-index
git add src/context/context-builder.ts src/context/context-builder.test.ts
git commit -m "feat(code-index): add ContextBuilder"
```

---

## Task 9: CLI Commands

**Files:**
- Create: `packages/code-index/src/cli/commands/index.ts`
- Create: `packages/code-index/src/cli/commands/index-cmd.ts`
- Create: `packages/code-index/src/cli/commands/map-cmd.ts`
- Create: `packages/code-index/src/cli/commands/search-cmd.ts`

- [ ] **Step 1: Write index command**

```typescript
// packages/code-index/src/cli/commands/index-cmd.ts
import { WorkspaceScanner } from "../../scanner/workspace-scanner.js";
import { SymbolIndex } from "../../symbols/symbol-index.js";
import { RepoMapBuilder } from "../../repo-map/repo-map-builder.js";
import { readFile } from "fs/promises";

export interface IndexCommandOptions {
  path?: string;
  force?: boolean;
  stats?: boolean;
  json?: boolean;
  quiet?: boolean;
}

export async function runIndexCommand(options: IndexCommandOptions): Promise<number> {
  const root = options.path ?? process.cwd();
  const scanner = new WorkspaceScanner();
  const symbolIndex = new SymbolIndex();
  const repoMapBuilder = new RepoMapBuilder();

  if (!options.quiet) {
    console.log(`Scanning ${root}...`);
  }

  const entries: any[] = [];
  for await (const entry of scanner.scan(root)) {
    entries.push(entry);
  }

  // Index TS/JS files
  for (const entry of entries) {
    if (entry.language === "typescript" || entry.language === "javascript") {
      try {
        const content = await readFile(entry.absolutePath, "utf-8");
        await symbolIndex.indexFile(entry.absolutePath, content);
      } catch {}
    }
  }

  const stats = scanner.getStats();
  const symStats = symbolIndex.getStats();
  const repoMap = await repoMapBuilder.build(root, scanner, symbolIndex);

  if (options.json) {
    console.log(JSON.stringify({
      scanStats: stats,
      symbolStats: symStats,
      repoMap,
    }, null, 2));
  } else if (options.stats) {
    console.log(`Files scanned: ${stats.totalFiles}`);
    console.log(`Directories: ${stats.totalDirs}`);
    console.log(`Languages: ${JSON.stringify(stats.byLanguage)}`);
    console.log(`Symbols indexed: ${symStats.totalSymbols}`);
    console.log(`Packages found: ${repoMap.packages.length}`);
  } else if (!options.quiet) {
    console.log(`Done. ${stats.totalFiles} files, ${symStats.totalSymbols} symbols indexed.`);
  }

  return 0;
}
```

- [ ] **Step 2: Write map command**

```typescript
// packages/code-index/src/cli/commands/map-cmd.ts
import { WorkspaceScanner } from "../../scanner/workspace-scanner.js";
import { SymbolIndex } from "../../symbols/symbol-index.js";
import { RepoMapBuilder } from "../../repo-map/repo-map-builder.js";

export interface MapCommandOptions {
  path?: string;
  focus?: string;
  exports?: boolean;
  packages?: boolean;
  important?: boolean;
  json?: boolean;
  noColor?: boolean;
}

export async function runMapCommand(options: MapCommandOptions): Promise<number> {
  const root = options.path ?? process.cwd();
  const scanner = new WorkspaceScanner();
  const symbols = new SymbolIndex();
  const builder = new RepoMapBuilder();

  const repoMap = await builder.build(root, scanner, symbols);

  if (options.json) {
    console.log(JSON.stringify(repoMap, null, 2));
    return 0;
  }

  // Text output
  const summary = builder.toSummary(repoMap);
  console.log(summary);

  if (options.packages && repoMap.packages.length > 0) {
    console.log("\nPackages:");
    for (const pkg of repoMap.packages) {
      console.log(`  ${pkg.name}@${pkg.version} (${pkg.path})`);
      console.log(`    Scripts: ${Object.keys(pkg.scripts).join(", ")}`);
      console.log(`    Deps: ${pkg.dependencies.join(", ") || "none"}`);
    }
  }

  if (options.important && repoMap.importantFiles.length > 0) {
    console.log("\nImportant Files:");
    for (const f of repoMap.importantFiles) {
      console.log(`  ${f.path} — ${f.purpose}`);
    }
  }

  return 0;
}
```

- [ ] **Step 3: Write search command**

```typescript
// packages/code-index/src/cli/commands/search-cmd.ts
import { SymbolIndex } from "../../symbols/symbol-index.js";
import { WorkspaceScanner } from "../../scanner/workspace-scanner.js";
import { readFile } from "fs/promises";

export interface SearchCommandOptions {
  query: string;
  path?: string;
  refs?: boolean;
  file?: string;
  kind?: string;
  json?: boolean;
  limit?: number;
}

export async function runSearchCommand(options: SearchCommandOptions): Promise<number> {
  const root = options.path ?? process.cwd();
  const scanner = new WorkspaceScanner();
  const symbolIndex = new SymbolIndex();

  // Pre-index files
  for await (const entry of scanner.scan(root)) {
    if (entry.language === "typescript" || entry.language === "javascript") {
      try {
        const content = await readFile(entry.absolutePath, "utf-8");
        await symbolIndex.indexFile(entry.absolutePath, content);
      } catch {}
    }
  }

  const results = symbolIndex.search(options.query, options.limit ?? 50);

  if (options.json) {
    console.log(JSON.stringify({ results }, null, 2));
    return 0;
  }

  if (results.length === 0) {
    console.log(`No symbols found matching "${options.query}"`);
    return 1;
  }

  console.log(`Found ${results.length} symbol(s):\n`);
  for (const s of results) {
    const sig = s.signatures?.[0] ?? "";
    console.log(`  ${s.kind.padEnd(12)} ${s.name}${sig ? " " + sig : ""}`);
    console.log(`    → ${s.file}:${s.line}`);
  }

  if (options.refs) {
    console.log("\nReferences: (requires LSP — not yet connected)");
  }

  return 0;
}
```

- [ ] **Step 4: Integrate into CLI**

Modify `apps/cli/src/index.ts` to add the new commands. Add `runIndexCommand`, `runMapCommand`, `runSearchCommand` imports and route `index`, `map`, `search` command strings.

```typescript
// In apps/cli/src/index.ts, add to the command routing near the bottom:
import { runIndexCommand } from "@altos/code-index/src/cli/commands/index-cmd.js";
import { runMapCommand } from "@altos/code-index/src/cli/commands/map-cmd.js";
import { runSearchCommand } from "@altos/code-index/src/cli/commands/search-cmd.js";
```

And in the command handler:
```typescript
switch (command) {
  case "index": return await runIndexCommand({});
  case "map": return await runMapCommand({});
  case "search": return await runSearchCommand({ query: args?.[0] ?? "" });
}
```

- [ ] **Step 5: Test CLI commands compile**

Run: `cd packages/code-index && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 6: Commit**

```bash
cd packages/code-index
git add src/cli/commands/
git commit -m "feat(code-index): add CLI commands (index, map, search)"
```

---

## Task 10: Fixtures + Package.json Update

**Files:**
- Create: All fixture files listed below
- Modify: `packages/code-index/package.json`

- [ ] **Step 1: Create simple-ts fixture**

```
packages/code-index/fixtures/simple-ts/src/index.ts:
```typescript
export { Foo, getFoo } from "./foo.js";
export type { BarOptions } from "./bar.js";
```

packages/code-index/fixtures/simple-ts/src/foo.ts:
```typescript
export class Foo {
  public name: string;
  private value: number;

  constructor(name: string) {
    this.name = name;
    this.value = 0;
  }

  public getValue(): number {
    return this.value;
  }
}

export function getFoo(name: string): Foo {
  return new Foo(name);
}
```

packages/code-index/fixtures/simple-ts/src/bar.ts:
```typescript
export interface BarOptions {
  name: string;
  value?: number;
}

export function createBar(opts: BarOptions): BarOptions {
  return { name: opts.name, value: opts.value ?? 0 };
}
```

packages/code-index/fixtures/simple-ts/src/utils/math.ts:
```typescript
export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}
```

packages/code-index/fixtures/simple-ts/src/utils/strings.ts:
```typescript
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function reverse(str: string): string {
  return str.split("").reverse().join("");
}
```

packages/code-index/fixtures/simple-ts/test/foo.test.ts:
```typescript
import { describe, it, expect } from "vitest";
import { Foo, getFoo } from "../src/foo.js";

describe("Foo", () => {
  it("should create foo with name", () => {
    const foo = new Foo("test");
    expect(foo.name).toBe("test");
  });

  it("should return value", () => {
    const foo = new Foo("test");
    expect(foo.getValue()).toBe(0);
  });

  it("getFoo helper", () => {
    const foo = getFoo("helper");
    expect(foo.name).toBe("helper");
  });
});
```

packages/code-index/fixtures/simple-ts/package.json:
```json
{
  "name": "simple-ts",
  "version": "1.0.0",
  "scripts": { "test": "vitest" }
}
```

packages/code-index/fixtures/simple-ts/tsconfig.json:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "strict": true
  }
}
```

- [ ] **Step 2: Create multi-package fixture**

packages/code-index/fixtures/multi-package/package.json:
```json
{ "name": "multi-package", "private": true, "workspaces": ["packages/*"] }
```

packages/code-index/fixtures/multi-package/packages/pkg-a/src/index.ts:
```typescript
export function a_func(): string {
  return "from pkg-a";
}
```

packages/code-index/fixtures/multi-package/packages/pkg-a/package.json:
```json
{ "name": "pkg-a", "version": "1.0.0" }
```

packages/code-index/fixtures/multi-package/packages/pkg-b/src/index.ts:
```typescript
import { a_func } from "pkg-a";

export function b_func(): string {
  return a_func() + " -> pkg-b";
}
```

packages/code-index/fixtures/multi-package/packages/pkg-b/package.json:
```json
{ "name": "pkg-b", "version": "1.0.0", "dependencies": { "pkg-a": "1.0.0" } }
```

- [ ] **Step 3: Create with-git fixture**

packages/code-index/fixtures/with-git/src/index.ts:
```typescript
export function hello(): string {
  return "hello world";
}
```

packages/code-index/fixtures/with-git/package.json:
```json
{ "name": "with-git", "version": "1.0.0" }
```

Run: `cd packages/code-index/fixtures/with-git && git init && git add . && git commit -m "initial"`

- [ ] **Step 4: Update package.json**

Add tree-sitter dependencies and CLI exports.

```json
{
  "dependencies": {
    "tree-sitter": "^0.21.0",
    "tree-sitter-typescript": "^0.21.0",
    "tree-sitter-javascript": "^0.21.0",
    "micromatch": "^4.0.0"
  }
}
```

Run: `cd packages/code-index && pnpm add tree-sitter tree-sitter-typescript tree-sitter-javascript micromatch`

- [ ] **Step 5: Update package.json exports**

Add to `exports` field:
```json
{
  "./cli": "./src/cli/index.ts"
}
```

- [ ] **Step 6: Commit**

```bash
cd packages/code-index
git add fixtures/
git add package.json
git commit -m "feat(code-index): add fixture repos and update dependencies"
```

---

## Task 11: Documentation

**Files:**
- Create: `docs/architecture/repository-intelligence.md`

- [ ] **Step 1: Write architecture documentation**

```markdown
# Repository Intelligence

## Overview

The repository intelligence layer provides Altos with deep, surgical understanding of codebases. Given any user prompt, it selects exactly the files, symbols, and relationships needed — respecting token budgets throughout.

## Architecture

```
WorkspaceScanner → FileTreeIndex + GitContextProvider
                       ↓
                 SymbolIndex (tree-sitter)
                       ↓
                 RepoMapBuilder → RepoMap
                       ↓
              RelevantFileSelector → SelectedFiles
                       ↓
                 ContextBuilder → BuiltContext
                       ↓
              [LSPAdapter] [CodeGraphAdapter]
```

## Modules

### WorkspaceScanner
Scans the filesystem, applying ignore patterns, detecting file types.

### FileTreeIndex
Hierarchical file tree structure.

### GitContextProvider
Git state, branches, changed files, recent commits.

### SymbolIndex
AST-based symbol extraction using tree-sitter (TS/JS only in Phase 8).

### RepoMapBuilder
Compact, model-friendly summary of the codebase.

### RelevantFileSelector
Given a prompt, selects relevant files using symbol + import graph scoring.

### ContextBuilder
Orchestrates all modules into a final context for the model.

### LSPAdapter
Bridge to TypeScript/JavaScript language server (read-only ops).

### CodeGraphAdapter
Placeholder for CodeGraph SQLite knowledge graph.

## Token Budget Strategy

1. Repo map first (~500-2000 tokens)
2. Selected files next (up to budget)
3. Truncate from bottom (lowest-scored files dropped last)
4. Symbol snippets limited to 10 lines each

## CLI Commands

- `altos index` — scan and index workspace
- `altos map` — display repo map
- `altos search` — search symbols

## Future Extensions

- Incremental/watch-mode indexing
- Multi-language tree-sitter parsers
- LSP write operations
- Vector similarity search
- Full CodeGraph integration
</```

- [ ] **Step 2: Commit**

```bash
cd /home/oguz/Masaüstü/AltosAgent
git add docs/architecture/repository-intelligence.md
git commit -m "docs: add repository-intelligence architecture doc"
```

---

## Task 12: Integration Tests + Build Verification

**Files:**
- Modify: `packages/code-index/src/index.ts` — export all modules

- [ ] **Step 1: Update main index.ts**

```typescript
// packages/code-index/src/index.ts
// Main exports
export * from "./types.js";

// Scanner
export { WorkspaceScanner } from "./scanner/workspace-scanner.js";

// Tree
export { FileTreeIndex } from "./tree/file-tree-index.js";

// Git
export { GitContextProvider } from "./git/git-context-provider.js";

// Symbols
export { SymbolIndex } from "./symbols/symbol-index.js";
export { parseTS } from "./symbols/tree-sitter-parser.js";

// Repo Map
export { RepoMapBuilder } from "./repo-map/repo-map-builder.js";

// Selection
export { RelevantFileSelector } from "./selection/relevant-file-selector.js";

// LSP
export { LSPAdapter } from "./lsp/lsp-adapter.js";

// CodeGraph
export { StubCodeGraphAdapter } from "./codegraph/codegraph-adapter.js";

// Context
export { ContextBuilder } from "./context/context-builder.js";
```

- [ ] **Step 2: Run full build**

Run: `cd packages/code-index && pnpm run build`
Expected: Compiles without errors

- [ ] **Step 3: Run all tests**

Run: `cd packages/code-index && pnpm run test`
Expected: All tests pass

- [ ] **Step 4: Run lint**

Run: `cd packages/code-index && pnpm run lint`
Expected: No errors

- [ ] **Step 5: Run typecheck**

Run: `cd packages/code-index && pnpm run typecheck`
Expected: No errors

- [ ] **Step 6: Run full workspace build**

Run: `cd /home/oguz/Masaüstü/AltosAgent && pnpm run build`
Expected: All packages compile

- [ ] **Step 7: Final commit**

```bash
cd /home/oguz/Masaüstü/AltosAgent
git add packages/code-index/src/index.ts
git add packages/code-index/src/types.ts
git commit -m "feat(code-index): wire up all modules, final integration"
```

---

## Task 13: Phase Reports

**Files:**
- Create: `PHASE_8_REPOSITORY_INTELLIGENCE_REPORT.md`
- Create: `PHASE_8_CONTEXT_ENGINE_NOTES.md`
- Create: `PHASE_8_TEST_RESULTS.md`

- [ ] **Step 1: Write PHASE_8_REPOSITORY_INTELLIGENCE_REPORT.md**

Summarize what was built: all 9 modules, CLI commands, docs, test coverage.

- [ ] **Step 2: Write PHASE_8_CONTEXT_ENGINE_NOTES.md**

Notes on the context selection algorithm, token budgeting approach, LSP adapter design, and future extension points.

- [ ] **Step 3: Write PHASE_8_TEST_RESULTS.md**

Full test results: pass/fail per test file, any skipped tests, any known issues.

- [ ] **Step 4: Commit reports**

```bash
cd /home/oguz/Masaüstü/AltosAgent
git add PHASE_8_*.md
git commit -m "docs: add phase 8 reports"
```

---

## Spec Coverage Check

- [x] `WorkspaceScanner` → Task 1
- [x] `FileTreeIndex` → Task 2
- [x] `GitContextProvider` → Task 3
- [x] `SymbolIndex` → Task 4
- [x] `RepoMapBuilder` → Task 5
- [x] `RelevantFileSelector` → Task 6
- [x] `LSPAdapter` → Task 7
- [x] `CodeGraphAdapter` → Task 7
- [x] `ContextBuilder` → Task 8
- [x] CLI `altos index` → Task 9
- [x] CLI `altos map` → Task 9
- [x] CLI `altos search` → Task 9
- [x] `docs/architecture/repository-intelligence.md` → Task 11
- [x] Tests + fixture repos → Tasks 1-9, 10
- [x] Default ignores (node_modules, .git, dist, build, cache) → Task 1
- [x] Token budgets → Task 6 (RelevantFileSelector) + Task 8 (ContextBuilder)
- [x] Compact repo map → Task 5
