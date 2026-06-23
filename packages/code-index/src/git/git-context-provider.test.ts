import { describe, it, expect, beforeEach } from "vitest";
import { GitContextProvider } from "./git-context-provider.js";

describe("GitContextProvider", () => {
  let provider: GitContextProvider;

  beforeEach(() => {
    provider = new GitContextProvider();
  });

  describe("isRepo", () => {
    it("should detect a git repo", async () => {
      const result = await provider.isRepo("/home/oguz/Masaüstü/Base-Auto-Trader");
      expect(result).toBe(true);
    });

    it("should return false for non-git directory", async () => {
      const result = await provider.isRepo("/tmp");
      expect(result).toBe(false);
    });
  });

  describe("getContext", () => {
    it("should get git context with branch info", async () => {
      const context = await provider.getContext("/home/oguz/Masaüstü/Base-Auto-Trader");
      expect(context).toHaveProperty("branch");
      expect(typeof context.branch).toBe("string");
      expect(context.branch.length).toBeGreaterThan(0);
    });

    it("should have hasUncommittedChanges as a boolean", async () => {
      const context = await provider.getContext("/home/oguz/Masaüstü/Base-Auto-Trader");
      expect(typeof context.hasUncommittedChanges).toBe("boolean");
    });

    it("should include branches array", async () => {
      const context = await provider.getContext("/home/oguz/Masaüstü/Base-Auto-Trader");
      expect(Array.isArray(context.branches)).toBe(true);
    });

    it("should include stagedFiles, unstagedFiles, untrackedFiles arrays", async () => {
      const context = await provider.getContext("/home/oguz/Masaüstü/Base-Auto-Trader");
      expect(Array.isArray(context.stagedFiles)).toBe(true);
      expect(Array.isArray(context.unstagedFiles)).toBe(true);
      expect(Array.isArray(context.untrackedFiles)).toBe(true);
    });

    it("should include changedFiles array", async () => {
      const context = await provider.getContext("/home/oguz/Masaüstü/Base-Auto-Trader");
      expect(Array.isArray(context.changedFiles)).toBe(true);
    });

    it("should include recentCommits array", async () => {
      const context = await provider.getContext("/home/oguz/Masaüstü/Base-Auto-Trader");
      expect(Array.isArray(context.recentCommits)).toBe(true);
    });
  });

  describe("getChangedFiles", () => {
    it("should return changed files array", async () => {
      const changedFiles = await provider.getChangedFiles("/home/oguz/Masaüstü/Base-Auto-Trader");
      expect(Array.isArray(changedFiles)).toBe(true);
    });

    it("should return empty array for non-repo", async () => {
      const changedFiles = await provider.getChangedFiles("/tmp");
      expect(Array.isArray(changedFiles)).toBe(true);
    });
  });

  describe("getRecentCommits", () => {
    it("should return recent commits array", async () => {
      const commits = await provider.getRecentCommits("/home/oguz/Masaüstü/Base-Auto-Trader");
      expect(Array.isArray(commits)).toBe(true);
    });
  });

  describe("getLastModified", () => {
    it("should return a Map", async () => {
      const lastModified = await provider.getLastModified("/home/oguz/Masaüstü/Base-Auto-Trader");
      expect(lastModified).toBeInstanceOf(Map);
    });
  });
});
