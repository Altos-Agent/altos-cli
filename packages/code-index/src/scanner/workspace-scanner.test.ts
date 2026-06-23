import { describe, it, expect, beforeEach } from "vitest";
import path from "path";
import fs from "fs";
import { WorkspaceScanner } from "./workspace-scanner.js";

const FIXTURE_ROOT = "/home/oguz/Masaüstü/AltosAgent/packages/code-index/fixtures/simple-ts";

describe("WorkspaceScanner", () => {
  let scanner: WorkspaceScanner;

  beforeEach(() => {
    scanner = new WorkspaceScanner();
  });

  it("should scan a TypeScript project", async () => {
    const entries: string[] = [];
    for await (const entry of scanner.scan(FIXTURE_ROOT)) {
      entries.push(entry.path);
    }

    expect(entries.length).toBeGreaterThan(0);
    expect(entries.some((e) => e.includes("package.json"))).toBe(true);
  });

  it("should ignore node_modules", async () => {
    const entries: string[] = [];
    for await (const entry of scanner.scan(FIXTURE_ROOT)) {
      entries.push(entry.path);
    }

    expect(entries.some((e) => e.includes("node_modules"))).toBe(false);
  });

  it("should detect TypeScript files", async () => {
    const entries: string[] = [];
    for await (const entry of scanner.scan(FIXTURE_ROOT)) {
      entries.push(entry.path);
    }

    expect(entries.some((e) => e.endsWith(".ts"))).toBe(true);
  });

  it("should detect test files", async () => {
    // Create a test file
    const testFilePath = path.join(FIXTURE_ROOT, "src", "example.test.ts");
    fs.writeFileSync(testFilePath, "export const test = () => {}");

    try {
      const entries: string[] = [];
      for await (const entry of scanner.scan(FIXTURE_ROOT)) {
        entries.push(entry.path);
      }

      const testEntry = entries.find((e) => e.includes("example.test.ts"));
      expect(testEntry).toBeDefined();
    } finally {
      fs.unlinkSync(testFilePath);
    }
  });

  it("should detect config files", async () => {
    const entries: string[] = [];
    for await (const entry of scanner.scan(FIXTURE_ROOT)) {
      entries.push(entry.path);
    }

    const configEntry = entries.find((e) => e.includes("package.json"));
    expect(configEntry).toBeDefined();
  });

  it("should respect additional ignores", async () => {
    // Create a file to ignore
    const ignoreMePath = path.join(FIXTURE_ROOT, "ignore-me.txt");
    fs.writeFileSync(ignoreMePath, "ignore me");

    try {
      const entries: string[] = [];
      for await (const entry of scanner.scan(FIXTURE_ROOT, { ignores: ["ignore-me.txt"] })) {
        entries.push(entry.path);
      }

      expect(entries.some((e) => e.includes("ignore-me.txt"))).toBe(false);
    } finally {
      fs.unlinkSync(ignoreMePath);
    }
  });

  it("should respect maxDepth", async () => {
    // Create nested directories
    const deepDir = path.join(FIXTURE_ROOT, "src", "deep", "nested");
    fs.mkdirSync(deepDir, { recursive: true });
    const deepFile = path.join(deepDir, "deep.ts");
    fs.writeFileSync(deepFile, "export const deep = true");

    try {
      const entriesDepth0: string[] = [];
      for await (const entry of scanner.scan(FIXTURE_ROOT, { maxDepth: 0 })) {
        entriesDepth0.push(entry.path);
      }

      // At depth 0 we should only get direct children of FIXTURE_ROOT
      expect(entriesDepth0.some((e) => e.includes("deep"))).toBe(false);
    } finally {
      fs.unlinkSync(deepFile);
      fs.rmdirSync(path.join(FIXTURE_ROOT, "src", "deep", "nested"));
      fs.rmdirSync(path.join(FIXTURE_ROOT, "src", "deep"));
    }
  });

  it("should get stats", async () => {
    const entries: string[] = [];
    for await (const entry of scanner.scan(FIXTURE_ROOT)) {
      entries.push(entry.path);
    }

    const stats = scanner.getStats();
    expect(stats.totalFiles).toBe(entries.length);
    expect(stats.totalDirs).toBeGreaterThan(0);
    expect(stats.byLanguage).toBeDefined();
    expect(stats.scanTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("should scan sync", () => {
    const entries = scanner.scanSync(FIXTURE_ROOT);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.some((e) => e.path.includes("package.json"))).toBe(true);
  });
});
