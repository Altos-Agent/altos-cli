import fs from "fs";
import path from "path";
import micromatch from "micromatch";
import {
  DEFAULT_IGNORES,
  DEFAULT_LIMITS,
  type FileEntry,
  type LanguageHint,
  type ScanOptions,
  type ScanStats,
} from "../types.js";

export class WorkspaceScanner {
  private stats: ScanStats = {
    totalFiles: 0,
    totalDirs: 0,
    byLanguage: {},
    ignoredFiles: 0,
    scanTimeMs: 0,
  };

  private startTime: number = 0;

  async *scan(root: string, options?: ScanOptions): AsyncGenerator<FileEntry> {
    this.startTime = Date.now();
    this.resetStats();
    const ignores = [...DEFAULT_IGNORES, ...(options?.ignores ?? [])];
    const maxDepth = options?.maxDepth ?? DEFAULT_LIMITS.maxDepth;
    const maxFileSize = options?.maxFileSize ?? DEFAULT_LIMITS.maxFileSizeBytes;

    yield* this.scanDir(root, root, 0, maxDepth, maxFileSize, ignores);

    this.stats.scanTimeMs = Date.now() - this.startTime;
  }

  scanSync(root: string, options?: ScanOptions): FileEntry[] {
    this.startTime = Date.now();
    this.resetStats();
    const ignores = [...DEFAULT_IGNORES, ...(options?.ignores ?? [])];
    const maxDepth = options?.maxDepth ?? DEFAULT_LIMITS.maxDepth;
    const maxFileSize = options?.maxFileSize ?? DEFAULT_LIMITS.maxFileSizeBytes;

    const entries: FileEntry[] = [];
    this.scanDirSync(root, root, 0, maxDepth, maxFileSize, ignores, entries);

    this.stats.scanTimeMs = Date.now() - this.startTime;
    return entries;
  }

  getStats(): ScanStats {
    return { ...this.stats };
  }

  private resetStats(): void {
    this.stats = {
      totalFiles: 0,
      totalDirs: 0,
      byLanguage: {},
      ignoredFiles: 0,
      scanTimeMs: 0,
    };
  }

