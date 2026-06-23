import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileWatcher, type WatchEvent, classifyFsEvent, resolveRename } from "./watch.js";

describe("FileWatcher", () => {
  let watcher: FileWatcher;
  let batches: WatchEvent[][];

  beforeEach(() => {
    vi.useFakeTimers();
    batches = [];
    watcher = new FileWatcher({ debounceMs: 300, minIntervalMs: 1000 });
    watcher.on("batch", (b: WatchEvent[]) => {
      batches.push(b);
    });
  });

  afterEach(async () => {
    watcher.stop();
    vi.useRealTimers();
  });

  function push(type: WatchEvent["type"], path: string) {
    return watcher.push({ type, path, ts: Date.now() });
  }

  it("coalesces multiple events for one path within the debounce window", async () => {
    push("change", "/a.ts");
    push("change", "/a.ts");
    push("change", "/a.ts");

    expect(watcher.pendingCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(300);

    expect(batches.length).toBe(1);
    expect(batches[0]).toHaveLength(1);
    expect(batches[0][0].path).toBe("/a.ts");
    expect(batches[0][0].type).toBe("change");
  });

  it("debounces separate paths into one batch", async () => {
    push("change", "/a.ts");
    push("change", "/b.ts");
    push("change", "/c.ts");

    expect(watcher.pendingCount()).toBe(3);

    await vi.advanceTimersByTimeAsync(300);

    expect(batches.length).toBe(1);
    expect(batches[0].map((e) => e.path).sort()).toEqual(["/a.ts", "/b.ts", "/c.ts"]);
  });

  it("resets the debounce timer when more events arrive", async () => {
    push("change", "/a.ts");
    await vi.advanceTimersByTimeAsync(200);
    expect(batches.length).toBe(0);

    push("change", "/b.ts");
    // After 200 more ms the original 300-window would have elapsed,
    // but the timer was reset so no batch yet.
    await vi.advanceTimersByTimeAsync(200);
    expect(batches.length).toBe(0);

    // 300ms after the last push → batch fires
    await vi.advanceTimersByTimeAsync(100);
    expect(batches.length).toBe(1);
    expect(batches[0].map((e) => e.path).sort()).toEqual(["/a.ts", "/b.ts"]);
  });

  it("unlink wins over change/add for the same path", async () => {
    push("change", "/x.ts");
    push("unlink", "/x.ts");
    push("change", "/x.ts"); // should be ignored

    await vi.advanceTimersByTimeAsync(300);
    expect(batches.length).toBe(1);
    expect(batches[0]).toHaveLength(1);
    expect(batches[0][0].type).toBe("unlink");
  });

  it("rate-limits to one batch per minIntervalMs during storms", async () => {
    // First batch
    push("change", "/a.ts");
    await vi.advanceTimersByTimeAsync(300);
    expect(batches.length).toBe(1);

    // Another event 100ms later — should wait
    push("change", "/b.ts");
    await vi.advanceTimersByTimeAsync(100);
    expect(batches.length).toBe(1); // not yet

    // After minIntervalMs (1000ms) since last emit, emit even if debounce isn't up
    await vi.advanceTimersByTimeAsync(900);
    expect(batches.length).toBe(2);
  });

  it("rejects events that don't pass the filter", async () => {
    const filtered = new FileWatcher({
      debounceMs: 100,
      shouldHandle: (p) => p.endsWith(".ts"),
    });
    const filteredBatches: WatchEvent[][] = [];
    filtered.on("batch", (b: WatchEvent[]) => filteredBatches.push(b));

    filtered.push({ type: "change", path: "/a.ts", ts: Date.now() });
    filtered.push({ type: "change", path: "/b.js", ts: Date.now() });

    await vi.advanceTimersByTimeAsync(100);
    expect(filteredBatches.length).toBe(1);
    expect(filteredBatches[0]).toHaveLength(1);
    expect(filteredBatches[0][0].path).toBe("/a.ts");
    filtered.stop();
  });

  it("flush() emits the current batch synchronously", async () => {
    push("change", "/a.ts");
    push("change", "/b.ts");

    expect(batches.length).toBe(0);
    await watcher.flush();
    expect(batches.length).toBe(1);
    expect(batches[0]).toHaveLength(2);
  });

  it("flush() is a no-op when no events are pending", async () => {
    await watcher.flush();
    expect(batches.length).toBe(0);
  });

  it("stop() drops pending events and refuses new ones", async () => {
    push("change", "/a.ts");
    watcher.stop();
    expect(watcher.push({ type: "change", path: "/b.ts", ts: Date.now() })).toBe(false);

    await vi.advanceTimersByTimeAsync(1000);
    expect(batches.length).toBe(0);
  });

  it("hasPendingWork reflects state", async () => {
    expect(watcher.hasPendingWork()).toBe(false);
    push("change", "/a.ts");
    expect(watcher.hasPendingWork()).toBe(true);
    await watcher.flush();
    expect(watcher.hasPendingWork()).toBe(false);
  });
});

describe("classifyFsEvent", () => {
  it("returns null when filename is null", () => {
    expect(classifyFsEvent("change", null)).toBeNull();
  });

  it("returns 'change' for rename events (caller must stat() to disambiguate)", () => {
    expect(classifyFsEvent("rename", "x.ts")).toBe("change");
  });

  it("returns 'change' for change events", () => {
    expect(classifyFsEvent("change", "x.ts")).toBe("change");
  });
});

describe("resolveRename", () => {
  it("returns 'change' when the file exists", async () => {
    const stat = vi.fn().mockResolvedValue(true);
    expect(await resolveRename("/x.ts", stat)).toBe("change");
    expect(stat).toHaveBeenCalledWith("/x.ts");
  });

  it("returns 'unlink' when the file is gone", async () => {
    const stat = vi.fn().mockResolvedValue(false);
    expect(await resolveRename("/x.ts", stat)).toBe("unlink");
  });
});
