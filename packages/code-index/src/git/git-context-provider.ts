import { exec } from "child_process";
import { promisify } from "util";
import type { ChangedFile, CommitInfo, GitContext } from "../types.js";

const execAsync = promisify(exec);

export class GitContextProvider {
  private async runGit(
    root: string,
    command: string,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: root,
        timeout: 30_000,
      });
      return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
    } catch (err: unknown) {
      const error = err as { code?: number; stderr?: string };
      return {
        stdout: "",
        stderr: error.stderr?.trim() ?? "",
        exitCode: error.code ?? 1,
      };
    }
  }

  async isRepo(root: string): Promise<boolean> {
    const result = await this.runGit(root, "git --no-pager rev-parse --git-dir");
    return result.exitCode === 0;
  }

  async getContext(root: string): Promise<GitContext> {
    const [
      branchResult,
      branchesResult,
      remoteResult,
      stagedResult,
      unstagedResult,
      untrackedResult,
      changedFilesResult,
      recentCommitsResult,
      lastModifiedResult,
    ] = await Promise.all([
      this.runGit(root, "git --no-pager rev-parse --abbrev-ref HEAD"),
      this.runGit(root, "git --no-pager branch -a --format=%(refname:short)"),
      this.runGit(root, "git --no-pager remote get-url origin").catch(() => ({
        stdout: "",
        stderr: "",
        exitCode: 1,
      })),
      this.runGit(root, "git --no-pager diff --cached --name-only"),
      this.runGit(root, "git --no-pager diff --name-only"),
      this.runGit(root, "git --no-pager ls-files --others --exclude-standard"),
      this.getChangedFiles(root),
      this.getRecentCommits(root),
      this.getLastModified(root),
    ]);

    const branch = branchResult.stdout || "(unknown)";
    const branches = branchesResult.stdout ? branchesResult.stdout.split("\n").filter(Boolean) : [];
    const remoteUrl = remoteResult.exitCode === 0 ? remoteResult.stdout : undefined;

    const stagedFiles = stagedResult.stdout ? stagedResult.stdout.split("\n").filter(Boolean) : [];
    const unstagedFiles = unstagedResult.stdout
      ? unstagedResult.stdout.split("\n").filter(Boolean)
      : [];
    const untrackedFiles = untrackedResult.stdout
      ? untrackedResult.stdout.split("\n").filter(Boolean)
      : [];

    const hasUncommittedChanges =
      stagedFiles.length > 0 || unstagedFiles.length > 0 || untrackedFiles.length > 0;

    return {
      root,
      branch,
      branches,
      remoteUrl,
      stagedFiles,
      unstagedFiles,
      untrackedFiles,
      changedFiles: changedFilesResult,
      recentCommits: recentCommitsResult,
      lastModified: lastModifiedResult,
      hasUncommittedChanges,
    };
  }

  async getChangedFiles(root: string, _since?: string): Promise<ChangedFile[]> {
    const result = await this.runGit(root, "git --no-pager diff --name-status");
    if (!result.stdout) return [];

    return result.stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^([ADMRC])\s+(.+)$/);
        if (!match) return null;
        const [, statusChar, path] = match;
        return {
          path,
          status: this.mapStatus(statusChar),
        } as ChangedFile;
      })
      .filter((f): f is ChangedFile => f !== null);
  }

  async getRecentCommits(root: string): Promise<CommitInfo[]> {
    const result = await this.runGit(root, "git --no-pager log --format=%H|%s|%an|%at|%ct -20");
    if (!result.stdout) return [];

    return result.stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const parts = line.split("|");
        if (parts.length < 5) return null;
        const [hash, message, author, authoredAt, _committedAt] = parts;
        return {
          hash,
          message,
          author,
          date: Number(authoredAt) * 1000,
          filesChanged: 0,
        } as CommitInfo;
      })
      .filter((c): c is CommitInfo => c !== null);
  }

  async getLastModified(root: string): Promise<Map<string, number>> {
    const result = await this.runGit(root, "git --no-pager log --format=%at %H -20 --name-only");
    const map = new Map<string, number>();

    if (!result.stdout) return map;

    const lines = result.stdout.split("\n");
    let i = 0;
    while (i < lines.length - 1) {
      const dateMatch = lines[i].match(/^(\d+)\s+([a-f0-9]+)$/);
      if (dateMatch && i + 1 < lines.length) {
        const date = Number(dateMatch[1]) * 1000;
        const file = lines[i + 1].trim();
        if (file && !map.has(file)) {
          map.set(file, date);
        }
        i += 2;
      } else {
        i += 1;
      }
    }

    return map;
  }

  private mapStatus(char: string): ChangedFile["status"] {
    switch (char) {
      case "A":
        return "added";
      case "M":
        return "modified";
      case "D":
        return "deleted";
      case "R":
        return "renamed";
      case "C":
        return "copied";
      case "U":
        return "unmerged";
      default:
        return "modified";
    }
  }
}
