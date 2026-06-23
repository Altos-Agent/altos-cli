// @altos/tools/search - Grep and find_files tools

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import type { ToolDefinition, ToolContext, ToolResult, ToolPermission } from "../index.js";
import { validatePath, maskSecrets } from "../security.js";

// ============================================================================
// Tool: grep
// ============================================================================

const GREP_SCHEMA = {
  type: "object" as const,
  properties: {
    pattern: {
      type: "string" as const,
      description: "Regular expression or literal string to search for",
    },
    path: {
      type: "string" as const,
      description: "Directory or file path to search in",
    },
    recursive: {
      type: "boolean" as const,
      description: "Search recursively through directories",
      default: true,
    },
    case_sensitive: {
      type: "boolean" as const,
      description: "Case sensitive matching",
      default: false,
    },
    whole_word: {
      type: "boolean" as const,
      description: "Match whole words only",
      default: false,
    },
    regex: {
      type: "boolean" as const,
      description: "Treat pattern as regular expression",
      default: true,
    },
    file_pattern: {
      type: "string" as const,
      description: "Only search in files matching this glob pattern (e.g., *.ts)",
    },
    max_results: {
      type: "number" as const,
      description: "Maximum number of results to return",
      minimum: 1,
      maximum: 10000,
      default: 1000,
    },
    include_hidden: {
      type: "boolean" as const,
      description: "Include hidden files and directories",
      default: false,
    },
    follow_gitignore: {
      type: "boolean" as const,
      description: "Respect .gitignore files",
      default: true,
    },
  },
  required: ["pattern", "path"],
  additionalProperties: false,
  description: "Search file contents using grep patterns",
};

const GREP_OUTPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    matches: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          file: { type: "string" as const },
          line: { type: "number" as const },
          column: { type: "number" as const },
          content: { type: "string" as const },
          match: { type: "string" as const },
        },
        required: ["file", "line", "content", "match"],
      },
    },
    total: { type: "number" as const, description: "Total matches found" },
    filesSearched: { type: "number" as const, description: "Number of files searched" },
    truncated: { type: "boolean" as const },
  },
  required: ["matches", "total", "filesSearched"],
  additionalProperties: false,
};

const GREP_PERMISSIONS: ToolPermission[] = [
  { type: "read", path: "**", reason: "Search file contents" },
];

