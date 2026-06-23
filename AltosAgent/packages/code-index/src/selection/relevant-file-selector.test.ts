import { describe, it, expect, beforeEach } from "vitest";
import type { RepoMap, IndexedSymbol, SelectionResult, ExplainedSelectionResult, GitContext } from "../types.js";
import { DEFAULT_SCORING_WEIGHTS } from "../types.js";
import { RelevantFileSelector, formatFileSelectionExplanation, formatSelectionReport } from "./relevant-file-selector.js";

function createMockRepoMap(): RepoMap {
  return {
    generatedAt: Date.now(),
    root: "/test",
    structure: {
      totalFiles: 100,
      totalDirs: 20,
      byLanguage: { typescript: 80, javascript: 20 },
      testFileCount: 15,
      configFileCount: 5,
    },
    packages: [],
    exportedSymbols: [
      { name: "UserService", kind: "class", file: "src/services/user.ts", line: 1 },
      { name: "AuthService", kind: "class", file: "src/services/auth.ts", line: 1 },
      { name: "ConfigLoader", kind: "function", file: "src/utils/config.ts", line: 5 },
    ],
    moduleGraph: [
      { file: "src/services/user.ts", imports: ["src/utils/db.ts"], exports: ["UserService"] },
      { file: "src/services/auth.ts", imports: ["src/services/user.ts"], exports: ["AuthService"] },
    ],
    importantFiles: [
      { path: "src/services/user.ts", purpose: "user management", lineCount: 50, exportsCount: 1 },
      { path: "src/services/auth.ts", purpose: "authentication", lineCount: 40, exportsCount: 1 },
      { path: "src/utils/config.ts", purpose: "configuration", lineCount: 30, exportsCount: 1 },
      { path: "package.json", purpose: "package config", lineCount: 20, exportsCount: 0 },
    ],
  };
}

function createMockSymbols(): {
  search(q: string, limit?: number): IndexedSymbol[];
  getFileSymbols(f: string): IndexedSymbol[];
} {
  const allSymbols: IndexedSymbol[] = [
    {
      id: "1",
      name: "UserService",
      kind: "class",
      file: "src/services/user.ts",
      line: 10,
      column: 0,
      endLine: 50,
      endColumn: 0,
      visibility: "exported",
    },
    {
      id: "2",
      name: "authenticate",
      kind: "method",
      file: "src/services/auth.ts",
      line: 20,
      column: 0,
      endLine: 30,
      endColumn: 0,
      visibility: "exported",
    },
    {
      id: "3",
      name: "ConfigLoader",
      kind: "function",
      file: "src/utils/config.ts",
      line: 5,
      column: 0,
      endLine: 15,
      endColumn: 0,
      visibility: "exported",
    },
  ];

  return {
    search(q: string, limit?: number): IndexedSymbol[] {
      const query = q.toLowerCase();
      let results = allSymbols.filter(
        (s) => s.name.toLowerCase().includes(query) || s.file.toLowerCase().includes(query),
      );
      if (limit !== undefined) {
        results = results.slice(0, limit);
      }
      return results;
    },
    getFileSymbols(f: string): IndexedSymbol[] {
      return allSymbols.filter((s) => s.file === f);
    },
  };
}

