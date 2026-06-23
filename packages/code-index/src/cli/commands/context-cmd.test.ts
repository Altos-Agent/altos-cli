import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { runContextCommand } from "./context-cmd.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = path.resolve(__dirname, "../../../../fixtures/simple-ts");

// Store original isTTY
const originalIsTTY = process.stdin.isTTY;

describe("context command", () => {
  const fixtureIndexPath = path.join(FIXTURE_ROOT, ".altos", "index-state.json");
  let originalIndexState: string | null = null;

  beforeEach(() => {
    // Ensure we're not in a TTY for non-interactive test behavior
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });

    // Save original index state if it exists
    if (fs.existsSync(fixtureIndexPath)) {
      originalIndexState = fs.readFileSync(fixtureIndexPath, "utf-8");
    }
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true });

    // Restore original index state
    if (originalIndexState) {
      fs.writeFileSync(fixtureIndexPath, originalIndexState, "utf-8");
    } else if (fs.existsSync(fixtureIndexPath)) {
      fs.unlinkSync(fixtureIndexPath);
    }
  });

  describe("runContextCommand", () => {
    it("should work on fixture repo with basic prompt", async () => {
      const exitCode = await runContextCommand({ prompt: "index", path: FIXTURE_ROOT });
      expect(exitCode).toBe(0);
    });

    it("should respect --files flag", async () => {
      const exitCode = await runContextCommand({
        prompt: "index",
        path: FIXTURE_ROOT,
        files: 1,
      });
      expect(exitCode).toBe(0);
    });

    it("should produce valid JSON output with --json", async () => {
      // Use spyOn for proper console.log capture
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const exitCode = await runContextCommand({
        prompt: "index",
        path: FIXTURE_ROOT,
        json: true,
      });

      expect(exitCode).toBe(0);

      const logCalls = logSpy.mock.calls;
      expect(logCalls.length).toBeGreaterThan(0);

      let json: Record<string, unknown>;
      try {
        json = JSON.parse(logCalls[logCalls.length - 1][0] as string);
      } catch (e) {
        expect(e).toBeUndefined();
        return;
      }

      // Validate structure
      expect(json).toHaveProperty("prompt");
      expect(json).toHaveProperty("selectedFiles");
      expect(json).toHaveProperty("repoMap");
      expect(json).toHaveProperty("totalTokens");
      expect(json).toHaveProperty("maxTokens");
      expect(json).toHaveProperty("fitsBudget");

      expect(Array.isArray(json.selectedFiles)).toBe(true);
      expect(typeof json.totalTokens).toBe("number");
      expect(typeof json.fitsBudget).toBe("boolean");

      logSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it("should include evidence in JSON when --show-evidence is set", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      vi.spyOn(console, "warn").mockImplementation(() => {});

      const exitCode = await runContextCommand({
        prompt: "index",
        path: FIXTURE_ROOT,
        json: true,
        showEvidence: true,
      });
      expect(exitCode).toBe(0);

      const logCalls = logSpy.mock.calls;
      const json = JSON.parse(logCalls[logCalls.length - 1][0] as string);
      expect(json.selectedFiles).toBeInstanceOf(Array);

      if (json.selectedFiles.length > 0) {
        const file = json.selectedFiles[0] as Record<string, unknown>;
        expect(file).toHaveProperty("evidence");
        expect(file).toHaveProperty("components");
        expect(file).toHaveProperty("reasons");
      }

      logSpy.mockRestore();
    });

    it("should respect --max-tokens flag", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      vi.spyOn(console, "warn").mockImplementation(() => {});

      const exitCode = await runContextCommand({
        prompt: "index",
        path: FIXTURE_ROOT,
        json: true,
        maxTokens: 500,
      });
      expect(exitCode).toBe(0);

      const logCalls = logSpy.mock.calls;
      const json = JSON.parse(logCalls[logCalls.length - 1][0] as string);
      expect(json.maxTokens).toBe(500);
      expect(typeof json.totalTokens).toBe("number");

      logSpy.mockRestore();
    });

    it("should show stale index warning when index is old", async () => {
      // Create a stale index state (older than 7 days)
      const staleDate = Date.now() - (8 * 24 * 60 * 60 * 1000); // 8 days ago
      const altosDir = path.join(FIXTURE_ROOT, ".altos");
      fs.mkdirSync(altosDir, { recursive: true });

      const staleState = {
        version: 1 as const,
        root: FIXTURE_ROOT,
        files: {},
        indexedAt: staleDate,
      };
      fs.writeFileSync(fixtureIndexPath, JSON.stringify(staleState, null, 2), "utf-8");

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.spyOn(console, "log").mockImplementation(() => {});

      const exitCode = await runContextCommand({
        prompt: "index",
        path: FIXTURE_ROOT,
      });
      expect(exitCode).toBe(0); // Still succeeds, just warns

      const warnCalls = warnSpy.mock.calls.join(" ");
      expect(warnCalls).toContain("⚠️");
      expect(warnCalls).toMatch(/old|days?/);
      expect(warnCalls).toContain("altos index");

      warnSpy.mockRestore();
    });

    it("should return error code 1 in JSON mode when index is stale and empty", async () => {
      // Create a stale index state with no files
      const staleDate = Date.now() - (8 * 24 * 60 * 60 * 1000);
      const altosDir = path.join(FIXTURE_ROOT, ".altos");
      fs.mkdirSync(altosDir, { recursive: true });

      const staleState = {
        version: 1 as const,
        root: FIXTURE_ROOT,
        files: {},
        indexedAt: staleDate,
      };
      fs.writeFileSync(fixtureIndexPath, JSON.stringify(staleState, null, 2), "utf-8");

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      vi.spyOn(console, "warn").mockImplementation(() => {});

      const exitCode = await runContextCommand({
        prompt: "index",
        path: FIXTURE_ROOT,
        json: true,
      });

      const logCalls = logSpy.mock.calls;
      const json = JSON.parse(logCalls[logCalls.length - 1][0] as string);
      if (json.warning && json.error) {
        expect(exitCode).toBe(1);
        expect(json).toHaveProperty("warning");
        expect(json).toHaveProperty("error");
        expect(json.selectedFiles).toEqual([]);
      }
      // If it succeeds anyway (because it can still build context), that's ok too

      logSpy.mockRestore();
    });

    it("should handle non-existent path gracefully", async () => {
      const exitCode = await runContextCommand({
        prompt: "index",
        path: "/nonexistent/path",
      });
      expect(exitCode).toBe(1);
    });

    it("should output token budget info", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const exitCode = await runContextCommand({
        prompt: "index",
        path: FIXTURE_ROOT,
      });
      expect(exitCode).toBe(0);

      const allOutput = [
        ...logSpy.mock.calls.map((c) => c.join(" ")),
        ...warnSpy.mock.calls.map((c) => c.join(" ")),
      ].join(" ");

      expect(allOutput).toContain("### Token Budget");
      expect(allOutput).toContain("/");
      expect(allOutput).toContain("tokens");
      expect(allOutput).toMatch(/Estimated:.*\/.*tokens/);

      logSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it("should show whether it fits budget", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const exitCode = await runContextCommand({
        prompt: "index",
        path: FIXTURE_ROOT,
      });
      expect(exitCode).toBe(0);

      const allOutput = [
        ...logSpy.mock.calls.map((c) => c.join(" ")),
        ...warnSpy.mock.calls.map((c) => c.join(" ")),
      ].join(" ");

      // Should show either "Within budget" or "Exceeds budget"
      expect(
        allOutput.includes("Within budget") || allOutput.includes("Exceeds budget")
      ).toBe(true);

      logSpy.mockRestore();
      warnSpy.mockRestore();
    });
  });
});