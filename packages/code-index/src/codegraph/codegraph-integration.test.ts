import { describe, it, expect } from "vitest";
import type { ICodeGraphAdapter, CodeGraphResult } from "../types.js";
import { StubCodeGraphAdapter } from "./codegraph-adapter.js";

/**
 * Interface tests to verify any ICodeGraphAdapter implementation
 * satisfies the contract.
 */
function testCodeGraphAdapterContract(adapter: ICodeGraphAdapter, name: string) {
  describe(`ICodeGraphAdapter contract: ${name}`, () => {
    it("has a non-empty name property", () => {
      expect(typeof adapter.name).toBe("string");
      expect(adapter.name.length).toBeGreaterThan(0);
    });

    it("isAvailable returns a boolean", async () => {
      const result = await adapter.isAvailable("/fake/nonexistent/path");
      expect(typeof result).toBe("boolean");
    });

    it("explore returns array of CodeGraphResult", async () => {
      const results = await adapter.explore("test");
      expect(Array.isArray(results)).toBe(true);
      for (const r of results) {
        expect(typeof r.symbol).toBe("string");
        expect(typeof r.file).toBe("string");
        expect(typeof r.line).toBe("number");
        expect(typeof r.column).toBe("number");
        expect(typeof r.kind).toBe("string");
      }
    });

    it("getCallers returns array of CodeGraphResult", async () => {
      const results = await adapter.getCallers("testSymbol");
      expect(Array.isArray(results)).toBe(true);
    });

    it("getCallees returns array of CodeGraphResult", async () => {
      const results = await adapter.getCallees("testSymbol");
      expect(Array.isArray(results)).toBe(true);
    });

    it("explore with empty query returns empty array", async () => {
      const results = await adapter.explore("");
      expect(results).toEqual([]);
    });

    it("getCallers with unknown symbol returns empty array", async () => {
      const results = await adapter.getCallers("__unknown_symbol_xyz__");
      expect(results).toEqual([]);
    });

    it("getCallees with unknown symbol returns empty array", async () => {
      const results = await adapter.getCallees("__unknown_symbol_xyz__");
      expect(results).toEqual([]);
    });

    it("isAvailable returns false for nonexistent path", async () => {
      const result = await adapter.isAvailable("/nonexistent/path/xyz");
      expect(result).toBe(false);
    });
  });
}

describe("StubCodeGraphAdapter", () => {
  testCodeGraphAdapterContract(new StubCodeGraphAdapter(), "StubCodeGraphAdapter");

  describe("stub behavior", () => {
    it("always returns false from isAvailable", async () => {
      const adapter = new StubCodeGraphAdapter();
      expect(await adapter.isAvailable("/any/path")).toBe(false);
      expect(await adapter.isAvailable("/")).toBe(false);
    });

    it("always returns empty array from explore", async () => {
      const adapter = new StubCodeGraphAdapter();
      expect(await adapter.explore("AuthService")).toEqual([]);
      expect(await adapter.explore("")).toEqual([]);
    });

    it("always returns empty array from getCallers", async () => {
      const adapter = new StubCodeGraphAdapter();
      expect(await adapter.getCallers("test")).toEqual([]);
    });

    it("always returns empty array from getCallees", async () => {
      const adapter = new StubCodeGraphAdapter();
      expect(await adapter.getCallees("test")).toEqual([]);
    });

    it("has correct name", () => {
      expect(new StubCodeGraphAdapter().name).toBe("codegraph-stub");
    });
  });
});

describe("ICodeGraphAdapter interface compliance", () => {
  it("StubCodeGraphAdapter fully implements ICodeGraphAdapter", () => {
    const adapter: ICodeGraphAdapter = new StubCodeGraphAdapter();
    // TypeScript compile-time check: if this compiles, the adapter satisfies the interface
    expect(adapter).toBeDefined();
  });

  it("CodeGraphResult structure is correct", () => {
    const result: CodeGraphResult = {
      symbol: "testSymbol",
      file: "test/file.ts",
      line: 10,
      column: 5,
      kind: "function",
      callers: ["caller1", "caller2"],
      callees: ["callee1"],
    };

    expect(result.symbol).toBe("testSymbol");
    expect(result.file).toBe("test/file.ts");
    expect(result.line).toBe(10);
    expect(result.column).toBe(5);
    expect(result.kind).toBe("function");
    expect(result.callers).toEqual(["caller1", "caller2"]);
    expect(result.callees).toEqual(["callee1"]);
  });
});