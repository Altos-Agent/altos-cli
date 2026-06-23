#!/usr/bin/env tsx
// scripts/analyze-reference-repo.ts
// Generates detailed architectural analysis for a reference repository

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_DIR = join(__dirname, "../repository_reference");
const DOCS_REFS_DIR = join(__dirname, "../docs/references");

interface RepoAnalysis {
  repo: string;
  date: string;
  languages: string[];
  structure: {
    dirs: string[];
    keyFiles: string[];
    totalFiles: number;
    totalLines: number;
  };
  patterns: {
    cli?: string[];
    plugin?: string[];
    memory?: string[];
    tools?: string[];
    config?: string[];
  };
  altoScore: {
    architecture: number;
    pluginSystem: number;
    toolSystem: number;
    memoryManagement: number;
    security: number;
    overall: number;
  };
  learn: string[];
  avoid: string[];
  notes: string;
}

const CODE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java"];

function getLanguage(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".py": "Python",
    ".go": "Go",
    ".rs": "Rust",
    ".java": "Java",
    ".json": "JSON",
    ".md": "Markdown",
    ".yaml": "YAML",
    ".yml": "YAML",
    ".sh": "Shell",
  };
  return map[ext] ?? "Other";
}

function countLines(content: string): number {
  return content.split("\n").length;
}

