// @altos/code-index - Code indexing and search

export interface Symbol {
  id: string;
  name: string;
  kind: "function" | "class" | "interface" | "variable" | "type" | "constant" | "file";
  file: string;
  line: number;
  column: number;
  visibility: "public" | "private" | "protected" | "internal";
  signatures?: string[];
}

export interface CodeIndex {
  addFile(file: string, content: string): void;
  removeFile(file: string): void;
  getSymbol(id: string): Symbol | undefined;
  getFileSymbols(file: string): Symbol[];
  getSymbolsByName(name: string): Symbol[];
  search(query: string): Symbol[];
  clear(): void;
}

export class SimpleCodeIndex implements CodeIndex {
  private symbols: Map<string, Symbol> = new Map();
  private fileSymbols: Map<string, Set<string>> = new Map();

  addFile(file: string, _content: string): void {
    // Placeholder - will use tree-sitter or ts-morph for actual parsing
    this.fileSymbols.set(file, new Set());
  }

  removeFile(file: string): void {
    const ids = this.fileSymbols.get(file);
    if (ids) {
      for (const id of ids) this.symbols.delete(id);
      this.fileSymbols.delete(file);
    }
  }

  getSymbol(id: string): Symbol | undefined {
    return this.symbols.get(id);
  }

  getFileSymbols(file: string): Symbol[] {
    const ids = this.fileSymbols.get(file);
    if (!ids) return [];
    return [...ids].map((id) => this.symbols.get(id)!).filter(Boolean);
  }

  getSymbolsByName(name: string): Symbol[] {
    return [...this.symbols.values()].filter((s) => s.name === name);
  }

  search(query: string): Symbol[] {
    const q = query.toLowerCase();
    return [...this.symbols.values()].filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.signatures?.some((sig) => sig.toLowerCase().includes(q)),
    );
  }

  clear(): void {
    this.symbols.clear();
    this.fileSymbols.clear();
  }
}

export function createCodeIndex(): CodeIndex {
  return new SimpleCodeIndex();
}
