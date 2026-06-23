import * as fs from "fs";
import { WorkspaceScanner } from "../../scanner/workspace-scanner.js";
import { SymbolIndex } from "../../symbols/symbol-index.js";
import type { SearchCommandOptions } from "./index.js";

export async function runSearchCommand(options: SearchCommandOptions): Promise<number> {
  const {
    query,
    path: rootPath = process.cwd(),
    refs = false,
    file,
    kind,
    json = false,
    limit = 50,
  } = options;

  if (!query) {
    if (json) {
      console.log(JSON.stringify({ error: "Query is required" }, null, 2));
    } else {
      console.error("Error: Query is required");
    }
    return 1;
  }

  try {
    const scanner = new WorkspaceScanner();
    const symbolIndex = new SymbolIndex();

    // Collect and index all TS/JS files
    const files: Map<string, string> = new Map();

    for await (const entry of scanner.scan(rootPath)) {
      if (entry.language === "typescript" || entry.language === "javascript") {
        // Filter by file if specified
        if (file && !entry.path.includes(file)) {
          continue;
        }
        try {
          const content = fs.readFileSync(entry.absolutePath, "utf-8");
          files.set(entry.path, content);
        } catch {
          // Skip files we can't read
        }
      }
    }

    await symbolIndex.indexFiles(files);

    // Search for symbols
    let results = symbolIndex.search(query, limit);

    // Filter by kind if specified
    if (kind) {
      results = results.filter((s) => s.kind === kind);
    }

    // Output based on flags
    if (json) {
      console.log(
        JSON.stringify(
          {
            query,
            count: results.length,
            results: results.map((s) => ({
              id: s.id,
              name: s.name,
              kind: s.kind,
              file: s.file,
              line: s.line,
              column: s.column,
              signatures: s.signatures,
              visibility: s.visibility,
            })),
          },
          null,
          2,
        ),
      );
      return 0;
    }

    // Default output
    if (results.length === 0) {
      console.log(`No symbols found matching "${query}".`);
      return 1;
    }

    console.log(`Found ${results.length} symbol(s):`);
    for (const sym of results) {
      const sig = sym.signatures?.[0] ?? "";
      console.log(`  [${sym.kind}] ${sym.name}${sig ? ` ${sig}` : ""} (${sym.file}:${sym.line})`);
    }

    // Show references if requested
    if (refs && results.length > 0) {
      console.log("\nReferences:");
      for (const sym of results.slice(0, 5)) {
        const refs = symbolIndex.findReferences(sym.id);
        if (refs.length > 0) {
          console.log(`  ${sym.name}: ${refs.length} reference(s)`);
          for (const ref of refs.slice(0, 3)) {
            console.log(`    at ${ref.uri}:${ref.line}`);
          }
        }
      }
    }

    return 0;
  } catch (err) {
    if (json) {
      console.log(JSON.stringify({ error: String(err) }, null, 2));
    } else {
      console.error(`Error: ${err}`);
    }
    return 1;
  }
}
