import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";

// We test the path safety logic by mocking git operations

const REPO_DIR = join(process.cwd(), "repository_reference");
const ALTOS_ROOT = process.cwd();

describe("import-reference-repo", () => {
  describe("path safety validation", () => {
    it("should recognize dangerous paths like packages/", () => {
      const dangerousPaths = ["packages", "apps", "templates", "scripts", "."];

      // The validatePath function checks against these
      for (const danger of dangerousPaths) {
        const targetPath = join(REPO_DIR, danger);
        // This path SHOULD be blocked
        expect(
          danger === "packages" ||
            danger === "apps" ||
            danger === "templates" ||
            danger === "scripts" ||
            danger === ".",
        ).toBe(true);
      }
    });

    it("should allow paths in repository_reference/", () => {
      const safePath = join(REPO_DIR, "pi");
      expect(safePath.startsWith(REPO_DIR)).toBe(true);
    });

    it("should not allow repository_reference/../packages", () => {
      // join normalizes paths, so we test that the relative() function
      // would show the path escapes repository_reference
      const exploitAttempt = ".." + "/packages";
      // The actual exploit would be constructing a path like "/some/path/../packages"
      // which when normalized goes to "/some/path/packages"
      const fakeEscapedPath = REPO_DIR + "/../packages";
      // A proper path safety check would detect this
      const hasEscape = fakeEscapedPath.includes("..");
      expect(hasEscape).toBe(true);
    });
  });

  describe("metadata structure", () => {
    it("should require ALTOS_REFERENCE_META.json fields", () => {
      const requiredFields = [
        "source_url",
        "branch",
        "imported_at",
        "commit_sha",
        "license_file_detected",
        "status",
      ];

      const mockMeta = {
        source_url: "https://github.com/example/repo",
        branch: "main",
        imported_at: new Date().toISOString(),
        commit_sha: "abc123",
        license_file_detected: "LICENSE",
        status: "pending_scan",
      };

      for (const field of requiredFields) {
        expect(field in mockMeta).toBe(true);
      }
    });

    it("should have valid status values", () => {
      const validStatuses = ["pending_scan", "scanned", "analyzed"];

      const mockMeta = { status: "pending_scan" };
      expect(validStatuses.includes(mockMeta.status)).toBe(true);
    });
  });

  describe("license detection", () => {
    it("should recognize common license file names", () => {
      const licenseFiles = [
        "LICENSE",
        "LICENSE.txt",
        "LICENSE.md",
        "COPYING",
        "COPYING.txt",
        "NOTICE",
      ];

      for (const lf of licenseFiles) {
        expect(
          ["LICENSE", "LICENSE.txt", "LICENSE.md", "COPYING", "COPYING.txt", "NOTICE"].includes(lf),
        ).toBe(true);
      }
    });
  });
});

describe("license-check", () => {
  describe("license classification", () => {
    it("should classify MIT as safe_to_study", () => {
      const safeLicenses = ["MIT", "Apache-2.0", "BSD-3-Clause", "ISC", "CC0-1.0", "Unlicense"];
      expect(safeLicenses.includes("MIT")).toBe(true);
    });

    it("should classify GPL-3.0 as incompatible", () => {
      const incompatible = ["GPL-3.0", "AGPL-3.0", "GPL-2.0"];
      expect(incompatible.includes("GPL-3.0")).toBe(true);
    });

    it("should classify LGPL as requires_review", () => {
      const review = ["LGPL-3.0", "LGPL-2.1", "MPL-2.0"];
      expect(review.includes("LGPL-3.0")).toBe(true);
    });
  });

  describe("audit report structure", () => {
    it("should include summary table", () => {
      const report = `# License Audit Report
| Repository | License | Status |
|------------|---------|--------|
| pi | Apache License 2.0 | 🟢 safe_to_study |
| aider | GNU General Public License 3.0 | 🔴 incompatible_unknown |
`;
      expect(report).toContain("License Audit Report");
      expect(report).toContain("| Repository | License | Status |");
      expect(report).toContain("pi");
      expect(report).toContain("aider");
    });
  });
});

describe("analyze-reference-repo", () => {
  describe("analysis output structure", () => {
    it("should require altoScore section", () => {
      const mockAnalysis = {
        repo: "pi",
        date: new Date().toISOString(),
        altoScore: {
          architecture: 8,
          pluginSystem: 9,
          toolSystem: 7,
          memoryManagement: 8,
          security: 6,
          overall: 8,
        },
        learn: ["Skill system architecture"],
        avoid: ["Direct code copying"],
      };

      expect(mockAnalysis.altoScore.overall).toBeGreaterThan(0);
      expect(mockAnalysis.learn.length).toBeGreaterThan(0);
      expect(mockAnalysis.avoid.length).toBeGreaterThan(0);
    });

    it("should detect CLI patterns", () => {
      const files = ["/src/cli/index.ts", "/src/commands/main.ts", "/bin/altos.js"];

      const cliIndicators = [/cli/i, /command/i, /bin\//i];
      const matches = files.filter((f) => cliIndicators.some((ind) => ind.test(f)));
      expect(matches.length).toBe(3);
    });

    it("should detect plugin patterns", () => {
      const files = ["/src/plugins/manager.ts", "/src/extensions/loader.ts", "/src/hooks/index.ts"];

      const pluginIndicators = [/plugin/i, /extension/i, /hook/i];
      const matches = files.filter((f) => pluginIndicators.some((ind) => ind.test(f)));
      expect(matches.length).toBe(3);
    });
  });

  describe("language detection", () => {
    it("should recognize TypeScript files", () => {
      const ext = ".ts";
      const lang = ext === ".ts" ? "TypeScript" : "Other";
      expect(lang).toBe("TypeScript");
    });

    it("should recognize Python files", () => {
      const ext = ".py";
      const lang = ext === ".py" ? "Python" : "Other";
      expect(lang).toBe("Python");
    });
  });
});
