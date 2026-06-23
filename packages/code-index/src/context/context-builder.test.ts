import { describe, it, expect, beforeEach } from "vitest";
import path from "path";
import { fileURLToPath } from "url";
import { ContextBuilder } from "./context-builder.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = path.resolve(__dirname, "../../fixtures/simple-ts");

describe("ContextBuilder", () => {
  let builder: ContextBuilder;

  beforeEach(() => {
    builder = new ContextBuilder();
  });

  it("should build context from a prompt", async () => {
    const result = await builder.build({
      workspaceRoot: FIXTURE_ROOT,
      prompt: "index",
      loadFileContent: true,
    });

    expect(result.workspaceRoot).toBe(FIXTURE_ROOT);
    expect(result.prompt).toBe("index");
    expect(result.selectedFiles).toBeDefined();
    expect(result.selectedFiles.length).toBeGreaterThan(0);
    expect(result.repoMap).toBeDefined();
    expect(result.repoMap.root).toBe(FIXTURE_ROOT);
    expect(result.totalTokens).toBeGreaterThan(0);
    expect(result.generatedAt).toBeGreaterThan(0);
    expect(typeof result.toMessages).toBe("function");
  });

  it("should estimate tokens", async () => {
    const result = await builder.build({
      workspaceRoot: FIXTURE_ROOT,
      prompt: "hello",
    });

    expect(result.totalTokens).toBeGreaterThan(0);
    // Rough estimate: repoMap JSON string length / 4 should give a reasonable token count
    const repoMapSize = JSON.stringify(result.repoMap).length;
    expect(result.totalTokens).toBeLessThanOrEqual(Math.ceil(repoMapSize / 4) + 100);
  });

  it("should produce context messages", async () => {
    const result = await builder.build({
      workspaceRoot: FIXTURE_ROOT,
      prompt: "index",
      loadFileContent: true,
    });

    const messages = result.toMessages();
    expect(messages).toBeDefined();
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("# Repository Context");
    expect(messages[0].content).toContain("## Repo Map");
    expect(messages[0].content).toContain("## Selected Files");
    expect(messages[0].metadata).toBeDefined();
    expect(messages[0].metadata?.files).toBeDefined();
    expect(messages[0].metadata?.repoMap).toBeDefined();
  });

  it("should produce messages with file content when loadFileContent=true", async () => {
    const result = await builder.build({
      workspaceRoot: FIXTURE_ROOT,
      prompt: "index",
      loadFileContent: true,
    });

    const messages = result.toMessages();
    const content = messages[0].content;

    // Should have code blocks with content
    expect(content).toContain("```typescript");
    expect(content).toContain("export");
  });

  it("should index and remove files", async () => {
    await builder.indexFile("/test.ts", "export const test = 1;");
    const stats = builder.getIndexStats();
    expect(stats.totalSymbols).toBeGreaterThan(0);

    await builder.removeFile("/test.ts");
    const statsAfter = builder.getIndexStats();
    expect(statsAfter.totalSymbols).toBe(0);
  });

  it("should return repo map", async () => {
    // First build to populate the cache
    await builder.build({
      workspaceRoot: FIXTURE_ROOT,
      prompt: "test",
    });

    const repoMap = builder.getRepoMap();
    expect(repoMap).toBeDefined();
    expect(repoMap?.root).toBe(FIXTURE_ROOT);
  });

  it("should return index stats", async () => {
    // Index a file first
    await builder.indexFile("/test.ts", "export const foo = 1;");

    const stats = builder.getIndexStats();
    expect(stats.totalSymbols).toBeGreaterThan(0);
    expect(stats.totalFiles).toBe(1);
    // indexedAt is set when repoMap is built via build(), not from indexFile alone
    expect(stats.indexedAt).toBeGreaterThanOrEqual(0);
  });

  it("should cache repo map for 1 hour", async () => {
    // Build once
    const result1 = await builder.build({
      workspaceRoot: FIXTURE_ROOT,
      prompt: "test",
    });

    // Build again immediately (should use cache)
    const result2 = await builder.build({
      workspaceRoot: FIXTURE_ROOT,
      prompt: "test2",
    });

    // The repoMap's generatedAt should be the same since both calls
    // return the same cached RepoMap. (ContextBuilder's own generatedAt
    // differs per-call by design, but the cached repoMap is identical.)
    expect(result2.repoMap.generatedAt).toBe(result1.repoMap.generatedAt);
  });
});
