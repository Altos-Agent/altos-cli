// Performance tests for incremental indexing and watch mode.
//
// These tests are gated on a fixed budget per fixture so they fail loudly
// if the implementation regresses, but the budgets are generous enough that
// a normal CI environment can run them within seconds.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { SymbolIndex } from "../symbols/symbol-index.js";
import { WorkspaceScanner } from "../scanner/workspace-scanner.js";
import { runIncrementalIndex } from "../indexer/index.js";
import { FileWatcher } from "../indexer/watch.js";
import { generateFixture, FIXTURE_100, FIXTURE_1K } from "./fixtures.js";

describe("Performance: incremental indexing", () => {
  let root: string;

  beforeEach(() => {
    root = "";
  });

  afterEach(() => {
    if (root && fs.existsSync(root)) {
      try {
        fs.rmSync(root, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it("indexes 100 files in under 5 seconds", async () => {
    root = await generateFixture(FIXTURE_100);
    const symbolIndex = new SymbolIndex();
    const scanner = new WorkspaceScanner();

    const startedAt = Date.now();
    const stats = await runIncrementalIndex(root, symbolIndex, scanner, { skipPersist: true });
    const elapsed = Date.now() - startedAt;

    expect(stats.discovered).toBeGreaterThan(0);
    expect(stats.indexed).toBe(stats.discovered);
    expect(elapsed).toBeLessThan(5000);
  }, 30_000);

  it("indexes 1000 files (config has 1000 files, ~70% are TS) in under 30 seconds", async () => {
    root = await generateFixture(FIXTURE_1K);
    const symbolIndex = new SymbolIndex();
    const scanner = new WorkspaceScanner();

    const startedAt = Date.now();
    const stats = await runIncrementalIndex(root, symbolIndex, scanner, { skipPersist: true });
    const elapsed = Date.now() - startedAt;

    // FIXTURE_1K declares 1000 files total, 600 of which are TS. The scanner
    // only indexes TS/JS so discovered is bounded by the TS portion.
    expect(stats.discovered).toBeGreaterThan(200);
    expect(stats.indexed).toBe(stats.discovered);
    expect(elapsed).toBeLessThan(30_000);
  }, 60_000);

  it("no-op incremental run is much faster than the cold run", async () => {
    root = await generateFixture(FIXTURE_100);
    const symbolIndex = new SymbolIndex();
    const scanner = new WorkspaceScanner();

    // Cold run (with persistence so the state file is on disk for the next run)
    const coldStart = Date.now();
    await runIncrementalIndex(root, symbolIndex, scanner);
    const coldMs = Date.now() - coldStart;

    // Warm incremental run with the SAME symbolIndex — should skip everything.
    const warmStart = Date.now();
    const warm = await runIncrementalIndex(root, symbolIndex, scanner);
    const warmMs = Date.now() - warmStart;

    expect(warm.indexed).toBe(0);
    expect(warm.skipped).toBeGreaterThan(0);
    expect(warmMs).toBeLessThan(coldMs);
    expect(warmMs).toBeLessThan(1000);
  }, 30_000);

  it("modifying one file re-indexes only that file", async () => {
    root = await generateFixture(FIXTURE_100);
    const symbolIndex = new SymbolIndex();
    const scanner = new WorkspaceScanner();

    // First run with persistence so the state file exists.
    await runIncrementalIndex(root, symbolIndex, scanner);

    // Find a real TS file and modify it
    const allFiles: string[] = [];
    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (full.endsWith(".ts")) allFiles.push(full);
      }
    }
    walk(root);
    expect(allFiles.length).toBeGreaterThan(0);
    const target = allFiles[0];
    const relTarget = target.replace(root + "/", "");

    // Force a guaranteed mtime change rather than relying on a sleep
    // (avoids flakiness on slow or fast filesystems).
    const newMtime = new Date(Date.now() + 60_000);
    fs.utimesSync(target, newMtime, newMtime);
    fs.writeFileSync(target, `export function modified() { return 42; }\n`);

    const stats = await runIncrementalIndex(root, symbolIndex, scanner);

    expect(stats.indexed).toBeGreaterThanOrEqual(1);
    expect(stats.indexed).toBeLessThan(stats.discovered);
    // The modified file should now have the new symbol.
    const afterSymbols = symbolIndex.getFileSymbols(relTarget);
    expect(afterSymbols.some((s) => s.name === "modified")).toBe(true);
  }, 30_000);
});

describe("Performance: watch mode debounce", () => {
  it("coalesces a burst of events into one batch within ~400ms", async () => {
    const watcher = new FileWatcher({ debounceMs: 300, minIntervalMs: 1000 });
    const batches: number[] = [];
    watcher.on("batch", (b) => batches.push(b.length));

    // Burst of 50 events in quick succession
    const start = Date.now();
    for (let i = 0; i < 50; i++) {
      watcher.push({ type: "change", path: `/file${i}.ts`, ts: Date.now() });
    }
    // Wait for the debounce window plus a small buffer
    await new Promise((r) => setTimeout(r, 450));
    const elapsed = Date.now() - start;

    expect(batches.length).toBe(1);
    expect(batches[0]).toBe(50);
    expect(elapsed).toBeLessThan(2000);
    watcher.stop();
  });

  it("responds to a single event within the debounce window", async () => {
    const watcher = new FileWatcher({ debounceMs: 100, minIntervalMs: 500 });
    let batchCount = 0;
    let firstBatchLatency = -1;
    const start = Date.now();
    watcher.on("batch", () => {
      batchCount++;
      if (firstBatchLatency < 0) firstBatchLatency = Date.now() - start;
    });

    watcher.push({ type: "change", path: "/x.ts", ts: Date.now() });
    await new Promise((r) => setTimeout(r, 250));

    expect(batchCount).toBe(1);
    expect(firstBatchLatency).toBeLessThan(500);
    expect(firstBatchLatency).toBeGreaterThanOrEqual(100);
    watcher.stop();
  });
});