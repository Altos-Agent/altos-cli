// @altos/tools/fs - File system tools

import * as fs from "fs";
import * as path from "path";
import type { ToolDefinition, ToolContext, ToolResult, ToolPermission } from "../index.js";
import { validatePath, maskSecrets, truncateOutput } from "../security.js";

// ============================================================================
// Tool: read_file
// ============================================================================

const READ_FILE_SCHEMA = {
  type: "object" as const,
  properties: {
    path: {
      type: "string" as const,
      description: "Absolute or relative path to the file",
    },
    offset: {
      type: "number" as const,
      description: "Byte offset to start reading from",
      minimum: 0,
      default: 0,
    },
    limit: {
      type: "number" as const,
      description: "Maximum number of bytes to read",
      minimum: 1,
      maximum: 10485760,
      default: 1048576,
    },
  },
  required: ["path"],
  additionalProperties: false,
  description: "Read the contents of a file",
};

const READ_FILE_OUTPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    content: { type: "string" as const, description: "File contents" },
    size: { type: "number" as const, description: "File size in bytes" },
    truncated: { type: "boolean" as const, description: "Whether output was truncated" },
    path: { type: "string" as const, description: "Canonical path to the file" },
  },
  required: ["content", "size", "truncated", "path"],
  additionalProperties: false,
};

const READ_FILE_PERMISSIONS: ToolPermission[] = [
  { type: "read", path: "**", reason: "Read file contents" },
];

export function createReadFileTool(workspaceRoots: string[]): ToolDefinition {
  return {
    name: "read_file",
    description:
      "Read the complete contents of a file. Supports partial reads with offset and limit. Use list_dir first to explore directory structure.",
    inputSchema: READ_FILE_SCHEMA,
    outputSchema: READ_FILE_OUTPUT_SCHEMA,
    riskLevel: "low",
    requiredPermissions: READ_FILE_PERMISSIONS,
    async execute(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      const startTime = Date.now();
      let filePath = params.path as string;

      // Resolve relative paths using context cwd
      if (!path.isAbsolute(filePath) && context.cwd) {
        filePath = path.resolve(context.cwd, filePath);
      }

      const validation = validatePath(filePath, workspaceRoots, "read");
      if (!validation.valid) {
        return { success: false, error: validation.error, duration: Date.now() - startTime };
      }

      try {
        const resolvedPath = validation.normalizedPath!;
        const stats = await fs.promises.stat(resolvedPath);

        if (!stats.isFile()) {
          return {
            success: false,
            error: `Path is not a file: ${filePath}`,
            duration: Date.now() - startTime,
          };
        }

        const offset = (params.offset as number) ?? 0;
        const limit = (params.limit as number) ?? 1048576;

        const buffer = Buffer.alloc(Math.min(limit, 10485760));
        const fd = await fs.promises.open(resolvedPath, "r");

        try {
          const { bytesRead } = await fd.read(buffer, 0, buffer.length, offset);
          let content = buffer.slice(0, bytesRead).toString("utf8");
          content = maskSecrets(content);

          const truncation = truncateOutput(content);
          const truncated = truncation.wasTruncated;

          return {
            success: true,
            data: {
              content: truncation.truncated,
              size: stats.size,
              truncated,
              path: resolvedPath,
            },
            duration: Date.now() - startTime,
            truncated,
            summary: truncated
              ? `Read ${offset + bytesRead}/${stats.size} bytes (truncated)`
              : `Read ${bytesRead} bytes from ${path.basename(resolvedPath)}`,
          };
        } finally {
          await fd.close();
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: `Failed to read file: ${error}`,
          duration: Date.now() - startTime,
        };
      }
    },
  };
}

// ============================================================================
// Tool: write_file
// ============================================================================

const WRITE_FILE_SCHEMA = {
  type: "object" as const,
  properties: {
    path: {
      type: "string" as const,
      description: "Absolute or relative path to the file to write",
    },
    content: {
      type: "string" as const,
      description: "Content to write to the file",
    },
    append: {
      type: "boolean" as const,
      description: "Append to existing file instead of overwriting",
      default: false,
    },
    create_dirs: {
      type: "boolean" as const,
      description: "Create parent directories if they don't exist",
      default: false,
    },
  },
  required: ["path", "content"],
  additionalProperties: false,
  description: "Write content to a file, creating it if it doesn't exist",
};

const WRITE_FILE_OUTPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    path: { type: "string" as const, description: "Canonical path to the written file" },
    bytesWritten: { type: "number" as const, description: "Number of bytes written" },
    created: { type: "boolean" as const, description: "Whether the file was newly created" },
  },
  required: ["path", "bytesWritten", "created"],
  additionalProperties: false,
};

