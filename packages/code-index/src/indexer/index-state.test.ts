import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  computeContentHash,
  computeSymbolHash,
  diffIndexState,
  diffIndexStateByHash,
  loadIndexState,
  saveIndexState,
  updateIndexState,
  type IndexState,
} from "./index-state.js";

describe("index-state", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "altos-idxstate-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe("computeSymbolHash", () => {
    it("returns the same hash for the same symbols regardless of order", () => {
      const a = [{ name: "foo", kind: "function", line: 1 }];
      const b = [{ name: "foo", kind: "function", line: 1 }];
      const c = [{ name: "foo", kind: "function", line: 1 }].reverse();
      const d = [{ name: "foo", kind: "function", line: 2 }];
      expect(computeSymbolHash(a)).toBe(computeSymbolHash(b));
      expect(computeSymbolHash(a)).toBe(computeSymbolHash(c));
      expect(computeSymbolHash(a)).not.toBe(computeSymbolHash(d));
    });

    it("changes when a symbol is renamed", () => {
      const a = [{ name: "foo", kind: "function", line: 1 }];
      const b = [{ name: "bar", kind: "function", line: 1 }];
      expect(computeSymbolHash(a)).not.toBe(computeSymbolHash(b));
    });

    it("returns 12-char hex string", () => {
      const h = computeSymbolHash([{ name: "x", kind: "class", line: 1 }]);
      expect(h).toMatch(/^[0-9a-f]{12}$/);
    });
  });

  describe("computeContentHash", () => {
    it("is stable for the same content", () => {
      expect(computeContentHash("hello world")).toBe(computeContentHash("hello world"));
    });

    it("changes when content changes by one character", () => {
      expect(computeContentHash("hello world")).not.toBe(computeContentHash("hello World"));
    });

    it("returns 16-char hex string", () => {
      const h = computeContentHash("foo");
      expect(h).toMatch(/^[0-9a-f]{16}$/);
    });
  });

  describe("saveIndexState / loadIndexState", () => {
    it("returns null when no state file exists", () => {
      expect(loadIndexState(tmpRoot)).toBeNull();
    });

    it("round-trips a basic state", () => {
      const state: IndexState = {
        version: 1,
        root: tmpRoot,
        indexedAt: Date.now(),
        files: {
          "src/a.ts": { mtime: 100, size: 50, symbolHash: "abc123" },
          "src/b.ts": { mtime: 200, size: 80, symbolHash: "def456" },
        },
      };
      saveIndexState(tmpRoot, state);
      const loaded = loadIndexState(tmpRoot);
      expect(loaded).not.toBeNull();
      if (loaded === null) throw new Error("state should load");
      expect(loaded.version).toBe(1);
      expect(loaded.files["src/a.ts"]).toEqual({
        mtime: 100,
        size: 50,
        symbolHash: "abc123",
      });
    });

    it("creates .altos directory if missing", () => {
      const state: IndexState = {
        version: 1,
        root: tmpRoot,
        indexedAt: Date.now(),
        files: {},
      };
      saveIndexState(tmpRoot, state);
      expect(fs.existsSync(path.join(tmpRoot, ".altos"))).toBe(true);
      expect(fs.existsSync(path.join(tmpRoot, ".altos", "index-state.json"))).toBe(true);
    });

    it("returns null for corrupted state file", () => {
      fs.mkdirSync(path.join(tmpRoot, ".altos"), { recursive: true });
      fs.writeFileSync(
        path.join(tmpRoot, ".altos", "index-state.json"),
        "{ this is not valid json",
      );
      expect(loadIndexState(tmpRoot)).toBeNull();
    });

    it("returns null for unsupported version", () => {
      fs.mkdirSync(path.join(tmpRoot, ".altos"), { recursive: true });
      fs.writeFileSync(
        path.join(tmpRoot, ".altos", "index-state.json"),
        JSON.stringify({ version: 99, root: tmpRoot, files: {}, indexedAt: 0 }),
      );
      expect(loadIndexState(tmpRoot)).toBeNull();
    });

    it("preserves contentHash when present", () => {
      const state: IndexState = {
        version: 1,
        root: tmpRoot,
        indexedAt: Date.now(),
        files: {
          "src/a.ts": { mtime: 100, size: 50, symbolHash: "abc", contentHash: "deadbeef" },
        },
      };
      saveIndexState(tmpRoot, state);
      const loaded = loadIndexState(tmpRoot);
      expect(loaded).not.toBeNull();
      if (loaded === null) throw new Error("state should load");
      expect(loaded.files["src/a.ts"].contentHash).toBe("deadbeef");
    });
  });

  describe("diffIndexState", () => {
    const make = (files: Record<string, { mtime: number; size: number }>): Map<string, { mtime: number; size: number }> =>
      new Map(Object.entries(files));

    it("with no saved state, every current file is added", () => {
      const cur = make({ "a.ts": { mtime: 1, size: 1 }, "b.ts": { mtime: 2, size: 2 } });
      const diff = diffIndexState(cur, null);
      expect(diff.added.sort()).toEqual(["a.ts", "b.ts"]);
      expect(diff.modified).toEqual([]);
      expect(diff.deleted).toEqual([]);
      expect(diff.unchanged).toEqual([]);
    });

    it("detects added, modified, unchanged, and deleted", () => {
      const saved: IndexState = {
        version: 1,
        root: tmpRoot,
        indexedAt: 0,
        files: {
          "kept.ts": { mtime: 1, size: 1, symbolHash: "h" },
          "modified.ts": { mtime: 1, size: 1, symbolHash: "h" },
          "deleted.ts": { mtime: 1, size: 1, symbolHash: "h" },
        },
      };
      const cur = make({
        "kept.ts": { mtime: 1, size: 1 },
        "modified.ts": { mtime: 2, size: 2 },
        "added.ts": { mtime: 1, size: 1 },
      });

      const diff = diffIndexState(cur, saved);
      expect(diff.added).toEqual(["added.ts"]);
      expect(diff.modified).toEqual(["modified.ts"]);
      expect(diff.deleted).toEqual(["deleted.ts"]);
      expect(diff.unchanged).toEqual(["kept.ts"]);
    });

    it("detects modification by size change", () => {
      const saved: IndexState = {
        version: 1,
        root: tmpRoot,
        indexedAt: 0,
        files: { "x.ts": { mtime: 1, size: 1, symbolHash: "h" } },
      };
      const cur = make({ "x.ts": { mtime: 1, size: 999 } });
      expect(diffIndexState(cur, saved).modified).toEqual(["x.ts"]);
    });

    it("detects modification by mtime change", () => {
      const saved: IndexState = {
        version: 1,
        root: tmpRoot,
        indexedAt: 0,
        files: { "x.ts": { mtime: 1, size: 1, symbolHash: "h" } },
      };
      const cur = make({ "x.ts": { mtime: 2, size: 1 } });
      expect(diffIndexState(cur, saved).modified).toEqual(["x.ts"]);
    });
  });

  describe("diffIndexStateByHash", () => {
    const make = (
      files: Record<string, { mtime: number; size: number; contentHash: string }>,
    ): Map<string, { mtime: number; size: number; contentHash: string }> =>
      new Map(Object.entries(files));

    it("treats files with matching contentHash as unchanged even when mtime differs", () => {
      const saved: IndexState = {
        version: 1,
        root: tmpRoot,
        indexedAt: 0,
        files: {
          "x.ts": { mtime: 1, size: 1, symbolHash: "h", contentHash: "aaa" },
        },
      };
      const cur = make({ "x.ts": { mtime: 2, size: 1, contentHash: "aaa" } });
      expect(diffIndexStateByHash(cur, saved).unchanged).toEqual(["x.ts"]);
    });

    it("flags files with changed contentHash as modified even when mtime/size match", () => {
      const saved: IndexState = {
        version: 1,
        root: tmpRoot,
        indexedAt: 0,
        files: {
          "x.ts": { mtime: 1, size: 1, symbolHash: "h", contentHash: "aaa" },
        },
      };
      const cur = make({ "x.ts": { mtime: 1, size: 1, contentHash: "bbb" } });
      expect(diffIndexStateByHash(cur, saved).modified).toEqual(["x.ts"]);
    });
  });

  describe("updateIndexState", () => {
    it("creates a fresh state when old is null", () => {
      const result = updateIndexState(
        null,
        tmpRoot,
        new Map([["a.ts", { mtime: 1, size: 1, symbolHash: "h" }]]),
        [],
      );
      expect(result.version).toBe(1);
      expect(result.root).toBe(tmpRoot);
      expect(result.files["a.ts"]).toEqual({ mtime: 1, size: 1, symbolHash: "h" });
    });

    it("merges with existing state and removes files", () => {
      const old: IndexState = {
        version: 1,
        root: tmpRoot,
        indexedAt: 0,
        files: {
          "a.ts": { mtime: 1, size: 1, symbolHash: "h1" },
          "b.ts": { mtime: 1, size: 1, symbolHash: "h2" },
        },
      };
      const result = updateIndexState(
        old,
        tmpRoot,
        new Map([["c.ts", { mtime: 2, size: 2, symbolHash: "h3" }]]),
        ["b.ts"],
      );
      expect(Object.keys(result.files).sort()).toEqual(["a.ts", "c.ts"]);
      expect(result.files["a.ts"]).toEqual({ mtime: 1, size: 1, symbolHash: "h1" });
      expect(result.files["c.ts"]).toEqual({ mtime: 2, size: 2, symbolHash: "h3" });
    });

    it("updates the indexedAt timestamp", () => {
      const before = Date.now();
      const result = updateIndexState(null, tmpRoot, new Map(), []);
      expect(result.indexedAt).toBeGreaterThanOrEqual(before);
    });
  });
});