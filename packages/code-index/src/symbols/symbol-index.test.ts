import { describe, it, expect, beforeEach } from "vitest";
import { SymbolIndex } from "./symbol-index.js";

describe("SymbolIndex", () => {
  let index: SymbolIndex;

  beforeEach(() => {
    index = new SymbolIndex();
  });

  it("should index TypeScript function", async () => {
    const code = `function hello(name: string): void {
  console.log(name);
}`;
    await index.indexFile("test.ts", code);

    const symbols = index.getFileSymbols("test.ts");
    expect(symbols.length).toBeGreaterThan(0);

    const func = symbols.find((s) => s.kind === "function");
    expect(func).toBeDefined();
    expect(func?.name).toBe("hello");
    expect(func?.line).toBe(1);
    expect(func?.column).toBe(1);
  });

  it("should extract exported symbols", async () => {
    const code = `export function exportedFunc() {}
function internalFunc() {}`;
    await index.indexFile("test.ts", code);

    const exported = index.getExportedSymbols();
    expect(exported.some((s) => s.name === "exportedFunc")).toBe(true);
    expect(exported.some((s) => s.name === "internalFunc")).toBe(false);
  });

  it("should find symbols by name", async () => {
    const code = `export function foo() {}
export class Bar {}
export interface IFoo {}`;
    await index.indexFile("test.ts", code);

    // Note: getSymbolsByName is exact case-sensitive match
    const byName = index.getSymbolsByName("foo");
    expect(byName.length).toBe(1);
    expect(byName.some((s) => s.kind === "function")).toBe(true);

    // Search is case-insensitive substring
    const results = index.search("foo");
    expect(results.length).toBeGreaterThanOrEqual(2); // function + interface
    expect(results.some((s) => s.kind === "function")).toBe(true);
    expect(results.some((s) => s.kind === "interface")).toBe(true);
  });

  it("should search symbols by query", async () => {
    const code = `export function calculateSum(a: number, b: number): number { return a + b; }
export function calculateProduct(a: number, b: number): number { return a * b; }
export class Calculator {}`;
    await index.indexFile("test.ts", code);

    const results = index.search("calculate");
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results.every((s) => s.name.includes("calculate"))).toBe(true);
  });

  it("should remove file symbols", async () => {
    const code = `export function foo() {}`;
    await index.indexFile("test.ts", code);

    expect(index.getFileSymbols("test.ts").length).toBeGreaterThan(0);

    index.removeFile("test.ts");

    expect(index.getFileSymbols("test.ts").length).toBe(0);
    expect(index.getStats().totalFiles).toBe(0);
  });

  it("clearFile removes symbols for that file and returns count", async () => {
    const code = `export function foo() {}
export class Bar {}`;
    await index.indexFile("a.ts", code);

    const beforeCount = index.getFileSymbols("a.ts").length;
    expect(beforeCount).toBeGreaterThan(0);

    const removed = index.clearFile("a.ts");
    expect(removed).toBe(beforeCount);
    expect(index.getFileSymbols("a.ts").length).toBe(0);
    expect(index.getStats().totalFiles).toBe(0);
  });

  it("clearFile on unknown file returns 0 and is safe", () => {
    expect(index.clearFile("does-not-exist.ts")).toBe(0);
    expect(index.getStats().totalFiles).toBe(0);
  });

  it("removeFiles removes multiple files in one call", async () => {
    await index.indexFile("a.ts", `export function a() {}`);
    await index.indexFile("b.ts", `export function b() {}`);
    await index.indexFile("c.ts", `export function c() {}`);

    expect(index.getStats().totalFiles).toBe(3);

    index.removeFiles(["a.ts", "c.ts"]);
    expect(index.getStats().totalFiles).toBe(1);
    expect(index.getFileSymbols("a.ts").length).toBe(0);
    expect(index.getFileSymbols("b.ts").length).toBeGreaterThan(0);
    expect(index.getFileSymbols("c.ts").length).toBe(0);
  });

  it("removeFiles silently skips unknown files", () => {
    index.removeFiles(["never-existed.ts"]);
    expect(index.getStats().totalFiles).toBe(0);
  });

  it("indexFilesIncremental parses new files but skips unchanged ones", async () => {
    const files = new Map([
      ["a.ts", `export function a() {}`],
      ["b.ts", `export function b() {}`],
    ]);

    // First run: no previous hashes → both parsed
    const r1 = await index.indexFilesIncremental(files);
    expect(r1.indexed).toBe(2);
    expect(r1.skipped).toBe(0);
    expect(index.getStats().totalFiles).toBe(2);

    // Second run with the same content + matching hashes → both skipped
    const prevHashes = new Map<string, string>();
    for (const [file] of files) {
      // Hash the file content the same way indexFilesIncremental does
      const crypto = await import("crypto");
      const h = crypto.default.createHash("md5").update(files.get(file)!).digest("hex").slice(0, 16);
      prevHashes.set(file, h);
    }
    const r2 = await index.indexFilesIncremental(files, prevHashes);
    expect(r2.indexed).toBe(0);
    expect(r2.skipped).toBe(2);

    // Third run: content changes for a.ts → only a.ts re-parsed
    files.set("a.ts", `export function aRenamed() {}`);
    const r3 = await index.indexFilesIncremental(files, prevHashes);
    expect(r3.indexed).toBe(1);
    expect(r3.skipped).toBe(1);
  });

  it("should get stats", async () => {
    const code1 = `export function foo() {}`;
    const code2 = `export class Bar {}`;

    await index.indexFile("test1.ts", code1);
    await index.indexFile("test2.ts", code2);

    const stats = index.getStats();
    expect(stats.totalFiles).toBe(2);
    expect(stats.totalSymbols).toBeGreaterThanOrEqual(2);
  });

  it("should index multiple files", async () => {
    const files = new Map([
      ["a.ts", `export function foo() {}`],
      ["b.ts", `export class Foo {}`],
    ]);

    await index.indexFiles(files);

    expect(index.getStats().totalFiles).toBe(2);
    expect(index.getFileSymbols("a.ts").length).toBeGreaterThan(0);
    expect(index.getFileSymbols("b.ts").length).toBeGreaterThan(0);
  });

  it("should find definition location", async () => {
    const code = `export function hello() {}`;
    await index.indexFile("test.ts", code);

    const symbols = index.getFileSymbols("test.ts");
    const func = symbols.find((s) => s.kind === "function");
    expect(func).toBeDefined();

    const location = index.findDefinition(func!.id);
    expect(location).toBeDefined();
    expect(location?.uri).toBe("test.ts");
    expect(location?.line).toBe(1);
  });

  it("should find references by name", async () => {
    // Index two files with same symbol name
    await index.indexFile("a.ts", `export function foo() {}`);
    await index.indexFile("b.ts", `export function foo() {}`);

    const symbolsA = index.getFileSymbols("a.ts");
    const funcA = symbolsA.find((s) => s.kind === "function");
    expect(funcA).toBeDefined();

    // Should find the same symbol in b.ts
    const refs = index.findReferences(funcA!.id);
    expect(refs.length).toBe(1);
    expect(refs[0]?.uri).toBe("b.ts");
  });

  it("should index class with methods and properties", async () => {
    const code = `export class MyClass {
  prop: string;
  method(): void {}
}`;
    await index.indexFile("test.ts", code);

    const symbols = index.getFileSymbols("test.ts");
    const classSym = symbols.find((s) => s.kind === "class");
    expect(classSym).toBeDefined();
    expect(classSym?.name).toBe("MyClass");

    const prop = symbols.find((s) => s.kind === "property" && s.name === "prop");
    expect(prop).toBeDefined();
    expect(prop?.scope).toBe("MyClass");

    const method = symbols.find((s) => s.kind === "method" && s.name === "method");
    expect(method).toBeDefined();
    expect(method?.scope).toBe("MyClass");
  });

  it("should index interface", async () => {
    const code = `export interface IMyInterface {
  prop: string;
  method(): void;
}`;
    await index.indexFile("test.ts", code);

    const symbols = index.getFileSymbols("test.ts");
    const iface = symbols.find((s) => s.kind === "interface");
    expect(iface).toBeDefined();
    expect(iface?.name).toBe("IMyInterface");
  });

  it("should index type alias", async () => {
    const code = `export type MyType = string | number;`;
    await index.indexFile("test.ts", code);

    const symbols = index.getFileSymbols("test.ts");
    const type = symbols.find((s) => s.kind === "type");
    expect(type).toBeDefined();
    expect(type?.name).toBe("MyType");
    expect(type?.visibility).toBe("exported");
  });
});