const WRITE_FILE_PERMISSIONS: ToolPermission[] = [
  { type: "write", path: "**", reason: "Write or create files" },
];

export function createWriteFileTool(workspaceRoots: string[]): ToolDefinition {
  return {
    name: "write_file",
    description:
      "Write content to a file. Will overwrite by default unless append=true. Can create parent directories.",
    inputSchema: WRITE_FILE_SCHEMA,
    outputSchema: WRITE_FILE_OUTPUT_SCHEMA,
    riskLevel: "high",
    requiredPermissions: WRITE_FILE_PERMISSIONS,
    async execute(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      const startTime = Date.now();
      let filePath = params.path as string;
      const content = params.content as string;

      // Resolve relative paths using context cwd
      if (!path.isAbsolute(filePath) && context.cwd) {
        filePath = path.resolve(context.cwd, filePath);
      }

      const validation = validatePath(filePath, workspaceRoots, "write");
      if (!validation.valid) {
        return { success: false, error: validation.error, duration: Date.now() - startTime };
      }

      try {
        const resolvedPath = validation.normalizedPath!;
        const append = (params.append as boolean) ?? false;
        const createDirs = (params.create_dirs as boolean) ?? false;

        let existed = false;
        try {
          await fs.promises.access(resolvedPath);
          existed = true;
        } catch {
          existed = false;
        }

        if (createDirs) {
          const parentDir = path.dirname(resolvedPath);
          await fs.promises.mkdir(parentDir, { recursive: true });
        }

        const flag = append ? "a" : "w";
        await fs.promises.writeFile(resolvedPath, content, { flag });
        const stats = await fs.promises.stat(resolvedPath);

        return {
          success: true,
          data: { path: resolvedPath, bytesWritten: stats.size, created: !existed },
          duration: Date.now() - startTime,
          summary: `${existed ? "Updated" : "Created"} ${path.basename(resolvedPath)} (${stats.size} bytes)`,
        };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: `Failed to write file: ${error}`,
          duration: Date.now() - startTime,
        };
      }
    },
  };
}

// ============================================================================
// Tool: edit_file
// ============================================================================

const EDIT_FILE_SCHEMA = {
  type: "object" as const,
  properties: {
    path: {
      type: "string" as const,
      description: "Path to the file to edit",
    },
    find: {
      type: "string" as const,
      description: "String to find and replace",
    },
    replace: {
      type: "string" as const,
      description: "Replacement string",
    },
    regex: {
      type: "boolean" as const,
      description: "Treat find as a regular expression",
      default: false,
    },
    all: {
      type: "boolean" as const,
      description: "Replace all occurrences (only with regex=false)",
      default: false,
    },
  },
  required: ["path", "find", "replace"],
  additionalProperties: false,
  description: "Edit a file by finding and replacing text. For regex use, use the regex option.",
};

const EDIT_FILE_OUTPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    path: { type: "string" as const },
    replacements: { type: "number" as const, description: "Number of replacements made" },
    newSize: { type: "number" as const, description: "New file size in bytes" },
  },
  required: ["path", "replacements", "newSize"],
  additionalProperties: false,
};

const EDIT_FILE_PERMISSIONS: ToolPermission[] = [
  { type: "read", path: "**" },
  { type: "write", path: "**" },
];

export function createEditFileTool(workspaceRoots: string[]): ToolDefinition {
  return {
    name: "edit_file",
    description:
      "Edit a file by finding and replacing text. Set regex=true for regex patterns. Use all=true to replace all occurrences.",
    inputSchema: EDIT_FILE_SCHEMA,
    outputSchema: EDIT_FILE_OUTPUT_SCHEMA,
    riskLevel: "high",
    requiredPermissions: EDIT_FILE_PERMISSIONS,
    async execute(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      const startTime = Date.now();
      let filePath = params.path as string;
      const find = params.find as string;
      const replace = params.replace as string;
      const useRegex = (params.regex as boolean) ?? false;
      const replaceAll = (params.all as boolean) ?? false;

      // Resolve relative paths using context cwd
      if (!path.isAbsolute(filePath) && context.cwd) {
        filePath = path.resolve(context.cwd, filePath);
      }

      const validation = validatePath(filePath, workspaceRoots, "write");
      if (!validation.valid) {
        return { success: false, error: validation.error, duration: Date.now() - startTime };
      }

      try {
        const resolvedPath = validation.normalizedPath!;
        let content = await fs.promises.readFile(resolvedPath, "utf8");

        let replacements = 0;
        let newContent: string;

        if (useRegex) {
          const flags = replaceAll ? "g" : "";
          const regex = new RegExp(find, flags);
          const matches = content.match(regex);
          replacements = matches ? matches.length : 0;
          newContent = content.replace(regex, replace);
        } else {
          if (replaceAll) {
            let idx = 0;
            while ((idx = content.indexOf(find, idx)) !== -1) {
              replacements++;
              idx += find.length;
            }
            newContent = content.split(find).join(replace);
          } else {
            const idx = content.indexOf(find);
            if (idx === -1) {
              return {
                success: false,
                error: `String not found in file`,
                duration: Date.now() - startTime,
              };
            }
            replacements = 1;
            newContent = content.substring(0, idx) + replace + content.substring(idx + find.length);
          }
        }

        newContent = maskSecrets(newContent);
        await fs.promises.writeFile(resolvedPath, newContent);
        const stats = await fs.promises.stat(resolvedPath);

        return {
          success: true,
          data: { path: resolvedPath, replacements, newSize: stats.size },
          duration: Date.now() - startTime,
          summary: `Made ${replacements} replacement${replacements !== 1 ? "s" : ""} in ${path.basename(resolvedPath)}`,
        };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: `Failed to edit file: ${error}`,
          duration: Date.now() - startTime,
        };
      }
    },
  };
}