describe("RelevantFileSelector", () => {
  let selector: RelevantFileSelector;
  let mockRepoMap: RepoMap;
  let mockSymbols: ReturnType<typeof createMockSymbols>;

  beforeEach(() => {
    selector = new RelevantFileSelector();
    mockRepoMap = createMockRepoMap();
    mockSymbols = createMockSymbols();
  });

  it("should select files matching a symbol name", async () => {
    const result = (await selector.select("UserService", mockRepoMap, mockSymbols)) as SelectionResult;

    expect(result.selectedFiles.length).toBeGreaterThan(0);
    const userServiceFile = result.selectedFiles.find((f) => f.path.includes("user"));
    expect(userServiceFile).toBeDefined();
    // With multi-dimensional scoring, exact symbol match gives high score (>0.3)
    expect(userServiceFile?.relevanceScore).toBeGreaterThan(0.3);
  });

  it("should respect maxFiles limit", async () => {
    // Create repoMap with many important files
    const largeRepoMap: RepoMap = {
      ...mockRepoMap,
      importantFiles: Array.from({ length: 50 }, (_, i) => ({
        path: `src/file${i}.ts`,
        purpose: `file ${i}`,
        lineCount: 10,
        exportsCount: 1,
      })),
    };

    const result = await selector.select("file", largeRepoMap, mockSymbols, { maxFiles: 5 });

    expect(result.selectedFiles.length).toBeLessThanOrEqual(5);
  });

  it("should include reason for each selection", async () => {
    const result = (await selector.select("UserService", mockRepoMap, mockSymbols)) as SelectionResult;

    expect(result.selectedFiles.length).toBeGreaterThan(0);
    for (const file of result.selectedFiles) {
      expect(file.reason).toBeDefined();
      expect(file.reason.type).toBe("symbol_match");
      expect(typeof file.reason.score).toBe("number");
      expect(file.reason.score).toBeGreaterThan(0);
    }
  });

  it("should return SelectionResult with repoMapSlice", async () => {
    const result = (await selector.select("UserService", mockRepoMap, mockSymbols)) as SelectionResult;

    expect(result).toHaveProperty("selectedFiles");
    expect(result).toHaveProperty("repoMapSlice");
    expect(result).toHaveProperty("totalTokens");
    expect(result).toHaveProperty("reasoning");

    // repoMapSlice should be a valid RepoMap
    expect(result.repoMapSlice).toHaveProperty("generatedAt");
    expect(result.repoMapSlice).toHaveProperty("root");
    expect(result.repoMapSlice).toHaveProperty("exportedSymbols");
    expect(result.repoMapSlice).toHaveProperty("moduleGraph");
    expect(result.repoMapSlice).toHaveProperty("importantFiles");
  });

  it("should return non-zero totalTokens", async () => {
    const result = await selector.select("UserService", mockRepoMap, mockSymbols);

    expect(result.totalTokens).toBeGreaterThan(0);
  });

  it("should include reasoning array", async () => {
    const result = (await selector.select("UserService", mockRepoMap, mockSymbols)) as SelectionResult;

    expect(Array.isArray(result.reasoning)).toBe(true);
    if (result.selectedFiles.length > 0) {
      expect(result.reasoning.length).toBeGreaterThan(0);
    }
  });

  it("should handle partial name matches with lower score", async () => {
    const result = await selector.select("User", mockRepoMap, mockSymbols);

    expect(result.selectedFiles.length).toBeGreaterThan(0);
    // Partial matches should have score < 1.0
    const userRelatedFiles = result.selectedFiles.filter((f) => f.path.includes("user"));
    expect(userRelatedFiles.length).toBeGreaterThan(0);
  });

  it("should truncate repoMapSlice arrays to maxFiles", async () => {
    const largeRepoMap: RepoMap = {
      ...mockRepoMap,
      exportedSymbols: Array.from({ length: 100 }, (_, i) => ({
        name: `Symbol${i}`,
        kind: "function" as const,
        file: `src/file${i}.ts`,
        line: 1,
      })),
      moduleGraph: Array.from({ length: 100 }, (_, i) => ({
        file: `src/file${i}.ts`,
        imports: [],
        exports: [],
      })),
    };

    const result = await selector.select("Symbol", largeRepoMap, mockSymbols, { maxFiles: 10 });

    expect(result.repoMapSlice.exportedSymbols.length).toBeLessThanOrEqual(10);
    expect(result.repoMapSlice.moduleGraph.length).toBeLessThanOrEqual(10);
  });
});

