import { describe, it, expect, beforeEach } from "vitest";
import { LSPAdapter } from "./lsp-adapter.js";

describe("LSPAdapter", () => {
  let adapter: LSPAdapter;

  beforeEach(() => {
    adapter = new LSPAdapter();
  });

  it("should report not ready before start", () => {
    expect(adapter.isReady()).toBe(false);
  });

  it("should stop cleanly", () => {
    adapter.stop();
    expect(adapter.isReady()).toBe(false);
  });

  it("should return empty diagnostics when not ready", async () => {
    const diagnostics = await adapter.getDiagnostics("/some/file.ts");
    expect(diagnostics).toEqual([]);
  });

  it("should return empty symbols when not ready", async () => {
    const symbols = await adapter.getDocumentSymbols("/some/file.ts");
    expect(symbols).toEqual([]);
  });

  it("should return null for gotoDefinition when not ready", async () => {
    const location = await adapter.gotoDefinition("/some/file.ts", 1, 0);
    expect(location).toBeNull();
  });

  it("should return empty array for findReferences when not ready", async () => {
    const references = await adapter.findReferences("/some/file.ts", 1, 0);
    expect(references).toEqual([]);
  });

  it("should return null for getHover when not ready", async () => {
    const hover = await adapter.getHover("/some/file.ts", 1, 0);
    expect(hover).toBeNull();
  });
});