export function createGrepTool(workspaceRoots: string[]): ToolDefinition {
  return {
    name: "grep",
    description:
      "Search file contents with regex or literal pattern matching. Respects .gitignore by default.",
    inputSchema: GREP_SCHEMA,
    outputSchema: GREP_OUTPUT_SCHEMA,
    riskLevel: "low",
    requiredPermissions: GREP_PERMISSIONS,
    async execute(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      const startTime = Date.now();
      const pattern = params.pattern as string;
      let searchPath = params.path as string;
      const recursive = (params.recursive as boolean) ?? true;
      const caseSensitive = (params.case_sensitive as boolean) ?? false;
      const wholeWord = (params.whole_word as boolean) ?? false;
      const useRegex = (params.regex as boolean) ?? true;
      const filePattern = params.file_pattern as string | undefined;
      const maxResults = (params.max_results as number) ?? 1000;
      const includeHidden = (params.include_hidden as boolean) ?? false;
      const followGitignore = (params.follow_gitignore as boolean) ?? true;

      // Resolve relative paths using context cwd
      if (!path.isAbsolute(searchPath) && context.cwd) {
        searchPath = path.resolve(context.cwd, searchPath);
      }

      const validation = validatePath(searchPath, workspaceRoots, "read");
      if (!validation.valid) {
        return { success: false, error: validation.error, duration: Date.now() - startTime };
      }

      try {
        const resolvedPath = validation.normalizedPath!;

        let searchPattern: RegExp;
        if (useRegex) {
          let pat = wholeWord ? `\\b${pattern}\\b` : pattern;
          searchPattern = new RegExp(pat, caseSensitive ? "g" : "gi");
        } else {
          let pat = escapeRegExp(wholeWord ? `\\b${pattern}\\b` : pattern);
          searchPattern = new RegExp(pat, caseSensitive ? "g" : "gi");
        }

        const matches: Array<{
          file: string;
          line: number;
          column: number;
          content: string;
          match: string;
        }> = [];
        let filesSearched = 0;
        const gitignoreSet = new Set<string>();

        if (followGitignore) {
          try {
            const gitignoreContent = await fs.promises.readFile(
              path.join(resolvedPath, ".gitignore"),
              "utf8",
            );
            gitignoreContent.split("\n").forEach((line) => {
              const trimmed = line.trim();
              if (trimmed && !trimmed.startsWith("#")) gitignoreSet.add(trimmed);
            });
          } catch {
            /* no .gitignore */
          }
        }

        async function searchFile(filePath: string): Promise<void> {
          if (matches.length >= maxResults) return;
          const stats = await fs.promises.stat(filePath);
          if (!stats.isFile()) return;

          const fileStream = fs.createReadStream(filePath, { encoding: "utf8" });
          const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
          let lineNum = 0;

          for await (const line of rl) {
            lineNum++;
            const maskedLine = maskSecrets(line);
            const regexMatches = maskedLine.match(searchPattern);
            if (regexMatches) {
              for (const match of regexMatches) {
                if (matches.length >= maxResults) break;
                const colIndex = maskedLine.indexOf(match);
                matches.push({
                  file: path.relative(resolvedPath, filePath),
                  line: lineNum,
                  column: colIndex >= 0 ? colIndex + 1 : 1,
                  content: maskedLine,
                  match,
                });
              }
            }
          }
          filesSearched++;
        }

        async function walkDirectory(dirPath: string): Promise<void> {
          if (matches.length >= maxResults) return;
          const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

          for (const entry of entries) {
            if (matches.length >= maxResults) break;
            if (!includeHidden && entry.name.startsWith(".")) continue;

            const fullPath = path.join(dirPath, entry.name);

            if (entry.isDirectory()) {
              if (recursive) await walkDirectory(fullPath);
            } else if (entry.isFile()) {
              if (filePattern && !matchGlob(entry.name, filePattern)) continue;
              await searchFile(fullPath);
            }
          }
        }

        await walkDirectory(resolvedPath);
        const truncated = matches.length >= maxResults;

        return {
          success: true,
          data: {
            matches: matches.slice(0, maxResults),
            total: matches.length,
            filesSearched,
            truncated,
          },
          duration: Date.now() - startTime,
          truncated,
          summary: `Found ${matches.length} matches in ${filesSearched} file(s)`,
        };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return { success: false, error: `Grep failed: ${error}`, duration: Date.now() - startTime };
      }
    },
  };
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchGlob(fileName: string, pattern: string): boolean {
  const regex = pattern.replace(/\./g, "\\.").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${regex}$`).test(fileName);
}

// ============================================================================
// Tool: find_files
// ============================================================================

const FIND_FILES_SCHEMA = {
  type: "object" as const,
  properties: {
    path: {
      type: "string" as const,
      description: "Root path to search from",
    },
    pattern: {
      type: "string" as const,
      description: "Glob pattern to match (e.g., *.ts, **/*.js)",
    },
    name: {
      type: "string" as const,
      description: "Match files by name (supports * and ? wildcards)",
    },
    type: {
      type: "string" as const,
      description: "File type: 'f' for files, 'd' for directories, 'l' for symlinks",
      enum: ["f", "d", "l"],
    },
    max_results: {
      type: "number" as const,
      description: "Maximum number of results",
      minimum: 1,
      maximum: 10000,
      default: 1000,
    },
    recursive: {
      type: "boolean" as const,
      description: "Search recursively",
      default: true,
    },
    include_hidden: {
      type: "boolean" as const,
      description: "Include hidden files",
      default: false,
    },
    follow_symlinks: {
      type: "boolean" as const,
      description: "Follow symbolic links",
      default: false,
    },
  },
  required: ["path"],
  additionalProperties: false,
  description: "Find files matching patterns, name, or type",
};

const FIND_FILES_OUTPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    files: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          path: { type: "string" as const },
          name: { type: "string" as const },
          size: { type: "number" as const },
          modified: { type: "number" as const },
          type: { type: "string" as const, enum: ["file", "directory", "symlink"] },
        },
        required: ["path", "name", "type"],
      },
    },
    total: { type: "number" as const },
    truncated: { type: "boolean" as const },
  },
  required: ["files", "total"],
  additionalProperties: false,
};

const FIND_FILES_PERMISSIONS: ToolPermission[] = [
  { type: "read", path: "**", reason: "Search for files" },
];

export function createFindFilesTool(workspaceRoots: string[]): ToolDefinition {
  return {
    name: "find_files",
    description: "Find files by glob pattern, name, or type. Can search recursively.",
    inputSchema: FIND_FILES_SCHEMA,
    outputSchema: FIND_FILES_OUTPUT_SCHEMA,
    riskLevel: "low",
    requiredPermissions: FIND_FILES_PERMISSIONS,
    async execute(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      const startTime = Date.now();
      let searchPath = params.path as string;
      const pattern = params.pattern as string | undefined;
      const name = params.name as string | undefined;
      const type = params.type as "f" | "d" | "l" | undefined;
      const maxResults = (params.max_results as number) ?? 1000;
      const recursive = (params.recursive as boolean) ?? true;
      const includeHidden = (params.include_hidden as boolean) ?? false;
      const followSymlinks = (params.follow_symlinks as boolean) ?? false;

      // Resolve relative paths using context cwd
      if (!path.isAbsolute(searchPath) && context.cwd) {
        searchPath = path.resolve(context.cwd, searchPath);
      }

      const validation = validatePath(searchPath, workspaceRoots, "read");
      if (!validation.valid) {
        return { success: false, error: validation.error, duration: Date.now() - startTime };
      }

      try {
        const resolvedPath = validation.normalizedPath!;

        let nameMatcher: RegExp | null = null;
        if (name) {
          const regexPattern = name
            .replace(/\./g, "\\.")
            .replace(/\*/g, ".*")
            .replace(/\?/g, "[^/]");
          nameMatcher = new RegExp(`^${regexPattern}$`);
        }

        let globPattern: RegExp | null = null;
        if (pattern) {
          const regexPattern = pattern
            .replace(/\./g, "\\.")
            .replace(/\*\*/g, ".*")
            .replace(/\*/g, "[^/]*")
            .replace(/\?/g, "[^/]");
          globPattern = new RegExp(`^${regexPattern}$`);
        }

        const results: Array<{
          path: string;
          name: string;
          size: number;
          modified: number;
          type: "file" | "directory" | "symlink";
        }> = [];

        async function walkDirectory(dirPath: string): Promise<void> {
          if (results.length >= maxResults) return;
          const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

          for (const entry of entries) {
            if (results.length >= maxResults) break;
            if (!includeHidden && entry.name.startsWith(".")) continue;

            const fullPath = path.join(dirPath, entry.name);
            let isSymlink = false;
            try {
              const stats = await fs.promises.lstat(fullPath);
              isSymlink = stats.isSymbolicLink();
              if (!followSymlinks && isSymlink) continue;
            } catch {
              continue;
            }

            let entryType: "file" | "directory" | "symlink" = "file";
            if (isSymlink) entryType = "symlink";
            else if (entry.isDirectory()) entryType = "directory";

            // Apply name/glob pattern filters only to files, not directories
            // (we want to recurse into directories regardless of name match)
            const matchesPattern = (!nameMatcher || nameMatcher.test(entry.name)) &&
                                   (!globPattern || globPattern.test(entry.name));
            const matchesType = !type || entryType[0] === type;

            // Only add to results if it matches all criteria
            if (matchesPattern && matchesType) {
              try {
                const stats = await fs.promises.stat(fullPath);
                results.push({
                  path: path.relative(resolvedPath, fullPath),
                  name: entry.name,
                  size: stats.size,
                  modified: stats.mtimeMs,
                  type: entryType,
                });
              } catch {
                /* skip */
              }
            }

            // Always recurse into directories (that aren't filtered out by hidden)
            // regardless of whether they matched the pattern
            if (entry.isDirectory() && recursive) await walkDirectory(fullPath);
          }
        }

        await walkDirectory(resolvedPath);
        const truncated = results.length >= maxResults;

        return {
          success: true,
          data: { files: results.slice(0, maxResults), total: results.length, truncated },
          duration: Date.now() - startTime,
          truncated,
          summary: `Found ${results.length} file(s)${truncated ? " (truncated)" : ""}`,
        };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return { success: false, error: `Find failed: ${error}`, duration: Date.now() - startTime };
      }
    },
  };
}

// ============================================================================
// All Search Tools Factory
// ============================================================================

export function createAllSearchTools(workspaceRoots: string[]): ToolDefinition[] {
  return [createGrepTool(workspaceRoots), createFindFilesTool(workspaceRoots)];
}
