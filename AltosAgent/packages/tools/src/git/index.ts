// @altos/tools/git - Git tools

import { execFile } from "child_process";
import * as path from "path";
import type { ToolDefinition, ToolContext, ToolResult, ToolPermission } from "../index.js";
import { maskSecrets } from "../security.js";

function validateGitPath(
  workspaceRoots: string[],
  gitPath?: string,
): { valid: boolean; error?: string; path?: string } {
  if (gitPath) {
    const normalized = path.resolve(gitPath);
    for (const root of workspaceRoots) {
      const normalizedRoot = path.resolve(root);
      if (normalized.startsWith(normalizedRoot)) {
        return { valid: true, path: normalized };
      }
    }
    return { valid: false, error: "Git operations must be within workspace" };
  }
  return { valid: true };
}

function runGit(
  args: string[],
  cwd: string,
  maxDurationMs: number = 30000,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ stdout: "", stderr: "Git command timed out", exitCode: 124 });
    }, maxDurationMs);

    execFile("git", args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      clearTimeout(timeout);
      resolve({ stdout: stdout || "", stderr: stderr || "", exitCode: (err as any)?.code ?? 0 });
    });
  });
}

// ============================================================================
// Tool: git_status
// ============================================================================

const GIT_STATUS_SCHEMA = {
  type: "object" as const,
  properties: {
    path: {
      type: "string" as const,
      description: "Path to the git repository (defaults to current workspace)",
    },
    short: {
      type: "boolean" as const,
      description: "Use short format",
      default: false,
    },
    porcelain: {
      type: "boolean" as const,
      description: "Use porcelain output format",
      default: false,
    },
  },
  required: [],
  additionalProperties: false,
  description: "Show the working tree status of a git repository",
};

const GIT_STATUS_OUTPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    branch: { type: "string" as const, description: "Current branch name" },
    isClean: { type: "boolean" as const, description: "Whether the working tree is clean" },
    staged: {
      type: "array" as const,
      items: { type: "string" as const },
      description: "Staged files",
    },
    modified: {
      type: "array" as const,
      items: { type: "string" as const },
      description: "Modified files",
    },
    untracked: {
      type: "array" as const,
      items: { type: "string" as const },
      description: "Untracked files",
    },
    conflicted: {
      type: "array" as const,
      items: { type: "string" as const },
      description: "Conflicted files",
    },
    ahead: { type: "number" as const, description: "Commits ahead of remote" },
    behind: { type: "number" as const, description: "Commits behind remote" },
  },
  required: ["branch", "isClean"],
  additionalProperties: false,
};

const GIT_STATUS_PERMISSIONS: ToolPermission[] = [
  { type: "read", path: "**", reason: "Read git repository status" },
];

export function createGitStatusTool(workspaceRoots: string[]): ToolDefinition {
  return {
    name: "git_status",
    description: "Show the working tree status. Shows staged, modified, and untracked files.",
    inputSchema: GIT_STATUS_SCHEMA,
    outputSchema: GIT_STATUS_OUTPUT_SCHEMA,
    riskLevel: "low",
    requiredPermissions: GIT_STATUS_PERMISSIONS,
    async execute(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      const startTime = Date.now();
      const gitPath = (params.path as string) ?? context.workspaceRoot ?? context.cwd;

      const validation = validateGitPath(workspaceRoots, gitPath);
      if (!validation.valid) {
        return { success: false, error: validation.error, duration: Date.now() - startTime };
      }

      try {
        const { stdout, stderr, exitCode } = await runGit(
          ["status", "--porcelain=v1"],
          validation.path ?? gitPath,
        );

        if (exitCode !== 0) {
          return {
            success: false,
            error: `Git status failed: ${stderr || "unknown error"}`,
            duration: Date.now() - startTime,
          };
        }

        const staged: string[] = [];
        const modified: string[] = [];
        const untracked: string[] = [];
        const conflicted: string[] = [];

        const lines = stdout.split("\n").filter(Boolean);
        let branch = "";
        let isClean = true;

        for (const line of lines) {
          if (line.startsWith("##")) {
            branch = line.replace(/^##\s*/, "").split(/\s/)[0];
            isClean = lines.length <= 1;
          } else if (line.length >= 3) {
            const indexStatus = line[0];
            const workTreeStatus = line[1];
            const file = line.substring(3);

            if (indexStatus === "?" && workTreeStatus === "?") {
              untracked.push(file);
              isClean = false;
            } else if (indexStatus === "U" || workTreeStatus === "U") {
              conflicted.push(file);
              isClean = false;
            } else if (indexStatus !== " " && indexStatus !== "?") {
              staged.push(file);
              isClean = false;
            }
            if (workTreeStatus !== " " && workTreeStatus !== "?" && indexStatus === " ") {
              modified.push(file);
              isClean = false;
            }
          }
        }

        return {
          success: true,
          data: { branch, isClean, staged, modified, untracked, conflicted, ahead: 0, behind: 0 },
          duration: Date.now() - startTime,
          summary: isClean
            ? "Clean working tree on " + branch
            : branch +
              ": " +
              staged.length +
              " staged, " +
              modified.length +
              " modified, " +
              untracked.length +
              " untracked",
        };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: "Git status failed: " + error,
          duration: Date.now() - startTime,
        };
      }
    },
  };
}

