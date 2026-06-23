import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * IndexState represents the persisted state of the symbol index.
 * Stored in `.altos/index-state.json` at the workspace root.
 */
export interface FileIndexState {
  /** Last modified time when indexed (ms since epoch) */
  mtime: number;
  /** File size when indexed (bytes) */
  size: number;
  /** Hash of serialized symbols — changes when symbols change */
  symbolHash: string;
  /** Hash of the file content at index time. Optional; older states may not have it. */
  contentHash?: string;
}

export interface IndexState {
  version: 1;
  root: string;
  files: Record<string, FileIndexState>;
  indexedAt: number;
}

export interface DiffResult {
  added: string[];
  modified: string[];
  deleted: string[];
  unchanged: string[];
}

const INDEX_STATE_FILENAME = ".altos/index-state.json";

/**
 * Compute a hash of symbol data for change detection.
 * We hash the sorted JSON of symbol names and kinds.
 */
export function computeSymbolHash(
  symbols: Array<{ name: string; kind: string; line: number }>,
): string {
  const normalized = symbols
    .map((s) => `${s.kind}:${s.name}@${s.line}`)
    .sort()
    .join("|");
  return crypto.createHash("md5").update(normalized).digest("hex").slice(0, 12);
}

/**
 * Compute a stable short hash of arbitrary string content. Used to detect
 * file changes that do not change the symbol set (whitespace, comments).
 */
export function computeContentHash(content: string): string {
  return crypto.createHash("md5").update(content).digest("hex").slice(0, 16);
}

/**
 * Load index state from disk.
 * Returns null if no state exists or state is corrupted.
 */
export function loadIndexState(root: string): IndexState | null {
  const statePath = path.join(root, INDEX_STATE_FILENAME);
  try {
    if (!fs.existsSync(statePath)) {
      return null;
    }
    const content = fs.readFileSync(statePath, "utf-8");
    const state = JSON.parse(content) as IndexState;
    if (state.version !== 1) {
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

/**
 * Save index state to disk.
 */
export function saveIndexState(root: string, state: IndexState): void {
  const statePath = path.join(root, INDEX_STATE_FILENAME);
  const altosDir = path.join(root, ".altos");

  if (!fs.existsSync(altosDir)) {
    fs.mkdirSync(altosDir, { recursive: true });
  }

  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
}

/**
 * Diff current file list against saved state to determine what changed.
 *
 * A file is `modified` if its mtime or size differs from the persisted state.
 * (Content-hash comparison happens later in the orchestration layer where
 *  the file content is actually read.)
 */
export function diffIndexState(
  currentFiles: Map<string, { mtime: number; size: number }>,
  savedState: IndexState | null,
): DiffResult {
  const result: DiffResult = {
    added: [],
    modified: [],
    deleted: [],
    unchanged: [],
  };

  if (!savedState) {
    for (const [filePath] of currentFiles) {
      result.added.push(filePath);
    }
    return result;
  }

  const savedFiles = savedState.files;

  for (const [filePath, info] of currentFiles) {
    const saved = savedFiles[filePath];
    if (!saved) {
      result.added.push(filePath);
    } else if (saved.mtime !== info.mtime || saved.size !== info.size) {
      result.modified.push(filePath);
    } else {
      result.unchanged.push(filePath);
    }
  }

  for (const filePath of Object.keys(savedFiles)) {
    if (!currentFiles.has(filePath)) {
      result.deleted.push(filePath);
    }
  }

  return result;
}

/**
 * A more thorough diff that takes file content hashes into account. Returns
 * the same shape as `diffIndexState`, but treats a file with a matching
 * contentHash as `unchanged` even when mtime/size differ (some filesystems
 * update mtime without changing content).
 */
export function diffIndexStateByHash(
  currentFiles: Map<string, { mtime: number; size: number; contentHash: string }>,
  savedState: IndexState | null,
): DiffResult {
  const result: DiffResult = {
    added: [],
    modified: [],
    deleted: [],
    unchanged: [],
  };

  if (!savedState) {
    for (const [filePath] of currentFiles) {
      result.added.push(filePath);
    }
    return result;
  }

  for (const [filePath, info] of currentFiles) {
    const saved = savedState.files[filePath];
    if (!saved) {
      result.added.push(filePath);
      continue;
    }

    // If a contentHash was recorded, use it as the source of truth — even
    // when mtime/size match, a contentHash mismatch means the file's bytes
    // actually changed and must be re-indexed.
    if (saved.contentHash !== undefined) {
      if (saved.contentHash === info.contentHash) {
        result.unchanged.push(filePath);
      } else {
        result.modified.push(filePath);
      }
      continue;
    }

    // No contentHash recorded: fall back to mtime/size.
    if (saved.mtime !== info.mtime || saved.size !== info.size) {
      result.modified.push(filePath);
    } else {
      result.unchanged.push(filePath);
    }
  }

  for (const filePath of Object.keys(savedState.files)) {
    if (!currentFiles.has(filePath)) {
      result.deleted.push(filePath);
    }
  }

  return result;
}

/**
 * Build updated index state after indexing.
 */
export function updateIndexState(
  oldState: IndexState | null,
  root: string,
  indexedFiles: Map<
    string,
    { mtime: number; size: number; symbolHash: string; contentHash?: string }
  >,
  removedFiles: string[],
): IndexState {
  const newState: IndexState = {
    version: 1,
    root,
    files: oldState?.files ? { ...oldState.files } : {},
    indexedAt: Date.now(),
  };

  for (const filePath of removedFiles) {
    delete newState.files[filePath];
  }

  for (const [filePath, info] of indexedFiles) {
    newState.files[filePath] = {
      mtime: info.mtime,
      size: info.size,
      symbolHash: info.symbolHash,
      contentHash: info.contentHash,
    };
  }

  return newState;
}
