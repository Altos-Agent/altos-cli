import * as fs from "fs";
import * as path from "path";
import { WorkspaceScanner } from "../../scanner/workspace-scanner.js";
import { SymbolIndex } from "../../symbols/symbol-index.js";
import { RepoMapBuilder } from "../../repo-map/repo-map-builder.js";
import {
  runIncrementalIndex,
  FileWatcher,
  classifyFsEvent,
  resolveRename,
  type WatchEvent,
} from "../../indexer/index.js";
import type { IndexCommandOptions } from "./index.js";

const DEBOUNCE_MS = 300;
const MIN_POLL_INTERVAL_MS = 500;
const FILE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

function isIndexableFile(filename: string): boolean {
  if (!filename) return false;
  const ext = path.extname(filename).toLowerCase();
  return FILE_EXTENSIONS.has(ext);
}

/**
 * Run a one-shot incremental index.
 *
 * - If `force` is true, drop the persisted state and re-index everything.
 * - Otherwise, load prior state and only re-parse changed files.
 *
 * Outputs human-readable status to stdout (unless `quiet` is set).
 */
async function runOneShot(options: IndexCommandOptions): Promise<number> {
  const rootPath = options.path ?? process.cwd();
  const startedAt = Date.now();

  const scanner = new WorkspaceScanner();
  const symbolIndex = new SymbolIndex();
  const repoMapBuilder = new RepoMapBuilder();

  if (!options.quiet) {
    console.log(`[index] starting (root: ${rootPath}${options.force ? ", force=true" : ""})`);
  }

  const stats = await runIncrementalIndex(rootPath, symbolIndex, scanner, {
    forceFull: options.force,
  });

  // Build repo map (always)
  const repoMap = await repoMapBuilder.build(rootPath, scanner, symbolIndex);

  const durationMs = Date.now() - startedAt;
  const scanStats = scanner.getStats();
  const symbolStats = symbolIndex.getStats();

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          stats,
          scanStats,
          symbolStats,
          repoMap,
        },
        null,
        2,
      ),
    );
  } else if (options.stats) {
    console.log("Index Run:");
    console.log(`  Mode:            ${stats.incremental ? "incremental" : "full"}`);
    console.log(`  Discovered:      ${stats.discovered}`);
    console.log(`  Indexed:         ${stats.indexed}`);
    console.log(`  Skipped:         ${stats.skipped}`);
    console.log(`  Removed:         ${stats.removed}`);
    console.log(`  Duration:        ${stats.durationMs}ms`);
    console.log("Scan Statistics:");
    console.log(`  Total files scanned: ${scanStats.totalFiles}`);
    console.log(`  By language: ${JSON.stringify(scanStats.byLanguage)}`);
    console.log(`  Scan time: ${scanStats.scanTimeMs}ms`);
    console.log("\nSymbol Statistics:");
    console.log(`  Total symbols: ${symbolStats.totalSymbols}`);
    console.log(`  Total files with symbols: ${symbolStats.totalFiles}`);
    console.log("\nRepository Statistics:");
    console.log(`  Packages: ${repoMap.packages.length}`);
  } else if (!options.quiet) {
    const mode = stats.incremental ? "incremental" : "full";
    console.log(
      `[index] ${mode} done in ${durationMs}ms — indexed ${stats.indexed}, skipped ${stats.skipped}, removed ${stats.removed}, total ${symbolStats.totalSymbols} symbols`,
    );
  } else {
    console.log(`${symbolStats.totalFiles} files, ${symbolStats.totalSymbols} symbols`);
  }

  return 0;
}

/**
 * Run watch mode: long-lived process that re-indexes on file changes.
 */
