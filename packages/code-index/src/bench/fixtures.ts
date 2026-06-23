import fs from "fs";
import path from "path";
import os from "os";

/**
 * Benchmark fixture for large repo simulation.
 * Generates synthetic TypeScript files for performance testing.
 */

export interface FixtureConfig {
  name: string;
  fileCount: number;
  symbolCount: number;
  languageDistribution: Record<string, number>;
  directoryDepth: number;
  packages: number;
}

export const FIXTURE_100: FixtureConfig = {
  name: "fixture-100",
  fileCount: 100,
  symbolCount: 2000,
  languageDistribution: {
    typescript: 70,
    javascript: 20,
    json: 5,
    markdown: 5,
  },
  directoryDepth: 4,
  packages: 2,
};

export const FIXTURE_1K: FixtureConfig = {
  name: "fixture-1k",
  fileCount: 1000,
  symbolCount: 20000,
  languageDistribution: {
    typescript: 600,
    javascript: 200,
    json: 50,
    markdown: 50,
    yaml: 50,
    css: 30,
    html: 20,
  },
  directoryDepth: 6,
  packages: 5,
};

export const FIXTURE_10K: FixtureConfig = {
  name: "fixture-10k",
  fileCount: 10000,
  symbolCount: 200000,
  languageDistribution: {
    typescript: 5000,
    javascript: 2500,
    json: 500,
    markdown: 500,
    yaml: 400,
    css: 400,
    html: 300,
    go: 200,
    python: 150,
    rust: 50,
  },
  directoryDepth: 8,
  packages: 10,
};

const SYMBOL_NAMES = [
  "AuthService", "UserManager", "SessionHandler", "TokenValidator", "PermissionCache",
  "DatabaseConnection", "QueryBuilder", "MigrationRunner", "SchemaSync", "BackupManager",
  "CacheLayer", "RateLimiter", "ConfigLoader", "Logger", "MetricsCollector",
  "EventBus", "MessageQueue", "WorkerPool", "TaskScheduler", "WebhookHandler",
  "APIClient", "RequestValidator", "ResponseFormatter", "ErrorHandler", "RetryPolicy",
  "LoadBalancer", "ServiceRegistry", "HealthChecker", "CircuitBreaker", "Bulkhead",
];

const KIND_WEIGHTS = [
  { kind: "class", weight: 3 },
  { kind: "interface", weight: 2 },
  { kind: "function", weight: 5 },
  { kind: "method", weight: 4 },
  { kind: "type", weight: 2 },
  { kind: "constant", weight: 3 },
  { kind: "property", weight: 2 },
];

function weightedRandom<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let random = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    random -= weights[i];
    if (random <= 0) return items[i];
  }
  return items[items.length - 1];
}

function generateSymbol(_filePath: string, index: number): string {
  const name = SYMBOL_NAMES[index % SYMBOL_NAMES.length] + (index >= SYMBOL_NAMES.length ? index : "");
  const kind = weightedRandom(
    KIND_WEIGHTS.map((w) => w.kind),
    KIND_WEIGHTS.map((w) => w.weight)
  );

  switch (kind) {
    case "class":
      return `export class ${name} {\n  private data: any;\n  constructor() { this.data = {}; }\n  init(): void {}\n}\n`;
    case "interface":
      return `export interface ${name} {\n  id: string;\n  process(): void;\n}\n`;
    case "function":
      return `export function ${name.toLowerCase()}(input: any): any {\n  return input;\n}\n`;
    case "method":
      return `export const ${name} = {\n  execute(): void {},\n  rollback(): void {},\n};\n`;
    case "type":
      return `export type ${name} = {\n  value: string;\n  timestamp: number;\n};\n`;
    case "constant":
      return `export const ${name.toUpperCase()} = "${name}";\n`;
    case "property":
      return `export const ${name.toLowerCase()} = {\n  key: "value",\n};\n`;
    default:
      return `export const ${name} = null;\n`;
  }
}

// Track generated files for cross-file import resolution
const generatedFileRegistry: Map<string, { symbols: string[]; relativePath: string }> = new Map();

