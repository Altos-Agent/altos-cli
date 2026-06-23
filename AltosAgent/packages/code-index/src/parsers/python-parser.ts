import type { IndexedSymbol } from "../types.js";
import type { LanguageParser, ParserCapabilities } from "./registry.js";

/**
 * Python parser placeholder using tree-sitter-python.
 *
 * STATUS: Placeholder - not yet implemented
 *
 * When implemented, this parser will:
 * - Extract classes, functions, methods
 * - Extract imports (import X, from X import Y)
 * - Extract type annotations
 * - Handle __init__.py, __main__.py special files
 *
 * Dependencies to add when implementing:
 *   npm install tree-sitter-python
 *
 * Extension: .py
 */
export class PythonParser implements LanguageParser {
  language = "python";
  extensions = [".py"];

  getCapabilities(): ParserCapabilities {
    return {
      extractSymbols: false, // Not yet implemented
      extractImports: false,
      extractExports: false,
      extractTypes: false,
    };
  }

  async parse(_content: string, _filePath: string): Promise<IndexedSymbol[]> {
    // PLACEHOLDER: Return empty array until tree-sitter-python is integrated
    //
    // When implementing, follow this pattern:
    //
    // import Parser from "tree-sitter";
    // import Python from "tree-sitter-python";
    //
    // const parser = new Parser();
    // parser.setLanguage(Python);
    // const tree = parser.parse(content);
    //
    // Walk tree.rootNode and extract:
    // - class_definition → class name, base classes
    // - function_definition → function name, parameters, return type
    // - decorated_definition → handle @decorator
    // - import_statement / import_from_statement → track imports
    // - future_import_statement → track future imports
    //
    // For each symbol, return IndexedSymbol with:
    //   id: `${filePath}:${line}:${column}`
    //   name: symbol name
    //   kind: "class" | "function" | "method" | "constant" | "type"
    //   file: filePath
    //   line, column, endLine, endColumn
    //   visibility: "exported" if name starts with uppercase (convention)
    //   scope: containing class/function if nested

    return [];
  }
}

// Auto-register the parser (even though it's a placeholder)
import { parserRegistry } from "./registry.js";
parserRegistry.register(new PythonParser());