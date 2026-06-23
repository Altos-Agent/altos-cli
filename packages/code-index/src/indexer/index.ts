// @altos/code-index - Indexer orchestration
//
// This module ties together the workspace scanner, the symbol index, and the
// persisted `.altos/index-state.json` so callers can do incremental indexing
// without knowing about the lower-level primitives.

import fs from "node:fs";
import path from "node:path";
import { WorkspaceScanner } from "../scanner/workspace-scanner.js";
import type { SymbolIndex } from "../symbols/symbol-index.js";
import { parseTS } from "../symbols/tree-sitter-parser.js";
import {
  type DiffResult,
  type FileIndexState,
  computeSymbolHash,
  diffIndexState,
  loadIndexState,
  saveIndexState,
  updateIndexState,
} from "./index-state.js";

export {
  loadIndexState,
  saveIndexState,
  diffIndexState,
  updateIndexState,
  computeSymbolHash,
  computeContentHash,
  type IndexState,
  type FileIndexState,
  type DiffResult,
} from "./index-state.js";

// Watch mode (debounced batched re-indexing)
export {
  FileWatcher,
  classifyFsEvent,
  resolveRename,
  type WatchEvent,
  type WatchEventType,
  type FileWatcherOptions,
} from "./watch.js";

export type { IndexingResult } from "../symbols/symbol-index.js";

const STATE_REL_PATH = ".altos/index-state.json";

/**
 * Aggregate statistics returned by an indexing run.
 */
export interface IndexRunStats {
  /** Files discovered by the workspace scanner. */
  discovered: number;
  /** Files that were actually parsed and indexed. */
  indexed: number;
  /** Files that were skipped because they had not changed. */
  skipped: number;
  /** Files removed because they no longer exist. */
  removed: number;
  /** Duration of the run in milliseconds. */
  durationMs: number;
  /** True if the run was incremental (state existed). */
  incremental: boolean;
}

/**
 * Options for `runIncrementalIndex`.
 */
export interface IncrementalIndexOptions {
  /** Skip persistence of the index state (used by tests). */
  skipPersist?: boolean;
  /** Force a full re-index even when a saved state exists. */
  forceFull?: boolean;
}

/**
 * Discover files in a workspace and feed them through the SymbolIndex,
 * respecting the persisted IndexState when present. Returns the run stats.
 *
 * The function:
 * 1. Scans the workspace for TS/JS files (respecting `DEFAULT_IGNORES`).
 * 2. Loads the persisted `IndexState` if it exists.
 * 3. Diffs current files against the persisted state to detect
 *    added / modified / deleted files.
 * 4. Re-parses only added + modified files (and clears deleted ones).
 * 5. Persists the updated `IndexState`.
 */
