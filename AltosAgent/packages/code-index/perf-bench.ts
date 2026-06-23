// Standalone perf harness for capturing numbers for the report.
// Not part of the test suite — run with: npx tsx packages/code-index/perf-bench.ts

import fs from "node:fs";
import path from "node:path";
import { SymbolIndex } from "./src/symbols/symbol-index.js";
import { WorkspaceScanner } from "./src/scanner/workspace-scanner.js";
import { runIncrementalIndex } from "./src/indexer/index.js";
import { generateFixture, FIXTURE_100, FIXTURE_1K } from "./src/bench/fixtures.js";

function walk(dir: string, ext: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, ext, out);
    else if (full.endsWith(ext)) out.push(full);
  }
}

async function main() {
  console.log("=== Phase 21.1 Performance Harness ===\n");

  // 100-file fixture: cold + warm-with-state
  {
    const root = await generateFixture(FIXTURE_100);

    // Cold run
    const idx1 = new SymbolIndex();
    const scanner = new WorkspaceScanner();
    const coldStart = Date.now();
    const cold = await runIncrementalIndex(root, idx1, scanner);
    const coldMs = Date.now() - coldStart;

    // Warm run with persisted state: fresh SymbolIndex, but state is on disk
    // so the diff should skip everything.
    const idx2 = new SymbolIndex();
    const warmStart = Date.now();
    const warm = await runIncrementalIndex(root, idx2, scanner);
    const warmMs = Date.now() - warmStart;

    console.log(`100-file fixture (TS portion, ${cold.discovered} files)`);
    console.log(`  Cold run (parse + persist):   indexed=${cold.indexed} duration=${coldMs}ms`);
    console.log(`  Warm run (state exists, but in-memory idx is empty):`);
    console.log(`    indexed=${warm.indexed} skipped=${warm.skipped} duration=${warmMs}ms`);
    console.log(`  Cold→warm (idx already populated, no state on disk):`);

    const idx3 = new SymbolIndex();
    await runIncrementalIndex(root, idx3, scanner, { skipPersist: true });
    const skipStart = Date.now();
    const skipRun = await runIncrementalIndex(root, idx3, scanner, { skipPersist: true });
    const skipMs = Date.now() - skipStart;
    console.log(`    indexed=${skipRun.indexed} skipped=${skipRun.skipped} duration=${skipMs}ms`);
    console.log(`  Speedup (warm-true vs cold):   ${(coldMs / Math.max(1, skipMs)).toFixed(1)}x\n`);
  }

  // 1000-file fixture
  {
    const root = await generateFixture(FIXTURE_1K);

    const idx1 = new SymbolIndex();
    const scanner = new WorkspaceScanner();
    const coldStart = Date.now();
    const cold = await runIncrementalIndex(root, idx1, scanner);
    const coldMs = Date.now() - coldStart;

    const idx3 = new SymbolIndex();
    await runIncrementalIndex(root, idx3, scanner, { skipPersist: true });
    const skipStart = Date.now();
    const skipRun = await runIncrementalIndex(root, idx3, scanner, { skipPersist: true });
    const skipMs = Date.now() - skipStart;

    console.log(`1000-file fixture (${cold.discovered} TS files)`);
    console.log(`  Cold run:    indexed=${cold.indexed} duration=${coldMs}ms`);
    console.log(`  Warm-skip:   indexed=${skipRun.indexed} skipped=${skipRun.skipped} duration=${skipMs}ms`);
    console.log(`  Speedup:     ${(coldMs / Math.max(1, skipMs)).toFixed(1)}x\n`);
  }

  // Modify one file
  {
    const root = await generateFixture(FIXTURE_100);
    const idx = new SymbolIndex();
    const scanner = new WorkspaceScanner();
    await runIncrementalIndex(root, idx, scanner);

    const tsFiles: string[] = [];
    walk(root, ".ts", tsFiles);
    const target = tsFiles[0];
    const relTarget = target.replace(root + "/", "");

    // Wait so mtime differs
    await new Promise((r) => setTimeout(r, 30));
    fs.writeFileSync(target, `export function modified() { return 42; }\n`);

    const start = Date.now();
    const result = await runIncrementalIndex(root, idx, scanner);
    const ms = Date.now() - start;

    console.log(`Modify 1 file in 100-file fixture (warm)`);
    console.log(`  Discovered:  ${result.discovered}`);
    console.log(`  Indexed:     ${result.indexed} (expect ~1)`);
    console.log(`  Skipped:     ${result.skipped}`);
    console.log(`  Duration:    ${ms}ms`);
    console.log(`  modified() in index: ${idx.getFileSymbols(relTarget).some((s) => s.name === "modified")}\n`);
  }

  // Watch mode: simulate burst of events, measure batching latency
  {
    const { FileWatcher } = await import("./src/indexer/watch.js");
    const watcher = new FileWatcher({ debounceMs: 300, minIntervalMs: 1000 });
    const batches: number[] = [];
    watcher.on("batch", (b: unknown[]) => batches.push(b.length));

    const start = Date.now();
    for (let i = 0; i < 50; i++) {
      watcher.push({ type: "change", path: `/file${i}.ts`, ts: Date.now() });
    }
    await new Promise((r) => setTimeout(r, 400));
    const elapsed = Date.now() - start;

    console.log(`Watch mode: burst of 50 events`);
    console.log(`  Batches emitted: ${batches.length}`);
    console.log(`  Total events:    ${batches.reduce((a, b) => a + b, 0)}`);
    console.log(`  Time to first batch: ~${elapsed}ms (debounce=300)`);
    watcher.stop();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});