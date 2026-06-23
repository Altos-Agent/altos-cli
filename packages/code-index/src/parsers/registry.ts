import type { IndexedSymbol } from "../types.js";

/**
 * Capabilities that a language parser may support.
 */
export interface ParserCapabilities {
  /** Can extract top-level symbols (functions, classes, types) */
  extractSymbols: boolean;
  /** Can extract import statements */
  extractImports: boolean;
  /** Can extract export statements */
  extractExports: boolean;
  /** Can extract type annotations */
  extractTypes: boolean;
}

/**
 * Language parser interface for multi-language support.
 * Each parser handles a specific language or language family.
 */
export interface LanguageParser {
  /** Language identifier */
  language: string;
  /** File extensions this parser handles (including leading dot) */
  extensions: string[];

  /**
   * Parse file content and extract symbols.
   * @param content File content as string
   * @param filePath Relative path for symbol IDs
   * @returns Array of indexed symbols
   */
  parse(content: string, filePath: string): Promise<IndexedSymbol[]>;

  /**
   * Get parser capabilities.
   */
  getCapabilities(): ParserCapabilities;
}

/**
 * Result of parsing a file.
 */
export interface ParsedFile {
  symbols: IndexedSymbol[];
  imports: string[];
  exports: string[];
}

/**
 * Registry of language parsers.
 * Use `registerParser()` to add new language support.
 */
export class LanguageParserRegistry {
  private parsers: Map<string, LanguageParser> = new Map();
  private extensionMap: Map<string, LanguageParser> = new Map();

  constructor() {
    // Register built-in TypeScript parser (imported lazily to avoid circular deps)
  }

  /**
   * Register a parser for a language.
   */
  register(parser: LanguageParser): void {
    this.parsers.set(parser.language, parser);
    for (const ext of parser.extensions) {
      this.extensionMap.set(ext.toLowerCase(), parser);
    }
  }

  /**
   * Get parser for a specific language.
   */
  getParser(language: string): LanguageParser | undefined {
    return this.parsers.get(language);
  }

  /**
   * Get parser for a file by its extension.
   */
  getParserForExtension(ext: string): LanguageParser | undefined {
    return this.extensionMap.get(ext.toLowerCase());
  }

  /**
   * Get all registered languages.
   */
  getLanguages(): string[] {
    return Array.from(this.parsers.keys());
  }

  /**
   * Check if a language is supported.
   */
  isSupported(language: string): boolean {
    return this.parsers.has(language);
  }

  /**
   * Check if a file extension is supported.
   */
  isSupportedExtension(ext: string): boolean {
    return this.extensionMap.has(ext.toLowerCase());
  }
}

// Singleton instance
export const parserRegistry = new LanguageParserRegistry();