async function runWatchMode(options: IndexCommandOptions): Promise<number> {
  const rootPath = options.path ?? process.cwd();
  const pollInterval =
    options.poll && options.poll >= MIN_POLL_INTERVAL_MS ? options.poll : null;

  console.log(
    `[watch] starting (root: ${rootPath}${pollInterval ? `, poll=${pollInterval}ms` : ""})`,
  );

  const symbolIndex = new SymbolIndex();
  const scanner = new WorkspaceScanner();

  // Initial index
  console.log("[index] initial index starting...");
  const initial = await runIncrementalIndex(rootPath, symbolIndex, scanner);
  console.log(
    `[index] initial index done — indexed ${initial.indexed} files, ${symbolIndex.getStats().totalSymbols} symbols in ${initial.durationMs}ms`,
  );

  const watcher = new FileWatcher({
    debounceMs: DEBOUNCE_MS,
    minIntervalMs: 1000,
    shouldHandle: isIndexableFile,
  });

  let batchCount = 0;
  let inFlight: Promise<void> = Promise.resolve();

  watcher.on("batch", async (events: WatchEvent[]) => {
    // Serialize batch processing: do not start the next batch until the
    // current one finishes.
    inFlight = inFlight.then(async () => {
      const startedAt = Date.now();
      batchCount++;
      const seq = batchCount;
      console.log(
        `[watch] batch #${seq}: ${events.length} file event(s) (added=${events.filter((e) => e.type === "add").length}, changed=${events.filter((e) => e.type === "change").length}, deleted=${events.filter((e) => e.type === "unlink").length})`,
      );

      // Apply deletes immediately
      const removed: string[] = [];
      for (const ev of events) {
        if (ev.type === "unlink") {
          const rel = path.relative(rootPath, ev.path).replace(/\\/g, "/");
          symbolIndex.removeFile(rel);
          removed.push(rel);
        }
      }

      // Re-index changed/added files
      const changedContents = new Map<string, string>();
      for (const ev of events) {
        if (ev.type === "unlink") continue;
        const rel = path.relative(rootPath, ev.path).replace(/\\/g, "/");
        try {
          const content = fs.readFileSync(ev.path, "utf-8");
          changedContents.set(rel, content);
        } catch {
          // file might have been removed between event and read; skip
        }
      }

      if (changedContents.size > 0) {
        await symbolIndex.indexFilesIncremental(changedContents);
      }

      // Persist updated state by re-running a lightweight indexer pass.
      // This is acceptable because we have already updated symbolIndex above.
      const persisted = await runIncrementalIndex(rootPath, symbolIndex, scanner, {
        skipPersist: false,
      });

      const duration = Date.now() - startedAt;
      console.log(
        `[watch] batch #${seq} done in ${duration}ms — re-indexed ${persisted.indexed}, removed ${removed.length}`,
      );
      console.log("[watch] ready");
    });
    await inFlight.catch((err) => {
      console.error(`[watch] batch error: ${err}`);
    });
  });

  watcher.on("error", (err) => {
    console.error(`[watch] error: ${err}`);
  });

  console.log("[watch] ready (initial scan complete)");

  // Choose watcher strategy
  if (pollInterval) {
    await runPollingWatcher(rootPath, watcher, pollInterval);
  } else {
    await runNativeWatcher(rootPath, watcher);
  }

  return 0;
}

async function runNativeWatcher(rootPath: string, watcher: FileWatcher): Promise<void> {
  const handle = async (eventType: string, filename: string | null) => {
    if (!filename) return;
    const classified = classifyFsEvent(eventType, filename);
    if (!classified) return;

    const absolutePath = path.join(rootPath, filename);
    let resolved: WatchEvent["type"] = classified;
    if (eventType === "rename") {
      resolved = await resolveRename(absolutePath, async (p) => {
        try {
          await fs.promises.stat(p);
          return true;
        } catch {
          return false;
        }
      });
    }
    watcher.push({ type: resolved, path: absolutePath, ts: Date.now() });
  };

  const fsWatcher = fs.watch(rootPath, { recursive: true }, handle);

  await new Promise<void>((resolve) => {
    const stop = () => {
      watcher.stop();
      try {
        fsWatcher.close();
      } catch {
        // ignore
      }
      console.log("\n[watch] stopped");
      resolve();
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
}

async function runPollingWatcher(
  rootPath: string,
  watcher: FileWatcher,
  pollInterval: number,
): Promise<void> {
  const interval = pollInterval;
  const scanner = new WorkspaceScanner();
  const fileMtimes = new Map<string, number>();

  // Initial mtime snapshot
  for await (const entry of scanner.scan(rootPath)) {
    if (isIndexableFile(entry.absolutePath)) {
      fileMtimes.set(entry.path, entry.mtime);
    }
  }

  let running = true;
  const poll = async () => {
    while (running) {
      await new Promise((r) => setTimeout(r, interval));

      const current = new Map<string, number>();
      for await (const entry of scanner.scan(rootPath)) {
        if (!isIndexableFile(entry.absolutePath)) continue;
        current.set(entry.path, entry.mtime);
        const last = fileMtimes.get(entry.path);
        if (last === undefined || last !== entry.mtime) {
          watcher.push({ type: "change", path: entry.absolutePath, ts: Date.now() });
          fileMtimes.set(entry.path, entry.mtime);
        }
      }

      // Detections for deleted files
      for (const [rel] of fileMtimes) {
        if (!current.has(rel)) {
          watcher.push({
            type: "unlink",
            path: path.join(rootPath, rel),
            ts: Date.now(),
          });
          fileMtimes.delete(rel);
        }
      }
    }
  };

  poll();

  await new Promise<void>((resolve) => {
    const stop = () => {
      running = false;
      watcher.stop();
      console.log("\n[watch] stopped");
      resolve();
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
}

export async function runIndexCommand(
  options: IndexCommandOptions
): Promise<number> {
  if (options.watch) {
    return runWatchMode(options);
  }
  return runOneShot(options);
}