import type { IndexedSymbol } from "../types.js";
import type { LanguageParser, ParserCapabilities } from "./registry.js";

/**
 * Rust parser placeholder using tree-sitter-rust.
 *
 * STATUS: Placeholder - not yet implemented
 *
 * When implemented, this parser will:
 * - Extract functions (fn), methods (impl blocks)
 * - Extract structs, enums, traits, impl blocks
 * - Extract const and static items
 * - Handle use statements (imports)
 * - Handle mod declarations (module hierarchy)
 *
 * Dependencies to add when implementing:
 *   npm install tree-sitter-rust
 *
 * Extension: .rs
 */
export class RustParser implements LanguageParser {
  language = "rust";
  extensions = [".rs"];

  getCapabilities(): ParserCapabilities {
    return {
      extractSymbols: false, // Not yet implemented
      extractImports: false,
      extractExports: false,
      extractTypes: false,
    };
  }

  async parse(_content: string, _filePath: string): Promise<IndexedSymbol[]> {
    // PLACEHOLDER: Return empty array until tree-sitter-rust is integrated
    //
    // When implementing, follow this pattern:
    //
    // import Parser from "tree-sitter";
    // import Rust from "tree-sitter-rust";
    //
    // const parser = new Parser();
    // parser.setLanguage(Rust);
    // const tree = parser.parse(content);
    //
    // Walk tree.rootNode and extract:
    // - function_item → function name, parameters, return type
    // - impl_item → methods within impl block
    // - struct_item → struct name, fields
    // - enum_item → enum name, variants
    // - trait_item → trait name, methods
    // - const_item / static_item → constants
    // - use_declaration → track imports
    //
    // Rust-specific considerations:
    // - Public items use `pub` keyword
    // - Methods live inside impl blocks
    // - Traits define interface methods
    // - Lifetime parameters need handling
    // - Module hierarchy via mod declarations

    return [];
  }
}

// Auto-register the parser
import { parserRegistry } from "./registry.js";
parserRegistry.register(new RustParser());