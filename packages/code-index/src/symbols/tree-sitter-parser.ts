import Parser from "tree-sitter";
import TypeScript from "tree-sitter-typescript/bindings/node/typescript.js";
import type { IndexedSymbol, Visibility } from "../types.js";

const parser = new Parser();
parser.setLanguage(TypeScript);

function getNodeText(
  node: { startIndex: number; endIndex: number; text?: string },
  source: string,
): string {
  return source.slice(node.startIndex, node.endIndex);
}

function extractParameters(
  paramsNode: {
    type: string;
    children: any[];
    text?: string;
    startIndex: number;
    endIndex: number;
  },
  source: string,
): string {
  if (!paramsNode || paramsNode.type !== "formal_parameters") {
    return "()";
  }
  const params: string[] = [];
  for (const child of paramsNode.children) {
    if (child.isNamed && child.type !== "(" && child.type !== ")" && child.type !== ",") {
      if (child.type === "required_parameter") {
        const name =
          child.children.find(
            (c: any) => c.isNamed && (c.type === "identifier" || c.type === "property_identifier"),
          )?.text || "";
        const typeAnn = child.children.find((c: any) => c.type === "type_annotation");
        if (typeAnn) {
          params.push(`${name}: ${getNodeText(typeAnn, source)}`);
        } else {
          params.push(name);
        }
      }
    }
  }
  return `(${params.join(", ")})`;
}

function extractReturnType(
  node: { type: string; children: any[]; text?: string },
  _source: string,
): string {
  // Look for type_annotation at the end (return type)
  const typeAnn = node.children?.find((c: any) => c.type === "type_annotation");
  if (typeAnn) {
    // Skip the first child (the colon) and get the rest
    const parts = typeAnn.children.filter((c: any) => c.type !== ":");
    return parts
      .map((p: any) => p.text || "")
      .join("")
      .trim();
  }
  return "void";
}

function extractIdentifier(node: { type: string; children: any[]; text?: string }): string {
  if (
    node.type === "identifier" ||
    node.type === "property_identifier" ||
    node.type === "type_identifier"
  ) {
    return node.text || "";
  }
  if (node.children) {
    for (const child of node.children) {
      const id = extractIdentifier(child);
      if (id) return id;
    }
  }
  return "";
}

interface ParseContext {
  source: string;
  file: string;
}

function makeSymbolId(file: string, line: number, column: number): string {
  return `${file}:${line}:${column}`;
}

function isExported(node: { type: string; parent?: { type: string } }): boolean {
  return node.parent?.type === "export_statement";
}

function extractTypeFromAnnotation(annotations: any[], source: string): string {
  for (const ann of annotations) {
    if (ann.type === "type_annotation") {
      return getNodeText(
        ann as { startIndex: number; endIndex: number; text?: string },
        source,
      ).replace(/^:\s*/, "");
    }
  }
  return "";
}

