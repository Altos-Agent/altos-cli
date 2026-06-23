# Repository Intelligence — Architecture

## Overview

Repository Intelligence is the system that gives Altos a deep, queryable model of the codebase it operates in. Rather than relying on brittle regex searches or re-parsing files on every prompt, it builds a persistent, structured index of the workspace: file tree, git context, extracted symbols, and a compact repo map. When a user prompt or agent task needs to know "which files are relevant to this change," the intelligence layer answers in seconds rather than minutes.

It exists because effective AI-assisted coding requires the model to understand the shape of the codebase — not just the contents of individual files. Without it, every operation starts cold, re-reading the same files repeatedly. With it, the system has spatial awareness, change history, and symbol-level navigation.

---

## Architecture Diagram

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

The pipeline is strictly sequential in the cold path: scan → index → map → select → build. Each stage is lazy and caching-aware, so repeated operations avoid redundant work.

---

## Module Responsibilities

### WorkspaceScanner

Scans the filesystem starting from a given root path, recursively enumerating files and directories. Applies the standard ignore list (node_modules, .git, dist, __pycache__, etc.) before emitting file paths. Produces a flat or shallow list of candidate paths for downstream consumers.

### FileTreeIndex

Builds and maintains an in-memory hierarchical tree of the workspace: directories contain subdirectories and files, each node carrying metadata (path, size, modification time, extension). This structure enables tree-aware operations such as "find all files under src/features" or "list all test files sibling to module X." It is not a file listing — it is an indexed model.

### GitContextProvider

Reads git state for the workspace: current branch, staged/unstaged changed files, recent commit history, and optionally diff content for modified files. Provides the "what changed" context that lets the intelligence layer prioritise recently edited files or files near recent commits.

### SymbolIndex

Parses source files using tree-sitter (for TypeScript and JavaScript at launch; additional language parsers are future extension points) and extracts a flat list of symbols: functions, classes, interfaces, type aliases, enums, and exported variables. Each symbol carries its defining file, line range, name, kind, and signature. This index is the primary input for symbol-level search and for the repo map summariser.

### RepoMapBuilder

Consumes the FileTreeIndex, SymbolIndex, and GitContextProvider outputs to produce a **RepoMap** — a compact, model-friendly JSON document that summarises the codebase at a fixed token budget. The map includes directory structure (up to a depth limit), file-extension distribution, symbol counts per file, and a brief prose summary generated from the most-significant symbols. The RepoMap is designed to fit in the system prompt or a preamble without exhausting the token budget.

### RelevantFileSelector

Given a natural-language query (or a list of target symbol names), this module scores every indexed file by relevance: lexical match against query terms, symbol-name proximity, recent-git-change weighting, and structural proximity to other selected files. The output is an ordered list of `SelectedFiles` — paths plus relevance scores — trimmed to fit within the remaining token budget after the repo map.

### ContextBuilder

The orchestrator that drives the entire pipeline. It accepts a user prompt, runs the stages in order, manages token budgets, and assembles a `BuiltContext` object containing the repo map, the selected files (with optional symbol snippets), git diff context, and any LSP-sourced type/symbol information. This is the primary interface that agent code calls.

### LSPAdapter

A read-only bridge to the TypeScript/JavaScript language server (via `ts_laude` or a similar LSP shim). It handles `textDocument/definition`, `textDocument/references`, and `textDocument/hover` requests using the established SymbolIndex as a starting point, then queries the live LSP server for fine-grained type information, doc comments, and jump targets. Write operations (e.g., `textDocument/rename`) are intentionally excluded; this adapter is query-only.

### CodeGraphAdapter

A placeholder integration for the SQLite-based CodeGraph knowledge graph. At present this module is a stub: it accepts a query and returns an empty result, reserving the adapter interface for future work where symbol-level edges, call graphs, and type-hierarchy queries are served from a pre-computed graph rather than re-derived from source on every request.

---

## Token Budget Strategy

The system operates under a fixed token budget for context. Allocation is strict and ordered:

