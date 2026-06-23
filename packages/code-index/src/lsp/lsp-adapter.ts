import type {
  ILSPAdapter,
  LSPDocumentSymbol,
  LSPHover,
  LSPDiagnostic,
  Location,
} from "../types.js";

export class LSPAdapter implements ILSPAdapter {
  private ready = false;

  async start(_root: string): Promise<void> {
    // Stub: marks ready=false (no-op - LSP connection would go here in a future phase)
    this.ready = false;
  }

  stop(): void {
    // Stub: marks ready=false
    this.ready = false;
  }

  isReady(): boolean {
    return this.ready;
  }

  async getDocumentSymbols(_file: string): Promise<LSPDocumentSymbol[]> {
    // Stub: returns empty array
    return [];
  }

  async gotoDefinition(_file: string, _line: number, _column: number): Promise<Location | null> {
    // Stub: returns null
    return null;
  }

  async findReferences(_file: string, _line: number, _column: number): Promise<Location[]> {
    // Stub: returns empty array
    return [];
  }

  async getHover(_file: string, _line: number, _column: number): Promise<LSPHover | null> {
    // Stub: returns null
    return null;
  }

  async getDiagnostics(_file: string): Promise<LSPDiagnostic[]> {
    // Stub: returns empty array
    return [];
  }
}
