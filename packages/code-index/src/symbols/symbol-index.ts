import type { IndexedSymbol, Location } from "../types.js";
import { parseTS } from "./tree-sitter-parser.js";
import { computeContentHash } from "../indexer/index-state.js";

/**
 * Result of an incremental indexing run.
 */
export interface IndexingResult {
  /** Number of files that were actually parsed. */
  indexed: number;
  /** Number of files skipped because their hash matched the previous state. */
  skipped: number;
}

export class SymbolIndex {
  private symbols: Map<string, IndexedSymbol> = new Map();
  private fileSymbols: Map<string, Set<string>> = new Map();
  private symbolsByName: Map<string, Set<string>> = new Map();

  /**
   * Index a single file's content
   */
  async indexFile(file: string, content: string): Promise<void> {
    // Remove existing symbols for this file first
    this.removeFile(file);

    const { symbols } = parseTS(content, file);

    for (const symbol of symbols) {
      // Ensure file in symbol
      const symbolWithFile: IndexedSymbol = { ...symbol, file };

      // Update symbols map
      this.symbols.set(symbol.id, symbolWithFile);

      // Update fileSymbols map
      if (!this.fileSymbols.has(file)) {
        this.fileSymbols.set(file, new Set());
      }
      this.fileSymbols.get(file)!.add(symbol.id);

      // Update symbolsByName map
      if (!this.symbolsByName.has(symbol.name)) {
        this.symbolsByName.set(symbol.name, new Set());
      }
      this.symbolsByName.get(symbol.name)!.add(symbol.id);
    }
  }

  /**
   * Index multiple files
   */
  async indexFiles(files: Map<string, string>): Promise<void> {
    for (const [file, content] of files) {
      await this.indexFile(file, content);
    }
  }

  /**
   * Index files incrementally. Only parses files whose content changed
   * (compared via the supplied `previousHash` map). Files whose hash matches
   * the previous state are skipped; this makes a no-op run cheap.
   *
   * @param files Map of file path → content
   * @param previousHash Optional map of file path → last known content hash.
   *   When supplied, files whose computed hash matches are skipped entirely.
   * @returns IndexingResult with counts of indexed and skipped files
   */
  async indexFilesIncremental(
    files: Map<string, string>,
    previousHash?: Map<string, string>,
  ): Promise<IndexingResult> {
    let indexed = 0;
    let skipped = 0;

    for (const [file, content] of files) {
      if (previousHash) {
        const hash = computeContentHash(content);
        if (previousHash.get(file) === hash) {
          skipped++;
          continue;
        }
      }
      await this.indexFile(file, content);
      indexed++;
    }

    return { indexed, skipped };
  }

  /**
   * Remove all symbols for a single file.
   */
  removeFile(file: string): void {
    this.clearFile(file);
  }

  /**
   * Remove symbols for many files in a single call. Files that are not
   * present in the index are silently skipped.
   */
  removeFiles(files: string[]): void {
    for (const file of files) {
      this.clearFile(file);
    }
  }

  /**
   * Remove all symbols that originated from `file`. Returns the number of
   * symbols that were cleared. Safe to call when the file is not indexed.
   */
  clearFile(file: string): number {
    const symbolIds = this.fileSymbols.get(file);
    if (!symbolIds) return 0;

    let removed = 0;
    for (const id of symbolIds) {
      const symbol = this.symbols.get(id);
      if (symbol) {
        const nameSet = this.symbolsByName.get(symbol.name);
        if (nameSet) {
          nameSet.delete(id);
          if (nameSet.size === 0) {
            this.symbolsByName.delete(symbol.name);
          }
        }
        removed++;
      }
      this.symbols.delete(id);
    }
    this.fileSymbols.delete(file);
    return removed;
  }

  /**
   * Get a symbol by its id
   */
  getSymbol(id: string): IndexedSymbol | undefined {
    return this.symbols.get(id);
  }

  /**
   * Get all symbols in a file
   */
  getFileSymbols(file: string): IndexedSymbol[] {
    const symbolIds = this.fileSymbols.get(file);
    if (!symbolIds) return [];
    return Array.from(symbolIds)
      .map((id) => this.symbols.get(id))
      .filter((s): s is IndexedSymbol => s !== undefined);
  }

  /**
   * Get all exported symbols
   */
  getExportedSymbols(): IndexedSymbol[] {
    const exported: IndexedSymbol[] = [];
    for (const symbol of this.symbols.values()) {
      if (symbol.visibility === "exported") {
        exported.push(symbol);
      }
    }
    return exported;
  }

  /**
   * Get all symbols with a given name
   */
  getSymbolsByName(name: string): IndexedSymbol[] {
    const symbolIds = this.symbolsByName.get(name);
    if (!symbolIds) return [];
    return Array.from(symbolIds)
      .map((id) => this.symbols.get(id))
      .filter((s): s is IndexedSymbol => s !== undefined);
  }

  /**
   * Search symbols by name or signature (case-insensitive substring match)
   */
  search(query: string, limit: number = 50): IndexedSymbol[] {
    const lowerQuery = query.toLowerCase();
    const results: IndexedSymbol[] = [];

    for (const symbol of this.symbols.values()) {
      const nameMatch = symbol.name.toLowerCase().includes(lowerQuery);
      const sigMatch =
        symbol.signatures?.some((sig) => sig.toLowerCase().includes(lowerQuery)) ?? false;

      if (nameMatch || sigMatch) {
        results.push(symbol);
      }

      if (results.length >= limit) break;
    }

    return results;
  }

  /**
   * Find the definition location of a symbol
   */
  findDefinition(symbolId: string): Location | undefined {
    const symbol = this.symbols.get(symbolId);
    if (!symbol) return undefined;

    return {
      uri: symbol.file,
      line: symbol.line,
      column: symbol.column,
      endLine: symbol.endLine,
      endColumn: symbol.endColumn,
    };
  }

  /**
   * Find all references to a symbol (by name)
   */
  findReferences(symbolId: string): Location[] {
    const symbol = this.symbols.get(symbolId);
    if (!symbol) return [];

    // Find all symbols with the same name
    const refs: Location[] = [];
    const sameName = this.getSymbolsByName(symbol.name);

    for (const s of sameName) {
      if (s.id !== symbolId) {
        refs.push({
          uri: s.file,
          line: s.line,
          column: s.column,
          endLine: s.endLine,
          endColumn: s.endColumn,
        });
      }
    }

    return refs;
  }

  /**
   * Get locations that call this symbol (if it's a function/method)
   */
  getCallers(symbolId: string): Location[] {
    const symbol = this.symbols.get(symbolId);
    if (!symbol) return [];

    // For now, return references as callers
    // A more sophisticated implementation would analyze call expressions
    return this.findReferences(symbolId);
  }

  /**
   * Get locations that this symbol calls (if it's a function/method)
   */
  getCallees(_symbolId: string): Location[] {
    // TODO: Implement callee analysis by walking function bodies
    return [];
  }

  /**
   * Clear all indexed symbols
   */
  clear(): void {
    this.symbols.clear();
    this.fileSymbols.clear();
    this.symbolsByName.clear();
  }

  /**
   * Get index statistics
   */
  getStats(): { totalSymbols: number; totalFiles: number } {
    return {
      totalSymbols: this.symbols.size,
      totalFiles: this.fileSymbols.size,
    };
  }
}