async function scanRepo(
  repoPath: string,
): Promise<{ languages: Record<string, number>; files: string[]; totalLines: number }> {
  const languages: Record<string, number> = {};
  const files: string[] = [];
  let totalLines = 0;

  async function walk(dir: string, depth = 0): Promise<void> {
    if (depth > 5) return; // Limit depth

    try {
      const entries = readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        // Skip common ignored directories
        if (
          entry.name === "node_modules" ||
          entry.name === ".git" ||
          entry.name === "__pycache__" ||
          entry.name === "dist" ||
          entry.name === "build"
        ) {
          continue;
        }

        if (entry.isDirectory()) {
          await walk(fullPath, depth + 1);
        } else if (entry.isFile()) {
          files.push(fullPath);
          const lang = getLanguage(entry.name);
          languages[lang] = (languages[lang] ?? 0) + 1;

          if (CODE_EXTENSIONS.includes(extname(entry.name))) {
            try {
              const stat = statSync(fullPath);
              if (stat.size < 1024 * 1024) {
                // Skip files > 1MB
                totalLines += countLines(readFileSync(fullPath, "utf-8"));
              }
            } catch {
              // Skip unreadable files
            }
          }
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }

  await walk(repoPath);
  return { languages, files, totalLines };
}

function findKeyFiles(files: string[], patterns: RegExp[]): string[] {
  const found: string[] = [];
  for (const pattern of patterns) {
    for (const file of files) {
      if (pattern.test(file)) {
        found.push(file);
      }
    }
  }
  return found;
}

function analyzeCLIPatterns(files: string[]): string[] {
  const patterns: string[] = [];
  const cliIndicators = [
    /cli/i,
    /command.*line/i,
    /main.*entry/i,
    /bin\//i,
    /cmd\//i,
    /commander/i,
    /yargs/i,
    /clap/i,
    /click/i,
    /argparse/i,
    /index\.ts.*#!/i,
    /main\.py#!/i,
  ];

  for (const file of files) {
    for (const indicator of cliIndicators) {
      if (indicator.test(file)) {
        patterns.push(`CLI-related: ${file.split("/").slice(-2).join("/")}`);
        break;
      }
    }
  }

  return [...new Set(patterns)];
}

function analyzePluginPatterns(files: string[]): string[] {
  const patterns: string[] = [];
  const pluginIndicators = [
    /plugin/i,
    /extension/i,
    /addon/i,
    /module/i,
    /middleware/i,
    /hook/i,
    /lifecycle/i,
    /init/i,
    /register/i,
    /load/i,
  ];

  for (const file of files) {
    for (const indicator of pluginIndicators) {
      if (indicator.test(file)) {
        patterns.push(`Plugin/Extension: ${file.split("/").slice(-2).join("/")}`);
        break;
      }
    }
  }

  return [...new Set(patterns)];
}

function analyzeMemoryPatterns(files: string[]): string[] {
  const patterns: string[] = [];
  const memoryIndicators = [
    /memory/i,
    /session/i,
    /history/i,
    /context/i,
    /conversation/i,
    /embeddings?/i,
    /vector/i,
    /store/i,
    /cache/i,
    /persist/i,
  ];

  for (const file of files) {
    for (const indicator of memoryIndicators) {
      if (indicator.test(file)) {
        patterns.push(`Memory/State: ${file.split("/").slice(-2).join("/")}`);
        break;
      }
    }
  }

  return [...new Set(patterns)];
}

function analyzeToolPatterns(files: string[]): string[] {
  const patterns: string[] = [];
  const toolIndicators = [
    /tool/i,
    /executor/i,
    /runner/i,
    /bash/i,
    /shell/i,
    /exec/i,
    /spawn/i,
    /file.*system/i,
    /fs\//i,
    /git\//i,
    /read.*file/i,
    /write.*file/i,
    /glob/i,
    /grep/i,
  ];

  for (const file of files) {
    for (const indicator of toolIndicators) {
      if (indicator.test(file)) {
        patterns.push(`Tool/Executor: ${file.split("/").slice(-2).join("/")}`);
        break;
      }
    }
  }

  return [...new Set(patterns)];
}

function analyzeConfigPatterns(files: string[]): string[] {
  const patterns: string[] = [];
  const configIndicators = [
    /config/i,
    /\.json.*config/i,
    /settings/i,
    /schema/i,
    /options?/i,
    /defaults?/i,
    /environment/i,
    /\.env/i,
  ];

  for (const file of files) {
    for (const indicator of configIndicators) {
      if (indicator.test(file)) {
        patterns.push(`Config/Options: ${file.split("/").slice(-2).join("/")}`);
        break;
      }
    }
  }

  return [...new Set(patterns)];
}

function calculateAltoScore(
  repo: string,
  patterns: {
    cli?: string[];
    plugin?: string[];
    memory?: string[];
    tools?: string[];
    config?: string[];
  },
): RepoAnalysis["altoScore"] {
  let architecture = 0;
  let pluginSystem = 0;
  let toolSystem = 0;
  let memoryManagement = 0;
  let security = 0;

  // These are rough heuristics based on detected patterns
  const totalPatterns =
    (patterns.cli?.length ?? 0) +
    (patterns.plugin?.length ?? 0) +
    (patterns.memory?.length ?? 0) +
    (patterns.tools?.length ?? 0) +
    (patterns.config?.length ?? 0);

  if (totalPatterns > 0) {
    architecture = Math.min(10, Math.round(totalPatterns * 0.7));
    pluginSystem = Math.min(10, Math.round((patterns.plugin?.length ?? 0) * 1.5));
    toolSystem = Math.min(10, Math.round((patterns.tools?.length ?? 0) * 1.5));
    memoryManagement = Math.min(10, Math.round((patterns.memory?.length ?? 0) * 2));
    security = Math.min(10, Math.round((patterns.config?.length ?? 0) * 0.5));
  }

  // Repo-specific adjustments
  if (repo === "pi") {
    pluginSystem = Math.max(pluginSystem, 8);
    toolSystem = Math.max(toolSystem, 7);
    memoryManagement = Math.max(memoryManagement, 8);
  } else if (repo === "aider") {
    toolSystem = Math.max(toolSystem, 9);
    architecture = Math.max(architecture, 7);
  } else if (repo === "opencode") {
    pluginSystem = Math.max(pluginSystem, 7);
    toolSystem = Math.max(toolSystem, 8);
  }

  const overall = Math.round(
    (architecture + pluginSystem + toolSystem + memoryManagement + security) / 5,
  );

  return { architecture, pluginSystem, toolSystem, memoryManagement, security, overall };
}

function generateAltoLearnSection(repo: string): string[] {
  const commonLearn = [
    "Clean separation of concerns between packages",
    "Plugin lifecycle management (init/dispose)",
    "Tool interface design patterns",
    "Configuration schema validation",
    "Error handling and logging strategies",
  ];

  const repoSpecific: Record<string, string[]> = {
    pi: [
      "Skill system architecture and trigger patterns",
      "TUI component composition patterns",
      "MCP tool integration patterns",
      "Theme system for terminal UI",
    ],
    opencode: [
      "CLI argument parsing patterns",
      "File editing workflow",
      "Git integration approach",
    ],
    aider: [
      "LLM interaction patterns",
      "Git-aware editing workflow",
      "Conversation context management",
    ],
  };

  return [...commonLearn, ...(repoSpecific[repo] ?? [])];
}

function generateAltoAvoidSection(repo: string): string[] {
  return [
    "Direct code copying without license review",
    "Copying proprietary algorithms",
    "Replicating file structures without adaptation",
    "Using copyrighted variable/function names",
  ];
}

async function generateAnalysis(repoPath: string, repoName: string): Promise<RepoAnalysis> {
  const { languages, files, totalLines } = await scanRepo(repoPath);

  const patterns = {
    cli: analyzeCLIPatterns(files),
    plugin: analyzePluginPatterns(files),
    memory: analyzeMemoryPatterns(files),
    tools: analyzeToolPatterns(files),
    config: analyzeConfigPatterns(files),
  };

  const score = calculateAltoScore(repoName, patterns);

  const dirs = [
    ...new Set(
      files.map((f) => f.replace(repoPath, "").split("/").slice(2, -1).join("/")).filter(Boolean),
    ),
  ].slice(0, 20);

  return {
    repo: repoName,
    date: new Date().toISOString(),
    languages: Object.entries(languages)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([lang]) => lang),
    structure: {
      dirs,
      keyFiles: findKeyFiles(files, [
        /index\.(ts|js|py)$/,
        /package\.json$/,
        /pyproject\.toml$/,
        /go\.mod$/,
        /Cargo\.toml$/,
      ]).slice(0, 10),
      totalFiles: files.length,
      totalLines: totalLines ?? 0,
    },
    patterns,
    altoScore: score,
    learn: generateAltoLearnSection(repoName),
    avoid: generateAltoAvoidSection(repoName),
    notes: "",
  };
}

function analysisToMarkdown(analysis: RepoAnalysis): string {
  const lines: string[] = [
    `# Reference Analysis: ${analysis.repo}`,
    "",
    `**Generated:** ${analysis.date}`,
    `**Repository:** ${analysis.repo}`,
    "",
    "## Quick Summary",
    "",
    `| Metric | Score |`,
    `|--------|-------|`,
    `| Architecture | ${"★".repeat(analysis.altoScore.architecture)}${"☆".repeat(10 - analysis.altoScore.architecture)} |`,
    `| Plugin System | ${"★".repeat(analysis.altoScore.pluginSystem)}${"☆".repeat(10 - analysis.altoScore.pluginSystem)} |`,
    `| Tool System | ${"★".repeat(analysis.altoScore.toolSystem)}${"☆".repeat(10 - analysis.altoScore.toolSystem)} |`,
    `| Memory Management | ${"★".repeat(analysis.altoScore.memoryManagement)}${"☆".repeat(10 - analysis.altoScore.memoryManagement)} |`,
    `| Security | ${"★".repeat(analysis.altoScore.security)}${"☆".repeat(10 - analysis.altoScore.security)} |`,
    `| **Overall** | ${"★".repeat(analysis.altoScore.overall)}${"☆".repeat(10 - analysis.altoScore.overall)} |`,
    "",
    "## Repository Overview",
    "",
    `**Languages:** ${analysis.languages.join(", ") || "Unknown"}`,
    `**Total Files:** ${analysis.totalFiles}`,
    `**Total Lines:** ${(analysis.totalLines ?? 0).toLocaleString()}`,
    "",
    "## Directory Structure (Top 20)",
    "",
    "```",
    analysis.structure.dirs.map((d) => `  ${d}/`).join("\n"),
    "```",
    "",
    "## Key Files",
    "",
    analysis.structure.keyFiles.map((f) => `- \`${f}\``).join("\n"),
    "",
    "## Detected Patterns",
    "",
  ];

  if (analysis.patterns.cli?.length) {
    lines.push("### CLI Patterns");
    lines.push("");
    analysis.patterns.cli.forEach((p) => lines.push(`- ${p}`));
    lines.push("");
  }

  if (analysis.patterns.plugin?.length) {
    lines.push("### Plugin/Extension Patterns");
    lines.push("");
    analysis.patterns.plugin.forEach((p) => lines.push(`- ${p}`));
    lines.push("");
  }

  if (analysis.patterns.memory?.length) {
    lines.push("### Memory/State Patterns");
    lines.push("");
    analysis.patterns.memory.forEach((p) => lines.push(`- ${p}`));
    lines.push("");
  }

  if (analysis.patterns.tools?.length) {
    lines.push("### Tool/Executor Patterns");
    lines.push("");
    analysis.patterns.tools.forEach((p) => lines.push(`- ${p}`));
    lines.push("");
  }

  if (analysis.patterns.config?.length) {
    lines.push("### Configuration Patterns");
    lines.push("");
    analysis.patterns.config.forEach((p) => lines.push(`- ${p}`));
    lines.push("");
  }

  lines.push("## What Altos Should Learn", "");
  analysis.learn.forEach((item) => lines.push(`- ${item}`));
  lines.push("");
  lines.push("## What Altos Must NOT Copy Directly", "");
  analysis.avoid.forEach((item) => lines.push(`- ${item}`));
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push(analysis.notes || "_No additional notes_");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(`*Analysis generated automatically. Always verify findings manually.*`);
  lines.push(
    `*See [ADR-0004](../adr/0004-repository-reference-policy.md) for reference policies.*`,
  );

  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  let repoName = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--name" && i + 1 < args.length) {
      repoName = args[++i];
    }
  }

  if (!repoName) {
    console.error("Usage: pnpm reference:analyze --name <repo-name>");
    console.error("");
    console.error("Example:");
    console.error("  pnpm reference:analyze --name pi");
    process.exit(1);
  }

  const repoPath = join(REPO_DIR, repoName);

  if (!existsSync(repoPath)) {
    console.error(`ERROR: Repository '${repoName}' not found at ${repoPath}`);
    console.error("Import the repository first with: pnpm reference:import");
    process.exit(1);
  }

  // Check for ALTOS_REFERENCE_META.json
  const metaPath = join(repoPath, "ALTOS_REFERENCE_META.json");
  if (!existsSync(metaPath)) {
    console.error(`ERROR: ${metaPath} not found. Run license check first.`);
    process.exit(1);
  }

  console.log(`Analyzing reference repository: ${repoName}...`);

  const analysis = await generateAnalysis(repoPath, repoName);

  // Save to docs/references/
  await mkdir(DOCS_REFS_DIR, { recursive: true });
  const docPath = join(DOCS_REFS_DIR, `${repoName}-analysis.md`);
  await writeFile(docPath, analysisToMarkdown(analysis), "utf-8");

  // Save JSON to analysis/
  const analysisDir = join(repoPath, "analysis");
  await mkdir(analysisDir, { recursive: true });
  const jsonPath = join(analysisDir, "analysis.json");
  await writeFile(jsonPath, JSON.stringify(analysis, null, 2), "utf-8");

  // Update metadata status
  try {
    const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
    meta.status = "analyzed";
    await writeFile(metaPath, JSON.stringify(meta, null, 2), "utf-8");
  } catch {
    // Ignore
  }

  console.log(`\n✓ Analysis complete`);
  console.log(`  Markdown: ${docPath}`);
  console.log(`  JSON: ${jsonPath}`);
  console.log(
    `\nOverall Score: ${"★".repeat(analysis.altoScore.overall)}${"☆".repeat(10 - analysis.altoScore.overall)} (${analysis.altoScore.overall}/10)`,
  );
}

main().catch((err) => {
  console.error("Analysis failed:", err);
  process.exit(1);
});