// ============================================================================
// Tool: git_diff
// ============================================================================

const GIT_DIFF_SCHEMA = {
  type: "object" as const,
  properties: {
    path: {
      type: "string" as const,
      description: "Path to the git repository",
    },
    target: {
      type: "string" as const,
      description: "Revision, branch, or commit to diff against (default: HEAD)",
      default: "HEAD",
    },
    file: {
      type: "string" as const,
      description: "Limit diff to specific file or directory",
    },
    staged: {
      type: "boolean" as const,
      description: "Diff against the staging area",
      default: false,
    },
    stat: {
      type: "boolean" as const,
      description: "Show diffstat instead of full diff",
      default: false,
    },
    unified: {
      type: "number" as const,
      description: "Number of context lines",
      minimum: 0,
      maximum: 20,
      default: 3,
    },
  },
  required: [],
  additionalProperties: false,
  description: "Show changes between commits, the staging area, and working tree.",
};

const GIT_DIFF_OUTPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    diff: { type: "string" as const, description: "Diff output" },
    stats: {
      type: "object" as const,
      properties: {
        filesChanged: { type: "number" as const },
        insertions: { type: "number" as const },
        deletions: { type: "number" as const },
      },
    },
    target: { type: "string" as const },
  },
  required: ["target"],
  additionalProperties: false,
};

const GIT_DIFF_PERMISSIONS: ToolPermission[] = [
  { type: "read", path: "**", reason: "Read git repository diff" },
];

export function createGitDiffTool(workspaceRoots: string[]): ToolDefinition {
  return {
    name: "git_diff",
    description:
      "Show changes between commits, the staging area, and working tree. Use staged=true to diff staged changes.",
    inputSchema: GIT_DIFF_SCHEMA,
    outputSchema: GIT_DIFF_OUTPUT_SCHEMA,
    riskLevel: "low",
    requiredPermissions: GIT_DIFF_PERMISSIONS,
    async execute(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      const startTime = Date.now();
      const gitPath = (params.path as string) ?? context.workspaceRoot ?? context.cwd;
      const target = (params.target as string) ?? "HEAD";
      const file = params.file as string | undefined;
      const staged = (params.staged as boolean) ?? false;
      const stat = (params.stat as boolean) ?? false;
      const unified = (params.unified as number) ?? 3;

      const validation = validateGitPath(workspaceRoots, gitPath);
      if (!validation.valid) {
        return { success: false, error: validation.error, duration: Date.now() - startTime };
      }

      try {
        const args = ["diff", "--unified=" + unified];
        if (stat) args.push("--stat");
        if (staged) args.push("--cached");
        if (target) args.push(target);
        if (file) args.push("--", file);

        const { stdout, stderr, exitCode } = await runGit(args, validation.path ?? gitPath);

        if (exitCode !== 0 && !stdout) {
          return {
            success: false,
            error: "Git diff failed: " + (stderr || "unknown error"),
            duration: Date.now() - startTime,
          };
        }

        const maskedDiff = maskSecrets(stdout);
        const statLine = stdout.split("\n").slice(-1)[0];

        return {
          success: true,
          data: { diff: maskedDiff, stats: null, target },
          duration: Date.now() - startTime,
          summary: stat
            ? "Diff stat: " + (statLine || "no changes")
            : "Diff " +
              target +
              (file ? " (" + file + ")" : "") +
              ": " +
              stdout.split("\n").length +
              " lines",
        };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: "Git diff failed: " + error,
          duration: Date.now() - startTime,
        };
      }
    },
  };
}