// ============================================================================
// Tool: apply_patch
// ============================================================================

const APPLY_PATCH_SCHEMA = {
  type: "object" as const,
  properties: {
    path: {
      type: "string" as const,
      description: "Path to the file to patch",
    },
    patch: {
      type: "string" as const,
      description: "Unified diff patch to apply",
    },
  },
  required: ["path", "patch"],
  additionalProperties: false,
  description: "Apply a unified diff patch to a file",
};

const APPLY_PATCH_OUTPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    path: { type: "string" as const },
    hunksApplied: { type: "number" as const },
    hunksFailed: { type: "number" as const },
  },
  required: ["path", "hunksApplied", "hunksFailed"],
  additionalProperties: false,
};

const APPLY_PATCH_PERMISSIONS: ToolPermission[] = [
  { type: "read", path: "**" },
  { type: "write", path: "**" },
];

export function createApplyPatchTool(workspaceRoots: string[]): ToolDefinition {
  return {
    name: "apply_patch",
    description: "Apply a unified diff patch to a file.",
    inputSchema: APPLY_PATCH_SCHEMA,
    outputSchema: APPLY_PATCH_OUTPUT_SCHEMA,
    riskLevel: "high",
    requiredPermissions: APPLY_PATCH_PERMISSIONS,
    async execute(params: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
      const startTime = Date.now();
      const filePath = params.path as string;
      const patch = params.patch as string;

      const validation = validatePath(filePath, workspaceRoots, "write");
      if (!validation.valid) {
        return { success: false, error: validation.error, duration: Date.now() - startTime };
      }

      try {
        const resolvedPath = validation.normalizedPath!;
        let originalContent = "";
        try {
          originalContent = await fs.promises.readFile(resolvedPath, "utf8");
        } catch {
          // File may not exist
        }

        // Parse unified diff and apply hunks
        const lines = patch.split("\n");
        let hunksApplied = 0;
        let hunksFailed = 0;
        let inHunk = false;
        let hunkHeader = "";
        let hunkLines: string[] = [];
        let newContent = originalContent;

        for (const line of lines) {
          if (line.startsWith("@@")) {
            if (inHunk && hunkLines.length > 0) {
              try {
                newContent = applyHunk(newContent, hunkHeader, hunkLines);
                hunksApplied++;
              } catch {
                hunksFailed++;
              }
            }
            inHunk = true;
            hunkHeader = line;
            hunkLines = [];
          } else if (inHunk) {
            hunkLines.push(line);
          }
        }

        if (inHunk && hunkLines.length > 0) {
          try {
            newContent = applyHunk(newContent, hunkHeader, hunkLines);
            hunksApplied++;
          } catch {
            hunksFailed++;
          }
        }

        await fs.promises.writeFile(resolvedPath, newContent);

        return {
          success: hunksFailed === 0,
          data: { path: resolvedPath, hunksApplied, hunksFailed },
          duration: Date.now() - startTime,
          summary: `Applied ${hunksApplied} hunk(s)${hunksFailed > 0 ? `, ${hunksFailed} failed` : ""} to ${path.basename(resolvedPath)}`,
        };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: `Failed to apply patch: ${error}`,
          duration: Date.now() - startTime,
        };
      }
    },
  };
}