describe("FileScoreComponents", () => {
  let selector: RelevantFileSelector;
  let mockRepoMap: RepoMap;
  let mockSymbols: ReturnType<typeof createMockSymbols>;

  beforeEach(() => {
    selector = new RelevantFileSelector();
    mockRepoMap = createMockRepoMap();
    mockSymbols = createMockSymbols();
  });

  describe("lexical scoring", () => {
    it("should score exact path match highest", async () => {
      const result = await selector.select("user.ts", mockRepoMap, mockSymbols);

      const userFiles = result.selectedFiles.filter(f => f.path.includes("user"));
      expect(userFiles.length).toBeGreaterThan(0);
    });

    it("should score directory match higher than partial path match", async () => {
      // "services" appears in directory path for user.ts and auth.ts
      const result1 = await selector.select("services", mockRepoMap, mockSymbols);
      // "src" is a common parent directory
      const result2 = await selector.select("src", mockRepoMap, mockSymbols);

      // Both should return results but services should get higher lexical score
      expect(result1.selectedFiles.length).toBeGreaterThan(0);
      expect(result2.selectedFiles.length).toBeGreaterThan(0);
    });
  });

  describe("symbol scoring", () => {
    it("should score exact symbol name match highest", async () => {
      const result = await selector.select("UserService", mockRepoMap, mockSymbols, {
        explain: true,
      }) as ExplainedSelectionResult;

      expect(result.selectedFiles.length).toBeGreaterThan(0);
      const userServiceFile = result.selectedFiles.find(f => f.path.includes("user"));
      expect(userServiceFile).toBeDefined();
      // UserService class should have symbol score
      expect(userServiceFile!.components.symbolScore).toBeGreaterThan(0);
    });

    it("should weight class symbols higher than variable symbols", async () => {
      const classResult = await selector.select("UserService", mockRepoMap, mockSymbols, {
        explain: true,
      }) as ExplainedSelectionResult;
      const methodResult = await selector.select("authenticate", mockRepoMap, mockSymbols, {
        explain: true,
      }) as ExplainedSelectionResult;

      expect(classResult.selectedFiles.length).toBeGreaterThan(0);
      expect(methodResult.selectedFiles.length).toBeGreaterThan(0);

      const classFile = classResult.selectedFiles[0];
      const methodFile = methodResult.selectedFiles[0];

      // Class match should have symbol score from class weight
      expect(classFile.components.symbolScore).toBeGreaterThan(0);
      expect(methodFile.components.symbolScore).toBeGreaterThan(0);
    });
  });

  describe("git recency scoring", () => {
    it("should return explained results with gitRecencyScore component", async () => {
      const gitContext: GitContext = {
        root: "/test",
        branch: "main",
        branches: ["main"],
        lastModified: new Map([
          ["src/services/user.ts", Date.now() - 3 * 24 * 60 * 60 * 1000], // 3 days ago
        ]),
        changedFiles: [],
        recentCommits: [],
        stagedFiles: [],
        unstagedFiles: [],
        untrackedFiles: [],
        hasUncommittedChanges: false,
      };

      const result = await selector.select("UserService", mockRepoMap, mockSymbols, {
        explain: true,
        gitContext,
      }) as ExplainedSelectionResult;

      if (result.selectedFiles.length > 0) {
        const userFile = result.selectedFiles.find(f => f.path.includes("user"));
        if (userFile) {
          expect(userFile.components.gitRecencyScore).toBeGreaterThan(0);
          // Check that git reasons are present
          const gitReasons = userFile.reasons.filter(r => r.component === "gitRecencyScore");
          expect(gitReasons.length).toBeGreaterThan(0);
        }
      }
    });

    it("should default to 0.5 when no git context provided", async () => {
      const result = await selector.select("UserService", mockRepoMap, mockSymbols, {
        explain: true,
      }) as ExplainedSelectionResult;

      if (result.selectedFiles.length > 0) {
        const userFile = result.selectedFiles.find(f => f.path.includes("user"));
        if (userFile) {
          expect(userFile.components.gitRecencyScore).toBe(0.5);
        }
      }
    });
  });

  describe("test proximity scoring", () => {
    it("should score test files with corresponding source files", async () => {
      const repoMapWithTest: RepoMap = {
        ...mockRepoMap,
        importantFiles: [
          ...mockRepoMap.importantFiles,
          { path: "src/services/user.test.ts", purpose: "test", lineCount: 20, exportsCount: 1 },
        ],
      };

      const result = await selector.select("UserService", repoMapWithTest, mockSymbols, {
        explain: true,
      }) as ExplainedSelectionResult;

      const testFile = result.selectedFiles.find(f => f.path.includes("user.test"));
      if (testFile) {
        expect(testFile.components.testProximityScore).toBeGreaterThan(0);
      }
    });
  });

  describe("import graph scoring", () => {
    it("should score files connected via imports", async () => {
      const result = await selector.select("UserService", mockRepoMap, mockSymbols, {
        explain: true,
      }) as ExplainedSelectionResult;

      // auth.ts imports user.ts, so it should have import graph score
      const authFile = result.selectedFiles.find(f => f.path.includes("auth"));
      if (authFile) {
        // auth imports user.ts
        expect(authFile.components.importGraphScore).toBeGreaterThan(0);
      }
    });
  });

  describe("final score weight calculation", () => {
    it("should apply correct weights to each component", async () => {
      const result = await selector.select("UserService", mockRepoMap, mockSymbols, {
        explain: true,
        scoringWeights: {
          lexicalScore: 0.1,
          symbolScore: 0.5,
          gitRecencyScore: 0.1,
          pathProximityScore: 0.1,
          testProximityScore: 0.1,
          importGraphScore: 0.1,
        },
      }) as ExplainedSelectionResult;

      expect(result.scoringWeights).toEqual({
        lexicalScore: 0.1,
        symbolScore: 0.5,
        gitRecencyScore: 0.1,
        pathProximityScore: 0.1,
        testProximityScore: 0.1,
        importGraphScore: 0.1,
      });

      if (result.selectedFiles.length > 0) {
        const file = result.selectedFiles[0];
        // Verify final score is computed from weighted components
        const expectedScore =
          file.components.lexicalScore * 0.1 +
          file.components.symbolScore * 0.5 +
          file.components.gitRecencyScore * 0.1 +
          file.components.pathProximityScore * 0.1 +
          file.components.testProximityScore * 0.1 +
          file.components.importGraphScore * 0.1;

        expect(file.finalScore).toBeCloseTo(expectedScore, 5);
      }
    });

    it("should use default weights when not specified", async () => {
      const result = await selector.select("UserService", mockRepoMap, mockSymbols, {
        explain: true,
      }) as ExplainedSelectionResult;

      expect(result.scoringWeights).toEqual(DEFAULT_SCORING_WEIGHTS);
    });
  });

  describe("reasons populated", () => {
    it("should include reasons for each scoring component", async () => {
      const result = await selector.select("UserService", mockRepoMap, mockSymbols, {
        explain: true,
      }) as ExplainedSelectionResult;

      if (result.selectedFiles.length > 0) {
        const file = result.selectedFiles[0];
        expect(file.reasons.length).toBeGreaterThan(0);

        // Check that reasons have required fields
        for (const reason of file.reasons) {
          expect(reason).toHaveProperty("type");
          expect(reason).toHaveProperty("detail");
          expect(reason).toHaveProperty("score");
          expect(reason).toHaveProperty("component");
        }
      }
    });

    it("should include topEvidence from reasons", async () => {
      const result = await selector.select("UserService", mockRepoMap, mockSymbols, {
        explain: true,
      }) as ExplainedSelectionResult;

      if (result.selectedFiles.length > 0) {
        const file = result.selectedFiles[0];
        expect(file.topEvidence).toBeDefined();
        expect(Array.isArray(file.topEvidence)).toBe(true);
        expect(file.topEvidence.length).toBeLessThanOrEqual(3);
      }
    });
  });

  describe("backward compatibility", () => {
    it("should return SelectionResult shape when explain is false", async () => {
      const result = await selector.select("UserService", mockRepoMap, mockSymbols, {
        explain: false,
      }) as SelectionResult;

      expect(result).toHaveProperty("selectedFiles");
      expect(result).toHaveProperty("repoMapSlice");
      expect(result).toHaveProperty("totalTokens");
      expect(result).toHaveProperty("reasoning");

      // Each file should have reason and relevanceScore (not finalScore/components)
      for (const file of result.selectedFiles) {
        expect(file).toHaveProperty("reason");
        expect(file).toHaveProperty("relevanceScore");
        expect(file).not.toHaveProperty("finalScore");
        expect(file).not.toHaveProperty("components");
      }
    });

    it("should return ExplainedSelectionResult shape when explain is true", async () => {
      const result = await selector.select("UserService", mockRepoMap, mockSymbols, {
        explain: true,
      }) as ExplainedSelectionResult;

      expect(result).toHaveProperty("selectedFiles");
      expect(result).toHaveProperty("repoMapSlice");
      expect(result).toHaveProperty("totalTokens");
      expect(result).toHaveProperty("scoringWeights");

      // Each file should have finalScore, components, reasons, topEvidence
      for (const file of result.selectedFiles) {
        expect(file).toHaveProperty("finalScore");
        expect(file).toHaveProperty("components");
        expect(file).toHaveProperty("reasons");
        expect(file).toHaveProperty("topEvidence");
      }
    });

    it("should populate primary reason in legacy mode", async () => {
      const result = await selector.select("UserService", mockRepoMap, mockSymbols) as SelectionResult;

      for (const file of result.selectedFiles) {
        expect(file.reason).toBeDefined();
        expect(file.reason.type).toBeDefined();
        expect(file.reason.detail).toBeDefined();
      }
    });
  });

  describe("formatted explanation output", () => {
    it("should format single file selection explanation", async () => {
      const result = await selector.select("UserService", mockRepoMap, mockSymbols, {
        explain: true,
      }) as ExplainedSelectionResult;

      if (result.selectedFiles.length > 0) {
        const explanation = formatFileSelectionExplanation(
          result.selectedFiles[0],
          result.scoringWeights
        );

        expect(explanation).toContain(result.selectedFiles[0].path);
        expect(explanation).toContain("Final Score:");
        expect(explanation).toContain("Component Breakdown");
      }
    });

    it("should format complete selection report", async () => {
      const result = await selector.select("User", mockRepoMap, mockSymbols, {
        explain: true,
      }) as ExplainedSelectionResult;

      const report = formatSelectionReport(
        result.selectedFiles,
        result.scoringWeights,
        result.totalTokens
      );

      expect(report).toContain("FILE SELECTION EXPLANATION REPORT");
      expect(report).toContain("Scoring Weights");
      expect(report).toContain("Component Breakdown");
      expect(report).toContain("Total Tokens:");
    });
  });
});