// ============================================================================
// Tool: git_log
// ============================================================================

const GIT_LOG_SCHEMA = {
  type: "object" as const,
  properties: {
    path: {
      type: "string" as const,
      description: "Path to the git repository",
    },
    count: {
      type: "number" as const,
      description: "Number of commits to show",
      minimum: 1,
      maximum: 100,
      default: 10,
    },
    format: {
      type: "string" as const,
      description: "Log format string",
      default: "%h %s (%an, %ar)",
    },
    branch: {
      type: "string" as const,
      description: "Show commits reachable from this branch only",
    },
    author: {
      type: "string" as const,
      description: "Filter by author",
    },
    since: {
      type: "string" as const,
      description: "Show commits since date (e.g., 1 week ago)",
    },
    file: {
      type: "string" as const,
      description: "Show commits that affect this file",
    },
  },
  required: [],
  additionalProperties: false,
  description: "Show commit logs with optional filtering",
};

const GIT_LOG_OUTPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    commits: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          hash: { type: "string" as const },
          message: { type: "string" as const },
          author: { type: "string" as const },
          date: { type: "string" as const },
          branch: { type: "string" as const },
        },
        required: ["hash", "message"],
      },
    },
    total: { type: "number" as const, description: "Total commits in the filtered range" },
  },
  required: ["commits", "total"],
  additionalProperties: false,
};

const GIT_LOG_PERMISSIONS: ToolPermission[] = [
  { type: "read", path: "**", reason: "Read git repository log" },
];

export function createGitLogTool(workspaceRoots: string[]): ToolDefinition {
  return {
    name: "git_log",
    description: "Show commit history with filtering by author, date, branch, or file.",
    inputSchema: GIT_LOG_SCHEMA,
    outputSchema: GIT_LOG_OUTPUT_SCHEMA,
    riskLevel: "low",
    requiredPermissions: GIT_LOG_PERMISSIONS,
    async execute(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      const startTime = Date.now();
      const gitPath = (params.path as string) ?? context.workspaceRoot ?? context.cwd;
      const count = (params.count as number) ?? 10;
      const format = (params.format as string) ?? "%h %s (%an, %ar)";
      const branch = params.branch as string | undefined;
      const author = params.author as string | undefined;
      const since = params.since as string | undefined;
      const file = params.file as string | undefined;

      const validation = validateGitPath(workspaceRoots, gitPath);
      if (!validation.valid) {
        return { success: false, error: validation.error, duration: Date.now() - startTime };
      }

      try {
        const args = ["log", "--max-count=" + count, "--format=" + format];
        if (branch) args.push(branch);
        if (author) args.push("--author=" + author);
        if (since) args.push("--since=" + since);
        if (file) args.push("--", file);

        const { stdout, stderr, exitCode } = await runGit(args, validation.path ?? gitPath);

        if (exitCode !== 0) {
          return {
            success: false,
            error: "Git log failed: " + (stderr || "unknown error"),
            duration: Date.now() - startTime,
          };
        }

        const lines = stdout.split("\n").filter(Boolean);
        const commits = lines.map((line) => {
          const match = line.match(/^([a-f0-9]+)\s+(.+?)\s+\((.+?),\s+(.+)\)$/);
          if (match) {
            return {
              hash: match[1],
              message: match[2],
              author: match[3],
              date: match[4],
              branch: branch ?? "HEAD",
            };
          }
          return {
            hash: line.substring(0, 7),
            message: line,
            author: "unknown",
            date: "unknown",
            branch: branch ?? "HEAD",
          };
        });

        const branchText = branch ? " on " + branch : "";
        return {
          success: true,
          data: { commits, total: commits.length },
          duration: Date.now() - startTime,
          summary: "Found " + commits.length + " commit(s)" + branchText,
        };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: "Git log failed: " + error,
          duration: Date.now() - startTime,
        };
      }
    },
  };
}

// ============================================================================
// All Git Tools Factory
// ============================================================================

export function createAllGitTools(workspaceRoots: string[]): ToolDefinition[] {
  return [
    createGitStatusTool(workspaceRoots),
    createGitDiffTool(workspaceRoots),
    createGitLogTool(workspaceRoots),
  ];
}