function generateTypeScriptFile(
  filePath: string,
  symbolCount: number,
  _relativePath: string,
): { content: string; exportedSymbols: string[] } {
  // Resolve which symbols this file exports
  const exportedSymbols: string[] = [];
  for (let i = 0; i < symbolCount; i++) {
    const name = SYMBOL_NAMES[i % SYMBOL_NAMES.length] + (i >= SYMBOL_NAMES.length ? i : "");
    exportedSymbols.push(name);
  }

  // Decide which other files this file imports (realistic cross-file references)
  const importLines: string[] = [];
  const importCount = Math.floor(Math.random() * 4); // 0-3 imports per file
  const allFiles = Array.from(generatedFileRegistry.entries());
  if (allFiles.length > 0 && importCount > 0) {
    // Pick random existing files to import from
    const shuffled = allFiles.sort(() => Math.random() - 0.5).slice(0, Math.min(importCount, allFiles.length));
    for (const [, fileInfo] of shuffled) {
      const importSymbol = fileInfo.symbols[Math.floor(Math.random() * fileInfo.symbols.length)];
      if (importSymbol) {
        importLines.push(`import { ${importSymbol} } from './${fileInfo.relativePath.replace(/\.ts$/, "")}';`);
      }
    }
  }

  const lines: string[] = [
    `// Auto-generated fixture file: ${filePath}`,
    `// ${symbolCount} symbols`,
    "",
  ];

  // Add imports after header
  lines.push(...importLines);
  if (importLines.length > 0) lines.push("");

  for (let i = 0; i < symbolCount; i++) {
    lines.push(generateSymbol(filePath, i));
    lines.push("");
  }

  return { content: lines.join("\n"), exportedSymbols };
}

// generateJavaScriptFile is intentionally not used right now — the fixture
// generator reuses generateTypeScriptFile for both TS and JS fixtures.
// Keeping the signature here for parity with the planned multi-language
// generator (Phase 21.4).
// @ts-expect-error - intentionally retained for future use
function generateJavaScriptFile(filePath: string): string {
  return `// Auto-generated JavaScript file: ${filePath}\nexport const module = { init: () => {} };\n`;
}

function generateJSONFile(): string {
  return JSON.stringify({ name: "fixture", version: "1.0.0", data: [] }, null, 2);
}

function generateMarkdownFile(title: string): string {
  return `# ${title}\n\nAuto-generated fixture documentation.\n`;
}

function generateYAMLFile(): string {
  return "name: fixture\nversion: 1.0.0\ndependencies: {}\n";
}

function generateCSSFile(): string {
  return ".fixture { color: red; }\n";
}

function generateHTMLFile(): string {
  return "<!DOCTYPE html>\n<html><head><title>Fixture</title></head><body></body></html>\n";
}

function generateGoFile(filePath: string, symbolCount: number): string {
  const lines: string[] = [
    `// Auto-generated Go file: ${filePath}`,
    "package main",
    "",
  ];

  for (let i = 0; i < Math.min(symbolCount, 5); i++) {
    const name = SYMBOL_NAMES[i % SYMBOL_NAMES.length];
    lines.push(`func ${name}() {\n  // implementation\n}`);
    lines.push("");
  }

  return lines.join("\n");
}

function generatePythonFile(filePath: string): string {
  return `# Auto-generated Python file: ${filePath}\ndef main():\n    pass\n`;
}

function generateRustFile(filePath: string): string {
  return `// Auto-generated Rust file: ${filePath}\nfn main() {\n    println!("fixture");\n}\n`;
}

function generateFile(
  filePath: string,
  language: string,
  symbolCount: number,
  relativePath: string,
): string {
  switch (language) {
    case "typescript":
    case "javascript":
      return generateTypeScriptFile(filePath, Math.ceil(symbolCount / 10), relativePath).content;
    case "json":
      return generateJSONFile();
    case "markdown":
      return generateMarkdownFile(path.basename(filePath));
    case "yaml":
      return generateYAMLFile();
    case "css":
      return generateCSSFile();
    case "html":
      return generateHTMLFile();
    case "go":
      return generateGoFile(filePath, symbolCount);
    case "python":
      return generatePythonFile(filePath);
    case "rust":
      return generateRustFile(filePath);
    default:
      return `// ${filePath}\n`;
  }
}