export async function runIncrementalIndex(
  root: string,
  symbolIndex: SymbolIndex,
  scanner: WorkspaceScanner = new WorkspaceScanner(),
  options: IncrementalIndexOptions = {},
): Promise<IndexRunStats> {
  const startTime = Date.now();

  // 1. Discover current files (mtime + size + relative path).
  const currentFiles = new Map<string, { mtime: number; size: number; content: string }>();

  for await (const entry of scanner.scan(root)) {
    if (entry.language !== "typescript" && entry.language !== "javascript") continue;

    try {
      const content = fs.readFileSync(entry.absolutePath, "utf-8");
      currentFiles.set(entry.path, {
        mtime: entry.mtime,
        size: entry.size,
        content,
      });
    } catch {
      // Skip unreadable files
    }
  }

  // 2. Load prior state.
  const priorState = options.forceFull ? null : loadIndexState(root);
  const incremental = priorState !== null;

  // 3. Diff against prior state (mtime + size only — no content read yet).
  const metaMap = new Map<string, { mtime: number; size: number }>();
  for (const [file, info] of currentFiles) {
    metaMap.set(file, { mtime: info.mtime, size: info.size });
  }
  const diff: DiffResult = diffIndexState(metaMap, priorState);

  // 4. Apply the diff.
  let indexed = 0;
  let skipped = 0;
  let removed = 0;

  // If the caller hands us an empty SymbolIndex but a state file exists,
  // we need to re-parse every file to populate it. The "incremental" flag
  // is still true (state was loaded) but no skip optimization applies.
  const symbolIndexIsEmpty = symbolIndex.getStats().totalFiles === 0;

  // Deletions
  if (diff.deleted.length > 0) {
    symbolIndex.removeFiles(diff.deleted);
    removed = diff.deleted.length;
  }

  // Additions + modifications: only re-parse what we actually need to.
  // For a true no-op run, even modified files can be skipped if the persisted
  // content hash matches (mtime could change without content change on some FS).
  const needsParse = new Map<string, string>();
  const priorHashes = new Map<string, string>();

  for (const file of diff.added) {
    const info = currentFiles.get(file);
    if (!info) continue;
    needsParse.set(file, info.content);
  }

  for (const file of diff.modified) {
    const info = currentFiles.get(file);
    if (!info) continue;

    const prior = priorState?.files[file];
    if (
      !symbolIndexIsEmpty &&
      prior?.symbolHash &&
      prior.mtime === info.mtime &&
      prior.size === info.size
    ) {
      // mtime + size match but we still need to recompute content hash to be safe
      // (skip if the persisted hash matches the new content hash)
      const newHash = computeSymbolHash(parseTS(info.content, file).symbols);
      if (newHash === prior.symbolHash) {
        skipped++;
        continue;
      }
      needsParse.set(file, info.content);
    } else {
      needsParse.set(file, info.content);
    }
  }

  // Unchanged files: skip re-parse, but only if the symbolIndex is non-empty.
  for (const file of diff.unchanged) {
    if (!symbolIndexIsEmpty) {
      const prior = priorState?.files[file];
      if (prior?.symbolHash) {
        priorHashes.set(file, prior.symbolHash);
      }
      skipped++;
      continue;
    }
    // Re-parse to populate the empty symbolIndex.
    const info = currentFiles.get(file);
    if (info) {
      needsParse.set(file, info.content);
    }
  }

  // Now actually parse the files we still need to.
  for (const [file, content] of needsParse) {
    try {
      await symbolIndex.indexFile(file, content);
      indexed++;
      const symbols = symbolIndex.getFileSymbols(file);
      priorHashes.set(
        file,
        computeSymbolHash(symbols.map((s) => ({ name: s.name, kind: s.kind, line: s.line }))),
      );
    } catch {
      // tree-sitter may throw on malformed TypeScript — skip the file gracefully
    }
  }

  // 5. Persist updated state.
  if (!options.skipPersist) {
    const newFileStates = new Map<string, FileIndexState>();
    // Files we just parsed: use the freshly-computed hash.
    for (const [file, hash] of priorHashes) {
      const info = currentFiles.get(file);
      if (!info) continue;
      newFileStates.set(file, {
        mtime: info.mtime,
        size: info.size,
        symbolHash: hash,
      });
    }
    // Files we didn't re-parse: carry over their prior hash from the state.
    if (priorState) {
      for (const [file, info] of Object.entries(priorState.files)) {
        if (!newFileStates.has(file) && currentFiles.has(file)) {
          const cur = currentFiles.get(file);
          if (!cur) continue;
          newFileStates.set(file, {
            mtime: cur.mtime,
            size: cur.size,
            symbolHash: info.symbolHash,
          });
        }
      }
    }
    const newState = updateIndexState(priorState, root, newFileStates, diff.deleted);
    saveIndexState(root, newState);
  }

  return {
    discovered: currentFiles.size,
    indexed,
    skipped,
    removed,
    durationMs: Date.now() - startTime,
    incremental,
  };
}

/**
 * Build the absolute path to the persisted index-state file for a root.
 */
export function getIndexStatePath(root: string): string {
  return path.join(root, STATE_REL_PATH);
}

/**
 * Remove the persisted state file, if any. Returns true if a file was deleted.
 */
export function clearIndexState(root: string): boolean {
  const p = getIndexStatePath(root);
  try {
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      return true;
    }
  } catch {
    // Ignore
  }
  return false;
}
// touch
