// @altos/code-index - Watch mode
//
// Debounced file watcher that drives incremental indexing. Exposes both
// a programmatic API (`FileWatcher`) and a small helper for converting
// raw OS events into the normalized event types the watcher understands.

import { EventEmitter } from "node:events";

export type WatchEventType = "add" | "change" | "unlink";

export interface WatchEvent {
  type: WatchEventType;
  /** Absolute path of the file that changed. */
  path: string;
  /** Monotonic timestamp (ms). */
  ts: number;
}

export interface FileWatcherOptions {
  /** Debounce window in ms. Default 300. */
  debounceMs?: number;
  /** Minimum interval between re-index runs during event storms. Default 1000. */
  minIntervalMs?: number;
  /** Optional predicate to filter events (e.g. extension check). */
  shouldHandle?: (absolutePath: string) => boolean;
}

export interface FileWatcherInternals {
  /** Emit a watch event through the debouncer. */
  emit: (event: WatchEvent) => void;
  /** Flush any pending work synchronously. */
  flush: () => Promise<void>;
  /** Stop the watcher and cancel any pending timers. */
  stop: () => void;
  /** True if a re-index is currently scheduled or running. */
  hasPendingWork: () => boolean;
}

/**
 * FileWatcher is a debounced event source: callers feed it raw `WatchEvent`s
 * (typically produced by `fs.watch` or polling) and it emits a single,
 * deduplicated batch through its `batch` event after the debounce window
 * has elapsed without further activity.
 *
 * During event storms it coalesces work so that no more than one re-index
 * runs per `minIntervalMs` (default 1000).
 */
export class FileWatcher extends EventEmitter {
  private readonly debounceMs: number;
  private readonly minIntervalMs: number;
  private readonly shouldHandle: ((p: string) => boolean) | undefined;

  /** Pending events, deduplicated by absolute path. */
  private pending = new Map<string, WatchEvent>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  /** Timestamp of the last emitted batch. */
  private lastEmit = 0;
  /** True after stop() is called. */
  private stopped = false;
  /** True when a batch is currently being processed. */
  private running = false;

  constructor(options: FileWatcherOptions = {}) {
    super();
    this.debounceMs = options.debounceMs ?? 300;
    this.minIntervalMs = options.minIntervalMs ?? 1000;
    this.shouldHandle = options.shouldHandle;
  }

  /**
   * Feed an event into the watcher. Returns true if the event was accepted
   * (passed the filter and the watcher is not stopped).
   */
  push(event: WatchEvent): boolean {
    if (this.stopped) return false;
    if (this.shouldHandle && !this.shouldHandle(event.path)) return false;

    // Last write wins for a given path, but unlink takes precedence over
    // change/add for the same path.
    const existing = this.pending.get(event.path);
    if (existing && existing.type === "unlink" && event.type !== "unlink") {
      return false; // ignore change after unlink
    }
    this.pending.set(event.path, event);
    this.schedule();
    return true;
  }

  /**
   * Stop the watcher. Pending events are dropped.
   */
  stop(): void {
    this.stopped = true;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.pending.clear();
  }

  /**
   * True if events are queued or a batch is being processed.
   */
  hasPendingWork(): boolean {
    return this.pending.size > 0 || this.running;
  }

  /**
   * Number of distinct paths currently queued.
   */
  pendingCount(): number {
    return this.pending.size;
  }

  private schedule(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    const sinceLast = Date.now() - this.lastEmit;
    // During event storms we still emit at least every minIntervalMs.
    const wait = Math.max(this.debounceMs, this.minIntervalMs - sinceLast);

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.flush();
    }, wait);
  }

  /**
   * Force emission of the current batch (useful for tests).
   */
  async flush(): Promise<void> {
    if (this.running || this.pending.size === 0) return;
    this.running = true;

    const batch = Array.from(this.pending.values());
    this.pending.clear();
    this.lastEmit = Date.now();

    try {
      await this.emitBatch(batch);
    } finally {
      this.running = false;
    }
  }

  private async emitBatch(batch: WatchEvent[]): Promise<void> {
    // Emit a synchronous "batch" event; subscribers can return a promise that
    // we await so the next batch is held until this one finishes.
    const listeners = this.listeners("batch");
    for (const listener of listeners) {
      const result = listener(batch);
      if (result instanceof Promise) {
        await result.catch((err) => {
          this.emit("error", err);
        });
      }
    }
  }
}

/**
 * Convenience: classify a raw fs.watch event into our WatchEventType.
 * Returns null if the event is irrelevant.
 */
export function classifyFsEvent(eventType: string, filename: string | null): WatchEventType | null {
  if (!filename) return null;
  if (eventType === "rename") {
    // rename fires for both add and unlink; we cannot tell from the event
    // alone which it is, so callers should stat() the file.
    return "change";
  }
  if (eventType === "change") return "change";
  return null;
}

/**
 * Heuristic for fs.watch rename events: if the file exists, treat as "change";
 * otherwise treat as "unlink". Caller provides a stat function for testability.
 */
export async function resolveRename(
  absolutePath: string,
  statFn: (p: string) => Promise<boolean>,
): Promise<WatchEventType> {
  const exists = await statFn(absolutePath);
  return exists ? "change" : "unlink";
}