function walkAndExtractSymbols(
  node: any,
  ctx: ParseContext,
  symbols: IndexedSymbol[],
  scope?: string,
): void {
  const { source, file } = ctx;

  if (!node || !node.isNamed) return;

  // Handle export_statement - look at its named children
  if (node.type === "export_statement") {
    for (const child of node.namedChildren) {
      walkAndExtractSymbols(child, ctx, symbols, scope);
    }
    return;
  }

  // function_declaration
  if (node.type === "function_declaration") {
    const name = extractIdentifier(node);
    const visibility: Visibility = isExported(node) ? "exported" : "internal";
    const params = node.children?.find((c: any) => c.type === "formal_parameters");
    const sig = params
      ? `(${extractParameters(params, source)}) => ${extractReturnType(node, source)}`
      : "() => void";

    symbols.push({
      id: makeSymbolId(file, node.startPosition.row + 1, node.startPosition.column + 1),
      name,
      kind: "function",
      file,
      line: node.startPosition.row + 1,
      column: node.startPosition.column + 1,
      endLine: node.endPosition.row + 1,
      endColumn: node.endPosition.column + 1,
      visibility,
      signatures: [sig],
      scope,
    });
    return;
  }

  // class_declaration
  if (node.type === "class_declaration") {
    const name = extractIdentifier(node);
    const visibility: Visibility = isExported(node) ? "exported" : "internal";

    // Extract class name as scope
    const classScope = name;

    // First add the class itself
    symbols.push({
      id: makeSymbolId(file, node.startPosition.row + 1, node.startPosition.column + 1),
      name,
      kind: "class",
      file,
      line: node.startPosition.row + 1,
      column: node.startPosition.column + 1,
      endLine: node.endPosition.row + 1,
      endColumn: node.endPosition.column + 1,
      visibility,
      scope,
    });

    // Walk children to extract methods and properties
    for (const child of node.children) {
      if (child.isNamed) {
        walkAndExtractSymbols(child, ctx, symbols, classScope);
      }
    }
    return;
  }

  // public_field_definition
  if (node.type === "public_field_definition") {
    const name = extractIdentifier(node);
    const typeAnn = extractTypeFromAnnotation(node.children || [], source);
    symbols.push({
      id: makeSymbolId(file, node.startPosition.row + 1, node.startPosition.column + 1),
      name,
      kind: "property",
      file,
      line: node.startPosition.row + 1,
      column: node.startPosition.column + 1,
      endLine: node.endPosition.row + 1,
      endColumn: node.endPosition.column + 1,
      visibility: "exported",
      signatures: typeAnn ? [typeAnn] : undefined,
      scope,
    });
    return;
  }

  // method_definition
  if (node.type === "method_definition") {
    const name = extractIdentifier(node);
    const params = node.children?.find((c: any) => c.type === "formal_parameters");
    const sig = params
      ? `(${extractParameters(params, source)}) => ${extractReturnType(node, source)}`
      : "() => void";

    symbols.push({
      id: makeSymbolId(file, node.startPosition.row + 1, node.startPosition.column + 1),
      name,
      kind: "method",
      file,
      line: node.startPosition.row + 1,
      column: node.startPosition.column + 1,
      endLine: node.endPosition.row + 1,
      endColumn: node.endPosition.column + 1,
      visibility: "exported",
      signatures: [sig],
      scope,
    });
    return;
  }

  // interface_declaration
  if (node.type === "interface_declaration") {
    const name = extractIdentifier(node);
    const visibility: Visibility = isExported(node) ? "exported" : "internal";

    symbols.push({
      id: makeSymbolId(file, node.startPosition.row + 1, node.startPosition.column + 1),
      name,
      kind: "interface",
      file,
      line: node.startPosition.row + 1,
      column: node.startPosition.column + 1,
      endLine: node.endPosition.row + 1,
      endColumn: node.endPosition.column + 1,
      visibility,
      scope,
    });

    // Walk children to extract interface members
    for (const child of node.children) {
      if (child.isNamed) {
        walkAndExtractSymbols(child, ctx, symbols, name);
      }
    }
    return;
  }

  // property_signature (in interface)
  if (node.type === "property_signature") {
    const name = extractIdentifier(node);
    const typeAnn = extractTypeFromAnnotation(node.children || [], source);
    symbols.push({
      id: makeSymbolId(file, node.startPosition.row + 1, node.startPosition.column + 1),
      name,
      kind: "property",
      file,
      line: node.startPosition.row + 1,
      column: node.startPosition.column + 1,
      endLine: node.endPosition.row + 1,
      endColumn: node.endPosition.column + 1,
      visibility: "exported",
      signatures: typeAnn ? [typeAnn] : undefined,
      scope,
    });
    return;
  }

  // method_signature (in interface)
  if (node.type === "method_signature") {
    const name = extractIdentifier(node);
    const params = node.children?.find((c: any) => c.type === "formal_parameters");
    const sig = params
      ? `(${extractParameters(params, source)}) => ${extractReturnType(node, source)}`
      : "() => void";
    symbols.push({
      id: makeSymbolId(file, node.startPosition.row + 1, node.startPosition.column + 1),
      name,
      kind: "method",
      file,
      line: node.startPosition.row + 1,
      column: node.startPosition.column + 1,
      endLine: node.endPosition.row + 1,
      endColumn: node.endPosition.column + 1,
      visibility: "exported",
      signatures: [sig],
      scope,
    });
    return;
  }

  // type_alias_declaration
  if (node.type === "type_alias_declaration") {
    const name = extractIdentifier(node);
    const visibility: Visibility = isExported(node) ? "exported" : "internal";
    const typeNode = node.children?.find(
      (c: any) => c.type !== "type_identifier" && c.type !== "=",
    );
    const typeStr = typeNode ? getNodeText(typeNode, source) : "unknown";

    symbols.push({
      id: makeSymbolId(file, node.startPosition.row + 1, node.startPosition.column + 1),
      name,
      kind: "type",
      file,
      line: node.startPosition.row + 1,
      column: node.startPosition.column + 1,
      endLine: node.endPosition.row + 1,
      endColumn: node.endPosition.column + 1,
      visibility,
      signatures: [typeStr],
      scope,
    });
    return;
  }

  // lexical_declaration (for const/let/var)
  if (node.type === "lexical_declaration") {
    for (const child of node.namedChildren) {
      walkAndExtractSymbols(child, ctx, symbols, scope);
    }
    return;
  }

  // variable_declarator
  if (node.type === "variable_declarator") {
    const name = extractIdentifier(node);
    if (name) {
      const visibility: Visibility = isExported(node) ? "exported" : "internal";
      symbols.push({
        id: makeSymbolId(file, node.startPosition.row + 1, node.startPosition.column + 1),
        name,
        kind: "constant",
        file,
        line: node.startPosition.row + 1,
        column: node.startPosition.column + 1,
        endLine: node.endPosition.row + 1,
        endColumn: node.endPosition.column + 1,
        visibility,
        scope,
      });
    }
    return;
  }

  // Default: walk children
  for (const child of node.children || []) {
    if (child.isNamed) {
      walkAndExtractSymbols(child, ctx, symbols, scope);
    }
  }
}

export function parseTS(content: string, file: string = ""): { symbols: IndexedSymbol[] } {
  const tree = parser.parse(content);
  const symbols: IndexedSymbol[] = [];

  const ctx: ParseContext = { source: content, file };

  for (const child of tree.rootNode.namedChildren) {
    walkAndExtractSymbols(child, ctx, symbols);
  }

  return { symbols };
}
