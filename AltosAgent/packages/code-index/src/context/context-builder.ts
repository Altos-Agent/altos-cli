import fs from "fs/promises";
import path from "path";
import type {
  BuildContextOptions,
  BuiltContext,
  IndexStats,
  RepoMap,
  SelectedFile,
  SelectionReason,
} from "../types.js";
import { DEFAULT_LIMITS } from "../types.js";
import { RelevantFileSelector } from "../selection/relevant-file-selector.js";
import { RepoMapBuilder } from "../repo-map/repo-map-builder.js";
import { WorkspaceScanner } from "../scanner/workspace-scanner.js";
import { SymbolIndex } from "../symbols/symbol-index.js";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface RepoMapCache {
  repoMap: RepoMap;
  indexedAt: number;
}

/**
 * Detect language from file path for syntax highlighting in markdown code blocks
 */
function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
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
      return "css";
    case ".html":
    case ".htm":
      return "html";
    default:
      return "text";
  }
}

/**
 * ContextBuilder orchestrates the full pipeline for building repository context
 * from a natural language prompt.
 */
export class ContextBuilder {
  private scanner: WorkspaceScanner;
  private symbolIndex: SymbolIndex;
  private selector: RelevantFileSelector;
  private repoMapBuilder: RepoMapBuilder;
  private repoMapCache: RepoMapCache | null = null;

  constructor(
    config: {
      scanner?: WorkspaceScanner;
      symbolIndex?: SymbolIndex;
      lspAdapter?: unknown;
      codeGraphAdapter?: unknown;
    } = {},
  ) {
    this.scanner = config.scanner ?? new WorkspaceScanner();
    this.symbolIndex = config.symbolIndex ?? new SymbolIndex();
    this.selector = new RelevantFileSelector();
    this.repoMapBuilder = new RepoMapBuilder();
  }

  /**
   * Build a complete context from a prompt
   */
  async build(options: BuildContextOptions): Promise<BuiltContext> {
    const {
      workspaceRoot,
      prompt,
      loadFileContent = false,
      maxFiles = DEFAULT_LIMITS.maxFilesPerSelection,
      maxSymbols = DEFAULT_LIMITS.maxSymbolsPerQuery,
      maxRepoMapTokens = DEFAULT_LIMITS.maxRepoMapTokens,
    } = options;

    // 1. Get or build repoMap with cache check
    const repoMap = await this.getOrBuildRepoMap(workspaceRoot);

    // 2. Run RelevantFileSelector to get file selection
    const selectionResult = await this.selector.select(prompt, repoMap, this.symbolIndex, {
      maxFiles,
      maxSymbols,
      maxRepoMapTokens,
      includeTests: true,
      explain: false, // Use legacy format for BuiltContext compatibility
    });

    // selectionResult is SelectionResult when explain=false
    const typedResult = selectionResult as { selectedFiles: SelectedFile[]; repoMapSlice: RepoMap; totalTokens: number; reasoning: SelectionReason[] };
    const { selectedFiles, repoMapSlice, totalTokens } = typedResult;

    // 3. Optionally load file contents
    if (loadFileContent) {
      await this.loadFileContents(selectedFiles);
    }

    const generatedAt = Date.now();

    // 4. Assemble BuiltContext with toMessages method
    const builtContext: BuiltContext = {
      workspaceRoot,
      prompt,
      selectedFiles,
      repoMap: repoMapSlice,
      totalTokens,
      generatedAt,
      toMessages() {
        const parts: string[] = ["# Repository Context"];

        // Repo Map section
        parts.push("\n## Repo Map");
        parts.push(`\`\`\`json\n${JSON.stringify(repoMapSlice, null, 2)}\n\`\`\``);

        // Selected Files section
        parts.push("\n## Selected Files");
        for (const file of selectedFiles) {
          const score = file.relevanceScore;
          parts.push(`\n### ${file.path} (score: ${score.toFixed(2)})`);
          if (file.content) {
            const lang = detectLanguage(file.path);
            parts.push(`\`\`\`${lang}\n${file.content}\n\`\`\``);
          }
        }

        return [
          {
            role: "system",
            content: parts.join("\n"),
            metadata: {
              files: selectedFiles.map((f) => f.path),
              repoMap: repoMapSlice,
            },
          },
        ];
      },
    };

    return builtContext;
  }

  /**
   * Get existing repo map from cache or build a new one
   */
  private async getOrBuildRepoMap(workspaceRoot: string): Promise<RepoMap> {
    const now = Date.now();

    // Check if we have a valid cached repoMap
    if (
      this.repoMapCache &&
      this.repoMapCache.indexedAt > 0 &&
      now - this.repoMapCache.indexedAt < CACHE_TTL_MS
    ) {
      return this.repoMapCache.repoMap;
    }

    // Build new repoMap
    const repoMap = await this.repoMapBuilder.build(workspaceRoot, this.scanner, this.symbolIndex);

    // Update cache
    this.repoMapCache = {
      repoMap,
      indexedAt: now,
    };

    return repoMap;
  }

  /**
   * Load file contents for selected files
   */
  private async loadFileContents(files: SelectedFile[]): Promise<void> {
    const readPromises = files.map(async (file) => {
      try {
        const content = await fs.readFile(file.path, "utf-8");
        file.content = content;
      } catch {
        // Skip files that can't be read
        file.content = undefined;
      }
    });

    await Promise.all(readPromises);
  }

  /**
   * Index a file for later context building
   */
  async indexFile(path: string, content: string): Promise<void> {
    await this.symbolIndex.indexFile(path, content);
  }

  /**
   * Remove a file from the index
   */
  async removeFile(path: string): Promise<void> {
    this.symbolIndex.removeFile(path);
  }

  /**
   * Get the current repo map (from cache or fresh)
   */
  getRepoMap(): RepoMap | null {
    return this.repoMapCache?.repoMap ?? null;
  }

  /**
   * Get index statistics
   */
  getIndexStats(): IndexStats {
    const stats = this.symbolIndex.getStats();
    return {
      totalSymbols: stats.totalSymbols,
      totalFiles: stats.totalFiles,
      indexedAt: this.repoMapCache?.indexedAt ?? 0,
    };
  }
}
