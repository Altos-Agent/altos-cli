import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorkspaceScanner } from "../scanner/workspace-scanner.js";
import { SymbolIndex } from "../symbols/symbol-index.js";
import {
  clearIndexState,
  getIndexStatePath,
  loadIndexState,
  runIncrementalIndex,
} from "./index.js";

function writeFile(root: string, rel: string, content: string): string {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf-8");
  return abs;
}

function makeProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "altos-indexer-"));
  // Create a .gitignore so the scanner doesn't pick up noise.
  writeFile(root, ".gitignore", "node_modules\n");
  return root;
}

describe("runIncrementalIndex", () => {
  let root: string;
  let symbolIndex: SymbolIndex;
  let scanner: WorkspaceScanner;

  beforeEach(() => {
    root = makeProject();
    symbolIndex = new SymbolIndex();
    scanner = new WorkspaceScanner();
  });

  afterEach(() => {
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("creates initial state when none exists", async () => {
    writeFile(root, "src/a.ts", "export function a() { return 1; }");
    writeFile(root, "src/b.ts", "export class B {}");

    const stats = await runIncrementalIndex(root, symbolIndex, scanner, { skipPersist: true });
    expect(stats.discovered).toBe(2);
    expect(stats.indexed).toBe(2);
    expect(stats.incremental).toBe(false);
    expect(stats.durationMs).toBeGreaterThanOrEqual(0);

    expect(symbolIndex.getStats().totalFiles).toBe(2);
    expect(symbolIndex.getFileSymbols("src/a.ts").length).toBeGreaterThan(0);
    expect(symbolIndex.getFileSymbols("src/b.ts").length).toBeGreaterThan(0);
  });

  it("persists .altos/index-state.json when no skipPersist", async () => {
    writeFile(root, "src/a.ts", "export const a = 1;");

    const stats = await runIncrementalIndex(root, symbolIndex, scanner);
    expect(stats.discovered).toBe(1);

    const statePath = getIndexStatePath(root);
    expect(fs.existsSync(statePath)).toBe(true);

    const state = loadIndexState(root);
    expect(state).not.toBeNull();
    if (state === null) throw new Error("state should load");
    expect(Object.keys(state.files)).toContain("src/a.ts");
  });

  it("is a no-op for unchanged repo (incremental=true, indexed=0)", async () => {
    writeFile(root, "src/a.ts", "export const a = 1;");
    writeFile(root, "src/b.ts", "export const b = 2;");

    // First run: full index
    const first = await runIncrementalIndex(root, symbolIndex, scanner);
    expect(first.indexed).toBe(2);
    expect(first.incremental).toBe(false);

    // Second run with the SAME symbolIndex: should be incremental and skip everything
    // because the symbolIndex already has those files.
    const second = await runIncrementalIndex(root, symbolIndex, scanner);
    expect(second.incremental).toBe(true);
    expect(second.indexed).toBe(0);
    expect(second.skipped).toBeGreaterThanOrEqual(2);
    expect(second.removed).toBe(0);
  });

  it("re-parses all files when the symbolIndex is empty (cold start)", async () => {
    writeFile(root, "src/a.ts", "export const a = 1;");
    writeFile(root, "src/b.ts", "export const b = 2;");
    await runIncrementalIndex(root, symbolIndex, scanner);

    // Simulate a fresh process: brand-new SymbolIndex, but the state file is on disk.
    const fresh = new SymbolIndex();
    const second = await runIncrementalIndex(root, fresh, scanner);
    expect(second.incremental).toBe(true);
    expect(second.indexed).toBe(2);
    expect(fresh.getStats().totalSymbols).toBeGreaterThan(0);
  });

  it("re-indexes only the modified file on content change", async () => {
    writeFile(root, "src/a.ts", "export const a = 1;");
    writeFile(root, "src/b.ts", "export const b = 2;");

    await runIncrementalIndex(root, symbolIndex, scanner);
    const beforeSymbols = symbolIndex.getFileSymbols("src/a.ts").length;
    expect(beforeSymbols).toBeGreaterThan(0);

    // Wait so mtime definitely changes
    await new Promise((r) => setTimeout(r, 20));

    // Modify only a.ts
    writeFile(root, "src/a.ts", "export function aNew() { return 42; }\nexport const a = 1;");

    const stats = await runIncrementalIndex(root, symbolIndex, scanner);
    expect(stats.indexed).toBeGreaterThanOrEqual(1);
    expect(stats.incremental).toBe(true);

    const afterSymbols = symbolIndex.getFileSymbols("src/a.ts");
    expect(afterSymbols.some((s) => s.name === "aNew")).toBe(true);
  });

  it("removes symbols for deleted files", async () => {
    writeFile(root, "src/a.ts", "export const a = 1;");
    writeFile(root, "src/b.ts", "export const b = 2;");

    await runIncrementalIndex(root, symbolIndex, scanner);
    expect(symbolIndex.getFileSymbols("src/b.ts").length).toBeGreaterThan(0);

    // Delete b.ts
    fs.unlinkSync(path.join(root, "src/b.ts"));

    const stats = await runIncrementalIndex(root, symbolIndex, scanner);
    expect(stats.removed).toBe(1);

    expect(symbolIndex.getFileSymbols("src/b.ts").length).toBe(0);
    expect(symbolIndex.getFileSymbols("src/a.ts").length).toBeGreaterThan(0);
  });

  it("adds symbols for newly added files", async () => {
    writeFile(root, "src/a.ts", "export const a = 1;");
    await runIncrementalIndex(root, symbolIndex, scanner);

    writeFile(root, "src/new.ts", "export function newlyAdded() {}");

    const stats = await runIncrementalIndex(root, symbolIndex, scanner);
    expect(stats.indexed).toBeGreaterThanOrEqual(1);

    expect(symbolIndex.getFileSymbols("src/new.ts").length).toBeGreaterThan(0);
  });

  it("forceFull re-indexes everything", async () => {
    writeFile(root, "src/a.ts", "export const a = 1;");
    writeFile(root, "src/b.ts", "export const b = 2;");
    await runIncrementalIndex(root, symbolIndex, scanner);

    const stats = await runIncrementalIndex(root, symbolIndex, scanner, { forceFull: true });
    expect(stats.incremental).toBe(false);
    expect(stats.indexed).toBe(2);
  });

  it("ignores node_modules, dist, build, coverage, .next, .cache", async () => {
    // These files should NOT be indexed (they are in DEFAULT_IGNORES)
    writeFile(root, "node_modules/pkg/index.ts", "export const a = 1;");
    writeFile(root, "dist/out.ts", "export const b = 2;");
    writeFile(root, "build/out.ts", "export const c = 3;");
    writeFile(root, "coverage/lcov.ts", "export const d = 4;");
    writeFile(root, ".next/cache.ts", "export const e = 5;");
    writeFile(root, ".cache/c.ts", "export const f = 6;");

    // This file SHOULD be indexed
    writeFile(root, "src/real.ts", "export const g = 7;");

    const stats = await runIncrementalIndex(root, symbolIndex, scanner, { skipPersist: true });
    expect(stats.discovered).toBe(1);
    expect(symbolIndex.getFileSymbols("src/real.ts").length).toBeGreaterThan(0);
  });

  it("clearIndexState removes the persisted file", async () => {
    writeFile(root, "src/a.ts", "export const a = 1;");
    await runIncrementalIndex(root, symbolIndex, scanner);

    expect(fs.existsSync(getIndexStatePath(root))).toBe(true);
    expect(clearIndexState(root)).toBe(true);
    expect(fs.existsSync(getIndexStatePath(root))).toBe(false);
    // Idempotent
    expect(clearIndexState(root)).toBe(false);
  });
});
