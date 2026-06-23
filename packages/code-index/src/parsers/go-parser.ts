import type { IndexedSymbol } from "../types.js";
import type { LanguageParser, ParserCapabilities } from "./registry.js";

/**
 * Go parser placeholder using tree-sitter-go.
 *
 * STATUS: Placeholder - not yet implemented
 *
 * When implemented, this parser will:
 * - Extract functions (func), methods (func (recv) Name())
 * - Extract types, interfaces, structs
 * - Extract package-level constants and variables
 * - Handle import statements
 * - Handle go.mod dependency tracking
 *
 * Dependencies to add when implementing:
 *   npm install tree-sitter-go
 *
 * Extension: .go
 */
export class GoParser implements LanguageParser {
  language = "go";
  extensions = [".go"];

  getCapabilities(): ParserCapabilities {
    return {
      extractSymbols: false, // Not yet implemented
      extractImports: false,
      extractExports: false,
      extractTypes: false,
    };
  }

  async parse(_content: string, _filePath: string): Promise<IndexedSymbol[]> {
    // PLACEHOLDER: Return empty array until tree-sitter-go is integrated
    //
    // When implementing, follow this pattern:
    //
    // import Parser from "tree-sitter";
    // import Go from "tree-sitter-go";
    //
    // const parser = new Parser();
    // parser.setLanguage(Go);
    // const tree = parser.parse(content);
    //
    // Walk tree.rootNode and extract:
    // - function_declaration → function name, params, results
    // - method_declaration → receiver type + method name
    // - type_declaration → type name, underlying type
    // - const_declaration / var_declaration → package-level vars
    // - import_declaration → track imports
    //
    // Go-specific considerations:
    // - Exported names are Capitalized
    // - Methods have receivers shown as type
    // - Interfaces define method signatures
    // - Go doesn't have classes but has receiver methods on types

    return [];
  }
}

// Auto-register the parser
import { parserRegistry } from "./registry.js";
parserRegistry.register(new GoParser());