  private async *scanDir(
    dirPath: string,
    root: string,
    depth: number,
    maxDepth: number,
    maxFileSize: number,
    ignores: string[],
  ): AsyncGenerator<FileEntry> {
    if (depth > maxDepth) return;

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    } catch (err: unknown) {
      // Skip permission errors gracefully
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        this.stats.totalDirs++;

        if (this.shouldIgnore(fullPath, root, ignores)) {
          continue;
        }

        yield* this.scanDir(fullPath, root, depth + 1, maxDepth, maxFileSize, ignores);
      } else if (entry.isFile()) {
        if (this.shouldIgnore(fullPath, root, ignores)) {
          this.stats.ignoredFiles++;
          continue;
        }

        const fileEntry = await this.createFileEntry(fullPath, root, maxFileSize);
        if (fileEntry) {
          this.stats.totalFiles++;
          this.stats.byLanguage[fileEntry.language] =
            (this.stats.byLanguage[fileEntry.language] ?? 0) + 1;
          yield fileEntry;
        }
      }
    }
  }

  private scanDirSync(
    dirPath: string,
    root: string,
    depth: number,
    maxDepth: number,
    maxFileSize: number,
    ignores: string[],
    results: FileEntry[],
  ): void {
    if (depth > maxDepth) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch (err: unknown) {
      // Skip permission errors gracefully
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        this.stats.totalDirs++;

        if (this.shouldIgnore(fullPath, root, ignores)) {
          continue;
        }

        this.scanDirSync(fullPath, root, depth + 1, maxDepth, maxFileSize, ignores, results);
      } else if (entry.isFile()) {
        if (this.shouldIgnore(fullPath, root, ignores)) {
          this.stats.ignoredFiles++;
          continue;
        }

        const fileEntry = this.createFileEntrySync(fullPath, root, maxFileSize);
        if (fileEntry) {
          this.stats.totalFiles++;
          this.stats.byLanguage[fileEntry.language] =
            (this.stats.byLanguage[fileEntry.language] ?? 0) + 1;
          results.push(fileEntry);
        }
      }
    }
  }

  private shouldIgnore(filePath: string, root: string, ignores: string[]): boolean {
    const relativePath = path.relative(root, filePath);
    const name = path.basename(filePath);

    // Check if any ignore pattern matches
    for (const pattern of ignores) {
      // Handle directory patterns (ending with /) vs file patterns
      if (pattern.endsWith("/")) {
        const dirPattern = pattern.slice(0, -1);
        if (micromatch.isMatch(relativePath, dirPattern) || micromatch.isMatch(name, dirPattern)) {
          return true;
        }
      } else {
        if (micromatch.isMatch(relativePath, pattern) || micromatch.isMatch(name, pattern)) {
          return true;
        }
      }
    }
    return false;
  }

  private async createFileEntry(
    filePath: string,
    root: string,
    maxFileSize: number,
  ): Promise<FileEntry | null> {
    try {
      const stat = await fs.promises.stat(filePath);

      if (stat.size > maxFileSize) {
        this.stats.ignoredFiles++;
        return null;
      }

      return this.makeFileEntry(filePath, root, stat);
    } catch (err: unknown) {
      // Skip files we can't stat
      return null;
    }
  }

  private createFileEntrySync(
    filePath: string,
    root: string,
    maxFileSize: number,
  ): FileEntry | null {
    try {
      const stat = fs.statSync(filePath);

      if (stat.size > maxFileSize) {
        this.stats.ignoredFiles++;
        return null;
      }

      return this.makeFileEntry(filePath, root, stat);
    } catch (err: unknown) {
      // Skip files we can't stat
      return null;
    }
  }

  private makeFileEntry(filePath: string, root: string, stat: fs.Stats): FileEntry {
    const relativePath = path.relative(root, filePath);
    const ext = path.extname(filePath).toLowerCase();
    const name = path.basename(filePath);

    return {
      path: relativePath,
      absolutePath: filePath,
      size: stat.size,
      mtime: stat.mtimeMs,
      language: this.detectLanguage(ext),
      isTest: this.isTestFile(name),
      isConfig: this.isConfigFile(name, relativePath),
      isBuild: this.isBuildPath(relativePath),
    };
  }

  private detectLanguage(ext: string): LanguageHint {
    switch (ext) {
      case ".ts":
      case ".tsx":
        return "typescript";
      case ".js":
      case ".jsx":
      case ".mjs":
      case ".cjs":
        return "javascript";
      case ".json":
        return "json";
      case ".yaml":
      case ".yml":
        return "yaml";
      case ".md":
      case ".mdx":
        return "markdown";
      case ".css":
      case ".scss":
      case ".less":
        return "css";
      case ".html":
      case ".htm":
        return "html";
      default:
        return "unknown";
    }
  }

  private isTestFile(name: string): boolean {
    return /[._]test\.(ts|tsx|js|jsx)$/.test(name) || /[._]spec\.(ts|tsx|js|jsx)$/.test(name);
  }

  private isConfigFile(name: string, _relativePath: string): boolean {
    const configNames = [
      "package.json",
      "tsconfig",
      "vite.config",
      "next.config",
      "tailwind.config",
      ".eslintrc",
      ".prettierrc",
      "biome.json",
      "turbo.json",
      "rollup.config",
      "webpack.config",
    ];

    for (const configName of configNames) {
      if (name === configName || name.startsWith(configName)) {
        return true;
      }
    }

    // Check for patterns like .eslintrc.json, .prettierrc.js, etc.
    if (name.startsWith(".eslintrc") || name.startsWith(".prettierrc")) {
      return true;
    }

    return false;
  }

  private isBuildPath(relativePath: string): boolean {
    const buildIndicators = [
      "/dist/",
      "/build/",
      "/out/",
      "/.next/",
      "/.nuxt/",
      "/.output/",
      "/.turbo/",
      "/.cache/",
      "dist/",
      "build/",
      "out/",
    ];

    for (const indicator of buildIndicators) {
      if (relativePath.includes(indicator)) {
        return true;
      }
    }

    return false;
  }
}