1. **Repo map first** — always included, approximately 500–2000 tokens depending on repository size. This is the lightweight aerial view.
2. **Selected files next** — fill the remaining budget with the highest-scoring files from `RelevantFileSelector`. Files are added in descending relevance order.
3. **Truncate from the bottom** — if the budget is exhausted mid-file, the file is silently dropped. The lowest-scored (least-relevant) files are the first to be removed.
4. **Symbol snippets** — when a symbol snippet is included (e.g., the signature and doc comment of a matched function), it is capped at 10 lines. Full function bodies are never included in the context unless the file is the sole selected file and budget allows.

This ordering ensures the model always has the big-picture view before diving into file details, and that the most relevant files are never dropped due to budget pressure on less-relevant ones.

---

## CLI Commands

### `altos index`

Scans the workspace and builds all indexes: file tree, git context, and symbol index. Writes the resulting artefacts to `.altos/index/` so that subsequent commands start from cached state rather than re-scanning.

```
altos index [--path <dir>] [--force]
```

**Flags**

- `--path` — root directory to index (defaults to current working directory).
- `--force` — discard existing index and rebuild from scratch.

---

### `altos map`

Displays the generated repo map as human-readable output, optionally as raw JSON.

```
altos map [--json] [--path <dir>]
```

**Flags**

- `--json` — emit raw JSON instead of formatted text.
- `--path` — directory whose map should be displayed (defaults to cwd).

---

### `altos search`

Searches the symbol index by name or kind, returning matching symbols with file paths and line numbers.

```
altos search [--kind <type|function|class|interface|enum>] <query>
```

**Flags**

- `--kind` — filter by symbol kind (e.g., `function`, `class`).
- `<query>` — substring or case-insensitive match against symbol names.

---

## Default Ignore Patterns

The following patterns are always excluded from scanning and indexing. They cannot be re-enabled via configuration in the current release.

| Pattern          | Reason                                      |
|------------------|---------------------------------------------|
| `node_modules/`  | Third-party JavaScript/TypeScript packages  |
| `.git/`          | Git version-control metadata                |
| `dist/`          | Compiled/bundled output                     |
| `build/`         | Build artefacts (Gradle, Maven, etc.)       |
| `__pycache__/`   | Python bytecode cache                       |
| `.next/`         | Next.js build output                        |
| `.nuxt/`         | Nuxt.js build output                        |
| `vendor/`        | Bundled third-party dependencies            |
| `*.pyc`          | Compiled Python bytecode                    |
| `*.class`        | Compiled Java class files                   |
| `.DS_Store`      | macOS metadata                              |
| `Thumbs.db`      | Windows thumbnail cache                     |

Custom ignore patterns may be added via `altos.toml` configuration.

---

## Future Extension Points

The architecture deliberately leaves seams for the following future capabilities:

### Incremental / Watch-Mode Indexing

Currently the index is built on demand (`altos index`) and is static until the next run. A file-system watcher (using `notify` on Linux/macOS or `ReadDirectoryChangesW` equivalent on Windows) could hook into the index pipeline to apply surgical updates — inserting, updating, or removing individual nodes — without a full re-scan. This is the highest-priority extension.

### Multi-Language tree-sitter Parsers

The current SymbolIndex targets TypeScript and JavaScript via tree-sitter grammars (`tree-sitter-typescript`, `tree-sitter-js`). The parser registry is designed to be pluggable: adding Python, Rust, Go, or Java requires registering the appropriate grammar and updating the symbol extraction logic. A language-detection step (file-extension based at first, configurable per-repository) would route files to the correct parser.

### LSP Write Operations

The LSPAdapter is read-only. A future release may expose `textDocument/rename`, `textDocument/codeAction`, and `textDocument/edit` operations, enabling Altos to not just read code but refactor it in place, using the symbol index as a guide for safe, precise changes.

### Vector Similarity Search

The `RelevantFileSelector` currently uses lexical scoring (BM25 or similar) and git-change weighting. A vector index (backed by an embedding model running locally or via an API) would enable semantic search: "find files related to authentication" even when no file contains the word "auth." This would sit behind the same `RelevantFileSelector` interface.

### Full CodeGraph Integration

The `CodeGraphAdapter` is a stub. Once the codebase is indexed by CodeGraph, the adapter can be completed to serve call-graph edges, implementation-hierarchy relationships, and cross-reference counts directly from the SQLite knowledge graph, replacing slower on-disk traversals with sub-millisecond queries.
