import { describe, it, expect } from "vitest";
import { createCodeIndex } from "./index.js";

describe("@altos/code-index", () => {
  describe("SimpleCodeIndex", () => {
    it("should create a code index", () => {
      const index = createCodeIndex();
      expect(index).toBeDefined();
    });

    it("should add and retrieve file symbols", () => {
      const index = createCodeIndex();
      index.addFile("test.ts", "export function foo() {}");
      const symbols = index.getFileSymbols("test.ts");
      expect(symbols).toBeDefined();
    });

    it("should remove file symbols", () => {
      const index = createCodeIndex();
      index.addFile("test.ts", "export function foo() {}");
      index.removeFile("test.ts");
      const symbols = index.getFileSymbols("test.ts");
      expect(symbols.length).toBe(0);
    });

    it("should search symbols by name", () => {
      const index = createCodeIndex();
      index.addFile("test.ts", "");
      const results = index.search("test");
      expect(results).toBeDefined();
    });

    it("should clear all symbols", () => {
      const index = createCodeIndex();
      index.addFile("test.ts", "");
      index.clear();
      const symbols = index.getFileSymbols("test.ts");
      expect(symbols.length).toBe(0);
    });
  });
});