/**
 * Generate a fixture directory with synthetic files.
 */
export async function generateFixture(config: FixtureConfig): Promise<string> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `altos-bench-${config.name}-`));

  // Clear and re-populate the file registry for this run
  generatedFileRegistry.clear();

  // Distribute files across packages/directories
  const dirs: string[] = [];
  for (let i = 0; i < config.packages; i++) {
    const pkgDirs = [];
    for (let d = 0; d < config.directoryDepth; d++) {
      const dir = path.join(
        tmpDir,
        `packages/pkg${i}/src`,
        ...Array.from({ length: d }, (_, j) => `module${j}`)
      );
      pkgDirs.push(dir);
      fs.mkdirSync(dir, { recursive: true });
    }
    dirs.push(...pkgDirs);
  }

  // Add root-level directories
  dirs.push(path.join(tmpDir, "scripts"));
  dirs.push(path.join(tmpDir, "config"));
  dirs.push(path.join(tmpDir, "docs"));
  fs.mkdirSync(path.join(tmpDir, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, "config"), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, "docs"), { recursive: true });

  // Distribute language counts
  const languages: Array<{ lang: string; count: number }> = [];
  for (const [lang, count] of Object.entries(config.languageDistribution)) {
    if (count > 0) {
      languages.push({ lang, count });
    }
  }

  // Generate files
  let fileIndex = 0;
  const symbolsPerFile = Math.ceil(config.symbolCount / config.fileCount);

  for (let i = 0; i < config.fileCount && fileIndex < config.fileCount; i++) {
    const dir = dirs[i % dirs.length];
    const langEntry = languages[i % languages.length];
    const ext = getExtension(langEntry.lang);
    const fileName = `file_${fileIndex++}${ext}`;
    const absolutePath = path.join(dir, fileName);
    const relativePath = absolutePath.replace(tmpDir + "/", "");

    const content = generateFile(
      relativePath,
      langEntry.lang,
      symbolsPerFile,
      relativePath,
    );

    fs.writeFileSync(absolutePath, content, "utf-8");

    // Register TS/JS files for cross-file import resolution
    if (langEntry.lang === "typescript" || langEntry.lang === "javascript") {
      const symbolsForFile = Array.from(
        { length: Math.ceil(symbolsPerFile / 10) },
        (_, idx) => {
          const baseName = SYMBOL_NAMES[idx % SYMBOL_NAMES.length];
          return baseName + (idx >= SYMBOL_NAMES.length ? idx : "");
        }
      );
      generatedFileRegistry.set(absolutePath, { symbols: symbolsForFile, relativePath });
    }
  }

  // Generate package.json files
  for (let i = 0; i < config.packages; i++) {
    const pkgDir = path.join(tmpDir, "packages", `pkg${i}`);
    const pkgJson = {
      name: `@fixture/pkg${i}`,
      version: "1.0.0",
      scripts: {
        build: "tsc",
        test: "vitest",
        lint: "eslint src",
      },
      dependencies: {},
      devDependencies: {
        typescript: "^5.0.0",
        vitest: "^1.0.0",
      },
    };
    fs.writeFileSync(
      path.join(pkgDir, "package.json"),
      JSON.stringify(pkgJson, null, 2),
      "utf-8"
    );
  }

  // Root package.json
  const rootPkg = {
    name: "@altos/bench-fixture",
    version: "1.0.0",
    private: true,
    workspaces: ["packages/*"],
  };
  fs.writeFileSync(
    path.join(tmpDir, "package.json"),
    JSON.stringify(rootPkg, null, 2),
    "utf-8"
  );

  // Clear registry to free memory
  generatedFileRegistry.clear();

  return tmpDir;
}

function getExtension(language: string): string {
  switch (language) {
    case "typescript":
      return ".ts";
    case "javascript":
      return ".js";
    case "json":
      return ".json";
    case "markdown":
      return ".md";
    case "yaml":
      return ".yaml";
    case "css":
      return ".css";
    case "html":
      return ".html";
    case "go":
      return ".go";
    case "python":
      return ".py";
    case "rust":
      return ".rs";
    default:
      return ".txt";
  }
}

/**
 * Clean up a fixture directory.
 */
export function cleanupFixture(tmpDir: string): void {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}