function applyHunk(original: string, header: string, hunkLines: string[]): string {
  const match = header.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
  if (!match) throw new Error("Invalid hunk header");

  const oldStart = parseInt(match[1], 10);
  const oldCount = parseInt(match[2] || "1", 10);

  const originalLines = original.split("\n");
  const oldEnd = oldStart + oldCount - 1;

  const resultLines = originalLines.slice(0, oldStart - 1);

  for (const line of hunkLines) {
    if (line.startsWith("+")) {
      resultLines.push(line.substring(1));
    } else if (!line.startsWith("-")) {
      resultLines.push(line || "");
    }
  }

  resultLines.push(...originalLines.slice(oldEnd));
  return resultLines.join("\n");
}

// ============================================================================
// Tool: list_dir
// ============================================================================

const LIST_DIR_SCHEMA = {
  type: "object" as const,
  properties: {
    path: {
      type: "string" as const,
      description: "Directory path to list",
    },
    recursive: {
      type: "boolean" as const,
      description: "List subdirectories recursively",
      default: false,
    },
    max_depth: {
      type: "number" as const,
      description: "Maximum depth for recursive listing",
      minimum: 1,
      maximum: 10,
      default: 3,
    },
    include_hidden: {
      type: "boolean" as const,
      description: "Include hidden files (starting with .)",
      default: false,
    },
  },
  required: ["path"],
  additionalProperties: false,
  description: "List the contents of a directory",
};

const LIST_DIR_OUTPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    entries: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          name: { type: "string" as const },
          type: { type: "string" as const, enum: ["file", "directory", "symlink", "other"] },
          size: { type: "number" as const },
          modified: { type: "number" as const },
        },
        required: ["name", "type"],
      },
    },
    path: { type: "string" as const },
    total: { type: "number" as const },
  },
  required: ["entries", "path", "total"],
  additionalProperties: false,
};

const LIST_DIR_PERMISSIONS: ToolPermission[] = [
  { type: "read", path: "**", reason: "List directory contents" },
];

export function createListDirTool(workspaceRoots: string[]): ToolDefinition {
  return {
    name: "list_dir",
    description:
      "List files and directories at a path. Shows file type, size, and modification time.",
    inputSchema: LIST_DIR_SCHEMA,
    outputSchema: LIST_DIR_OUTPUT_SCHEMA,
    riskLevel: "low",
    requiredPermissions: LIST_DIR_PERMISSIONS,
    async execute(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      const startTime = Date.now();
      let dirPath = params.path as string;
      const recursive = (params.recursive as boolean) ?? false;
      const maxDepth = (params.max_depth as number) ?? 3;
      const includeHidden = (params.include_hidden as boolean) ?? false;

      // Resolve relative paths using context cwd
      if (!path.isAbsolute(dirPath) && context.cwd) {
        dirPath = path.resolve(context.cwd, dirPath);
      }

      const validation = validatePath(dirPath, workspaceRoots, "read");
      if (!validation.valid) {
        return { success: false, error: validation.error, duration: Date.now() - startTime };
      }

      try {
        const resolvedPath = validation.normalizedPath!;

        const entries: Array<{
          name: string;
          type: "file" | "directory" | "symlink" | "other";
          size: number;
          modified: number;
        }> = [];

        async function walkDirectory(currentPath: string, depth: number): Promise<void> {
          if (depth > maxDepth) return;

          const dirents = await fs.promises.readdir(currentPath, { withFileTypes: true });

          for (const dirent of dirents) {
            if (!includeHidden && dirent.name.startsWith(".")) continue;

            const fullPath = path.join(currentPath, dirent.name);

            try {
              const stats = await fs.promises.lstat(fullPath);
              let type: "file" | "directory" | "symlink" | "other" = "other";

              if (stats.isDirectory()) type = "directory";
              else if (stats.isFile()) type = "file";
              else if (stats.isSymbolicLink()) type = "symlink";

              entries.push({
                name: path.relative(resolvedPath, fullPath) || ".",
                type,
                size: stats.size,
                modified: stats.mtimeMs,
              });

              if (recursive && dirent.isDirectory() && depth < maxDepth) {
                await walkDirectory(fullPath, depth + 1);
              }
            } catch {
              // Skip files we can't stat
            }
          }
        }

        await walkDirectory(resolvedPath, 0);

        return {
          success: true,
          data: { entries, path: resolvedPath, total: entries.length },
          duration: Date.now() - startTime,
          summary: `Listed ${entries.length} entries in ${path.basename(resolvedPath)}`,
        };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: `Failed to list directory: ${error}`,
          duration: Date.now() - startTime,
        };
      }
    },
  };
}

// ============================================================================
// All FS Tools Factory
// ============================================================================

export function createAllFSTools(workspaceRoots: string[]): ToolDefinition[] {
  return [
    createReadFileTool(workspaceRoots),
    createWriteFileTool(workspaceRoots),
    createEditFileTool(workspaceRoots),
    createApplyPatchTool(workspaceRoots),
    createListDirTool(workspaceRoots),
  ];
}
