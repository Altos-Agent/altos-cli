import type { ICodeGraphAdapter, CodeGraphResult } from "../types.js";

export class StubCodeGraphAdapter implements ICodeGraphAdapter {
  name = "codegraph-stub";

  async isAvailable(_root: string): Promise<boolean> {
    // Stub: returns false (no CodeGraph integration in this phase)
    return false;
  }

  async explore(_query: string): Promise<CodeGraphResult[]> {
    // Stub: returns empty array
    return [];
  }

  async getCallers(_symbolName: string): Promise<CodeGraphResult[]> {
    // Stub: returns empty array
    return [];
  }

  async getCallees(_symbolName: string): Promise<CodeGraphResult[]> {
    // Stub: returns empty array
    return [];
  }
}
