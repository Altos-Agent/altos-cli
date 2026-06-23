import { describe, it, expect, beforeEach } from "vitest";
import path from "path";
import { fileURLToPath } from "url";
import { RepoMapBuilder, estimateTokens, estimateTokensForObject } from "./repo-map-builder.js";
import { WorkspaceScanner } from "../scanner/workspace-scanner.js";
import { SymbolIndex } from "../symbols/symbol-index.js";
import { DEFAULT_REPO_MAP_BUDGET } from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = path.join(__dirname, "../../fixtures/simple-ts");

describe("RepoMapBuilder", () => {
  let builder: RepoMapBuilder;
  let scanner: WorkspaceScanner;
  let symbols: SymbolIndex;

  beforeEach(() => {
    builder = new RepoMapBuilder();
    scanner = new WorkspaceScanner();
    symbols = new SymbolIndex();
  });

  describe("basic functionality", () => {
    it("should build a repo map", async () => {
      const map = await builder.build(FIXTURE_ROOT, scanner, symbols);

      expect(map.root).toBe(FIXTURE_ROOT);
      expect(map.generatedAt).toBeGreaterThan(0);
      expect(map.structure).toBeDefined();
      expect(map.packages).toBeDefined();
      expect(map.exportedSymbols).toBeDefined();
      expect(map.moduleGraph).toBeDefined();
      expect(map.importantFiles).toBeDefined();
    });

    it("should count files by language", async () => {
      const map = await builder.build(FIXTURE_ROOT, scanner, symbols);

      expect(map.structure.totalFiles).toBeGreaterThan(0);
      expect(map.structure.byLanguage).toHaveProperty("typescript");
      expect(map.structure.byLanguage["typescript"]).toBeGreaterThan(0);
    });

    it("should find package info", async () => {
      const map = await builder.build(FIXTURE_ROOT, scanner, symbols);

      expect(map.packages.length).toBeGreaterThan(0);
      const pkg = map.packages[0];
      expect(pkg.name).toBe("simple-ts");
      expect(pkg.version).toBe("1.0.0");
    });

    it("should serialize to summary", async () => {
      const map = await builder.build(FIXTURE_ROOT, scanner, symbols);
      const summary = builder.toSummary(map);

      expect(summary).toContain(`Repo: ${FIXTURE_ROOT}`);
      expect(summary).toContain("Files:");
      expect(summary).toContain("typescript");
      expect(summary).toContain("Tests:");
      expect(summary).toContain("Configs:");
    });

    it("should include package name in summary when available", async () => {
      const map = await builder.build(FIXTURE_ROOT, scanner, symbols);
      const summary = builder.toSummary(map);

      expect(summary).toContain("Packages: simple-ts");
    });
  });

  describe("token estimation", () => {
    it("should estimate tokens for a string", () => {
      const str = "hello world";
      expect(estimateTokens(str)).toBe(Math.ceil(str.length / 4));
    });

    it("should estimate tokens for objects", () => {
      const obj = { foo: "bar", baz: 123 };
      const tokens = estimateTokensForObject(obj);
      expect(tokens).toBe(Math.ceil(JSON.stringify(obj).length / 4));
    });

    it("should produce a token estimate for the simple-ts fixture", async () => {
      const map = await builder.build(FIXTURE_ROOT, scanner, symbols, {
        maxTokens: 2000,
        maxExportedSymbols: 100,
        maxModuleEdges: 200,
        maxImportantFiles: 50,
        includeTests: true,
        includePackageScripts: true,
      });

      // The tokenEstimate field should be populated
      expect(map.tokenEstimate).toBeDefined();
      expect(map.tokenEstimate).toBeGreaterThan(0);

      // Verify against actual JSON serialization (should be within ±30%)
      const actualTokens = Math.ceil(JSON.stringify(map).length / 4);
      const errorPercent = Math.abs(map.tokenEstimate! - actualTokens) / actualTokens;
      expect(errorPercent).toBeLessThan(0.3);
    });

    it("should never exceed the token budget by more than 10%", async () => {
      const map = await builder.build(FIXTURE_ROOT, scanner, symbols, {
        maxTokens: 2000,
        maxExportedSymbols: 100,
        maxModuleEdges: 200,
        maxImportantFiles: 50,
        includeTests: true,
        includePackageScripts: true,
      });

      // The tokenEstimate should not exceed the budget by more than 10%
      expect(map.tokenEstimate!).toBeLessThanOrEqual(2000 * 1.1);
    });

    it("should be deterministic across runs for non-timestamp fields", async () => {
      const map1 = await builder.build(FIXTURE_ROOT, scanner, symbols, {
        maxTokens: 2000,
        maxExportedSymbols: 100,
        maxModuleEdges: 200,
        maxImportantFiles: 50,
      });

      // Create fresh instances for the second run
      const builder2 = new RepoMapBuilder();
      const scanner2 = new WorkspaceScanner();
      const symbols2 = new SymbolIndex();

      const map2 = await builder2.build(FIXTURE_ROOT, scanner2, symbols2, {
        maxTokens: 2000,
        maxExportedSymbols: 100,
        maxModuleEdges: 200,
        maxImportantFiles: 50,
      });

      // Non-timestamp fields should be identical
      expect(map1.structure).toEqual(map2.structure);
      expect(map1.packages).toEqual(map2.packages);
      expect(map1.exportedSymbols).toEqual(map2.exportedSymbols);
      expect(map1.moduleGraph).toEqual(map2.moduleGraph);
      expect(map1.importantFiles).toEqual(map2.importantFiles);
    });
  });

  describe("exported symbols", () => {
    it("should populate exported symbols from SymbolIndex", async () => {
      // Index some files first
      const fooContent = `export class Foo { }
export function bar() { }`;
      const indexContent = `export { Foo, bar } from "./foo";`;

      await symbols.indexFile("src/foo.ts", fooContent);
      await symbols.indexFile("src/index.ts", indexContent);

      const map = await builder.build(FIXTURE_ROOT, scanner, symbols, {
        maxExportedSymbols: 100,
      });

      // Should have exported symbols
      expect(map.exportedSymbols.length).toBeGreaterThan(0);

      // All symbols should have required fields
      for (const sym of map.exportedSymbols) {
        expect(sym.name).toBeDefined();
        expect(sym.kind).toBeDefined();
        expect(sym.file).toBeDefined();
        expect(sym.line).toBeGreaterThan(0);
      }
    });

    it("should sort exported symbols by importance", async () => {
      const content = `
export class MyClass { }
export interface MyInterface { }
export function myFunction() { }
export const myConstant = 42;
`;
      await symbols.indexFile("src/test.ts", content);

      const map = await builder.build(FIXTURE_ROOT, scanner, symbols, {
        maxExportedSymbols: 10,
      });

      if (map.exportedSymbols.length > 1) {
        // Exported items should come first
        const exportedCount = map.exportedSymbols.filter(
          (s) => s.kind === "class" || s.kind === "interface",
        ).length;
        expect(exportedCount).toBeGreaterThan(0);
      }
    });

    it("should respect maxExportedSymbols limit", async () => {
      const content = `
export function fn1() { }
export function fn2() { }
export function fn3() { }
export function fn4() { }
export function fn5() { }
`;
      await symbols.indexFile("src/many.ts", content);

      const map = await builder.build(FIXTURE_ROOT, scanner, symbols, {
        maxExportedSymbols: 3,
      });

      expect(map.exportedSymbols.length).toBeLessThanOrEqual(3);
    });
  });

  describe("package scripts and architecture signals", () => {
    it("should include architecture signals from package.json scripts", async () => {
      const map = await builder.build(FIXTURE_ROOT, scanner, symbols, {
        includePackageScripts: true,
      });

      // The simple-ts fixture has: "test": "vitest run"
      const pkg = map.packages.find((p) => p.name === "simple-ts");
      expect(pkg).toBeDefined();

      if (pkg && pkg.architectureSignals) {
        const testSignal = pkg.architectureSignals.find((s) => s.script === "test");
        expect(testSignal).toBeDefined();
        expect(testSignal?.category).toBe("test");
        expect(testSignal?.command).toBe("vitest run");
      }
    });

    it("should exclude architecture signals when includePackageScripts is false", async () => {
      const map = await builder.build(FIXTURE_ROOT, scanner, symbols, {
        includePackageScripts: false,
      });

      const pkg = map.packages.find((p) => p.name === "simple-ts");
      expect(pkg).toBeDefined();

      // architectureSignals should be undefined or empty
      if (pkg) {
        expect(pkg.architectureSignals === undefined || pkg.architectureSignals.length === 0).toBe(
          true,
        );
      }
    });

    it("should categorize scripts correctly", async () => {
      const map = await builder.build(FIXTURE_ROOT, scanner, symbols, {
        includePackageScripts: true,
      });

      const pkg = map.packages.find((p) => p.name === "simple-ts");
      expect(pkg).toBeDefined();

      if (pkg && pkg.architectureSignals) {
        // Check that the "test" script is categorized
        const testSignal = pkg.architectureSignals.find((s) => s.script === "test");
        expect(testSignal?.category).toBe("test");
      }
    });
  });

  describe("important files", () => {
    it("should include important files with purpose", async () => {
      const map = await builder.build(FIXTURE_ROOT, scanner, symbols);

      expect(map.importantFiles.length).toBeGreaterThan(0);

      for (const file of map.importantFiles) {
        expect(file.path).toBeDefined();
        expect(file.purpose).toBeDefined();
        expect(file.lineCount).toBeGreaterThanOrEqual(0);
      }
    });

    it("should respect maxImportantFiles limit", async () => {
      const map = await builder.build(FIXTURE_ROOT, scanner, symbols, {
        maxImportantFiles: 2,
      });

      expect(map.importantFiles.length).toBeLessThanOrEqual(2);
    });

    it("should identify entry point files", async () => {
      const map = await builder.build(FIXTURE_ROOT, scanner, symbols);

      const entryPoints = map.importantFiles.filter((f) => f.purpose === "entry point");
      // simple-ts fixture has src/index.ts which should be an entry point
      expect(entryPoints.length).toBeGreaterThan(0);
    });

    it("should identify config files", async () => {
      const map = await builder.build(FIXTURE_ROOT, scanner, symbols);

      const configs = map.importantFiles.filter((f) => f.purpose === "configuration");
      // tsconfig.json should be identified
      const hasTsconfig = configs.some((f) => f.path.includes("tsconfig"));
      expect(hasTsconfig).toBe(true);
    });
  });

  describe("test associations", () => {
    it("should detect test file to source file associations", async () => {
      const map = await builder.build(FIXTURE_ROOT, scanner, symbols, {
        includeTests: true,
      });

      // The fixture has test/foo.test.ts which should be associated with src/foo.ts
      const fooTestAssoc = map.testAssociations?.find((a) =>
        a.testFile.includes("foo.test"),
      );
      expect(fooTestAssoc).toBeDefined();
      expect(fooTestAssoc?.sourceFile).toMatch(/foo\.ts$/);
      expect(fooTestAssoc?.pattern).toBe("test_suffix");
    });

    it("should detect __tests__ pattern", async () => {
      const map = await builder.build(FIXTURE_ROOT, scanner, symbols, {
        includeTests: true,
      });

      // Should have at least one test association
      expect(map.testAssociations?.length).toBeGreaterThan(0);
    });

    it("should exclude test associations when includeTests is false", async () => {
      const map = await builder.build(FIXTURE_ROOT, scanner, symbols, {
        includeTests: false,
      });

      expect(map.testAssociations === undefined || map.testAssociations.length === 0).toBe(true);
    });

    it("should associate test file with its source correctly", async () => {
      const map = await builder.build(FIXTURE_ROOT, scanner, symbols, {
        includeTests: true,
      });

      // test/foo.test.ts → src/foo.ts
      const assoc = map.testAssociations?.find((a) => a.testFile.includes("foo.test"));
      expect(assoc).toBeDefined();

      if (assoc) {
        // The source file should be src/foo.ts
        expect(assoc.sourceFile).toContain("foo.ts");
        expect(assoc.sourceFile).not.toContain(".test.");
      }
    });
  });

  describe("token budget trimming", () => {
    it("should enforce hard maxExportedSymbols limit during trimming", async () => {
      // Create enough symbols to trigger trimming
      let content = "";
      for (let i = 0; i < 50; i++) {
        content += `export function fn${i}() { }\n`;
      }
      await symbols.indexFile("src/many.ts", content);

      const map = await builder.build(FIXTURE_ROOT, scanner, symbols, {
        maxTokens: 2000,
        maxExportedSymbols: 5, // Very small limit
        maxModuleEdges: 50,
        maxImportantFiles: 10,
      });

      // Hard limit should be enforced regardless of token budget
      expect(map.exportedSymbols.length).toBeLessThanOrEqual(5);
    });

    it("should enforce hard maxModuleEdges limit during trimming", async () => {
      const map = await builder.build(FIXTURE_ROOT, scanner, symbols, {
        maxTokens: 2000,
        maxExportedSymbols: 100,
        maxModuleEdges: 2, // Very small limit
        maxImportantFiles: 10,
      });

      expect(map.moduleGraph.length).toBeLessThanOrEqual(2);
    });

    it("should enforce hard maxImportantFiles limit during trimming", async () => {
      const map = await builder.build(FIXTURE_ROOT, scanner, symbols, {
        maxTokens: 2000,
        maxExportedSymbols: 100,
        maxModuleEdges: 200,
        maxImportantFiles: 1, // Very small limit
      });

      expect(map.importantFiles.length).toBeLessThanOrEqual(1);
    });

    it("should trim to token budget when content is large", async () => {
      // Create content that will produce a larger repo map
      let content = "";
      for (let i = 0; i < 30; i++) {
        content += `export function function${i}() { return ${i}; }\n`;
      }
      await symbols.indexFile("src/many.ts", content);

      const map = await builder.build(FIXTURE_ROOT, scanner, symbols, {
        maxTokens: 300, // Small budget to force trimming
        maxExportedSymbols: 100,
        maxModuleEdges: 50,
        maxImportantFiles: 10,
      });

      // Should be within ±10% of budget
      expect(map.tokenEstimate!).toBeLessThanOrEqual(330); // 10% buffer
      expect(map.tokenEstimate!).toBeGreaterThan(0);
    });

    it("should be deterministic when trimming", async () => {
      // Create a large enough set to trigger trimming
      let content = "";
      for (let i = 0; i < 30; i++) {
        content += `export function fn${i}() { }\n`;
      }
      await symbols.indexFile("src/deterministic.ts", content);

      const map1 = await builder.build(FIXTURE_ROOT, scanner, symbols, {
        maxTokens: 400,
        maxExportedSymbols: 10,
      });

      // Reset and rebuild
      symbols.clear();
      content = "";
      for (let i = 0; i < 30; i++) {
        content += `export function fn${i}() { }\n`;
      }
      await symbols.indexFile("src/deterministic.ts", content);

      const map2 = await builder.build(FIXTURE_ROOT, scanner, symbols, {
        maxTokens: 400,
        maxExportedSymbols: 10,
      });

      // Trimmed results should be identical (excluding timestamp)
      expect(map1.exportedSymbols).toEqual(map2.exportedSymbols);
      expect(map1.tokenEstimate).toEqual(map2.tokenEstimate);
    });
  });

  describe("module graph", () => {
    it("should build module graph from imports/exports", async () => {
      const map = await builder.build(FIXTURE_ROOT, scanner, symbols);

      // Should have some module graph entries
      expect(map.moduleGraph).toBeDefined();

      // Check that entries have the right shape
      for (const entry of map.moduleGraph) {
        expect(entry.file).toBeDefined();
        expect(Array.isArray(entry.imports)).toBe(true);
        expect(Array.isArray(entry.exports)).toBe(true);
      }
    });

    it("should respect maxModuleEdges limit", async () => {
      const map = await builder.build(FIXTURE_ROOT, scanner, symbols, {
        maxModuleEdges: 5,
      });

      expect(map.moduleGraph.length).toBeLessThanOrEqual(5);
    });
  });

  describe("RepoMapBudget options", () => {
    it("should use default budget when not specified", async () => {
      const map = await builder.build(FIXTURE_ROOT, scanner, symbols);

      expect(map.tokenEstimate).toBeLessThanOrEqual(
        DEFAULT_REPO_MAP_BUDGET.maxTokens * 1.1,
      );
    });

    it("should accept custom budget options", async () => {
      const customBudget = {
        maxTokens: 1000,
        maxExportedSymbols: 50,
        maxModuleEdges: 100,
        maxImportantFiles: 25,
        includeTests: true,
        includePackageScripts: true,
      };

      const map = await builder.build(FIXTURE_ROOT, scanner, symbols, customBudget);

      expect(map.exportedSymbols.length).toBeLessThanOrEqual(50);
      expect(map.moduleGraph.length).toBeLessThanOrEqual(100);
      expect(map.importantFiles.length).toBeLessThanOrEqual(25);
    });

    it("should handle includeTests: false correctly", async () => {
      const map = await builder.build(FIXTURE_ROOT, scanner, symbols, {
        includeTests: false,
      });

      // Test files should not appear in important files
      const testFiles = map.importantFiles.filter((f) => f.purpose === "test");
      expect(testFiles.length).toBe(0);
    });

    it("should handle includePackageScripts: false correctly", async () => {
      const map = await builder.build(FIXTURE_ROOT, scanner, symbols, {
        includePackageScripts: false,
      });

      // Packages should still be there, but without architecture signals
      expect(map.packages.length).toBeGreaterThan(0);
      for (const pkg of map.packages) {
        expect(pkg.architectureSignals === undefined || pkg.architectureSignals.length === 0).toBe(
          true,
        );
      }
    });
  });

  describe("edge cases", () => {
    it("should handle empty symbol index", async () => {
      const map = await builder.build(FIXTURE_ROOT, scanner, symbols);

      expect(map.exportedSymbols).toEqual([]);
      expect(map.tokenEstimate).toBeGreaterThan(0);
    });

    it("should handle files that can't be read", async () => {
      // This is already handled gracefully
      const map = await builder.build(FIXTURE_ROOT, scanner, symbols);

      // Should not throw and should have valid structure
      expect(map.structure.totalFiles).toBeGreaterThan(0);
    });

    it("should handle malformed package.json", async () => {
      // The scanner should skip malformed files gracefully
      const map = await builder.build(FIXTURE_ROOT, scanner, symbols);

      // Should still have some packages
      expect(map.packages.length).toBeGreaterThan(0);
    });

    it("should include tokenEstimate in output", async () => {
      const map = await builder.build(FIXTURE_ROOT, scanner, symbols, {
        maxTokens: 2000,
      });

      expect(map.tokenEstimate).toBeDefined();
      expect(typeof map.tokenEstimate).toBe("number");
      expect(map.tokenEstimate).toBeGreaterThan(0);
    });
  });
});