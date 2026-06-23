import { WorkspaceScanner } from "../../scanner/workspace-scanner.js";
import { SymbolIndex } from "../../symbols/symbol-index.js";
import { RepoMapBuilder } from "../../repo-map/repo-map-builder.js";
import type { MapCommandOptions } from "./index.js";

export async function runMapCommand(options: MapCommandOptions): Promise<number> {
  const rootPath = options.path ?? process.cwd();

  try {
    const startedAt = Date.now();
    const scanner = new WorkspaceScanner();
    const symbolIndex = new SymbolIndex();
    const repoMapBuilder = new RepoMapBuilder();

    // Build repo map
    const repoMap = await repoMapBuilder.build(rootPath, scanner, symbolIndex);
    const durationMs = Date.now() - startedAt;

    // Quiet mode - just print summary stats
    if (options.quiet) {
      console.log(`${repoMap.packages.length} packages, ${repoMap.importantFiles.length} important files, ${symbolIndex.getStats().totalSymbols} symbols`);
      return 0;
    }

    // Output based on flags
    if (options.json) {
      console.log(JSON.stringify({
        repoMap,
        stats: {
          packages: repoMap.packages.length,
          importantFiles: repoMap.importantFiles.length,
          symbols: symbolIndex.getStats().totalSymbols,
          durationMs,
        }
      }, null, 2));
      return 0;
    }

    // Default output
    console.log(repoMapBuilder.toSummary(repoMap));
    console.log(`\nGenerated in ${durationMs}ms`);

    // Show important files if requested or by default
    if (options.important || (!options.packages && !options.exports)) {
      if (repoMap.importantFiles.length > 0) {
        console.log("\nImportant files:");
        for (const file of repoMap.importantFiles) {
          console.log(`  ${file.path} - ${file.purpose} (${file.lineCount} lines)`);
        }
      }
    }

    // Show package info if requested
    if (options.packages) {
      if (repoMap.packages.length > 0) {
        console.log("\nPackages:");
        for (const pkg of repoMap.packages) {
          console.log(`  ${pkg.name}@${pkg.version} (${pkg.path})`);
          if (Object.keys(pkg.scripts).length > 0) {
            console.log(`    Scripts: ${Object.keys(pkg.scripts).join(", ")}`);
          }
          if (pkg.dependencies.length > 0) {
            console.log(
              `    Dependencies: ${pkg.dependencies.slice(0, 10).join(", ")}${pkg.dependencies.length > 10 ? "..." : ""}`,
            );
          }
        }
      } else {
        console.log("\nNo packages found.");
      }
    }

    // Show exported symbols if requested
    if (options.exports) {
      const exported = symbolIndex.getExportedSymbols();
      if (exported.length > 0) {
        console.log("\nExported symbols:");
        for (const sym of exported.slice(0, 50)) {
          const sig = sym.signatures?.[0] ?? "";
          console.log(
            `  [${sym.kind}] ${sym.name}${sig ? ` ${sig}` : ""} (${sym.file}:${sym.line})`,
          );
        }
        if (exported.length > 50) {
          console.log(`  ... and ${exported.length - 50} more`);
        }
      } else {
        console.log("\nNo exported symbols found.");
      }
    }

    return 0;
  } catch (err) {
    if (options.json) {
      console.log(JSON.stringify({ error: String(err) }, null, 2));
    } else {
      console.error(`Error: ${err}`);
    }
    return 1;
  }
}
