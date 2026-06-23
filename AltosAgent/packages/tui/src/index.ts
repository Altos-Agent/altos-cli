// @altos/tui - Terminal UI components

import * as os from "os";
import { execSync } from "child_process";

// ============================================================================
// Theme
// ============================================================================

export interface TUITheme {
  background: string;
  foreground: string;
  accent: string;
  error: string;
  warning: string;
  success: string;
  muted: string;
  bright: string;
}

export const DefaultTheme: TUITheme = {
  background: "#0f0f0f",
  foreground: "#e4e4e7",
  accent: "#3b82f6",
  error: "#ef4444",
  warning: "#f59e0b",
  success: "#22c55e",
  muted: "#71717a",
  bright: "#fafafa",
};

export const NoColorTheme: TUITheme = {
  background: "",
  foreground: "",
  accent: "",
  error: "",
  warning: "",
  success: "",
  muted: "",
  bright: "",
};

// Detect terminal color support
export function supportsColor(): boolean {
  if (process.env.NO_COLOR) return false;
  if (!process.stdout.isTTY) return false;
  const term = process.env.TERM ?? "";
  if (term === "dumb") return false;
  return true;
}

export function createTheme(
  _env: Record<string, string> = process.env as Record<string, string>,
): TUITheme {
  if (!supportsColor()) return NoColorTheme;
  return DefaultTheme;
}

// ============================================================================
// ANSI Color/Style Helpers
// ============================================================================

export const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
  brightRed: "\x1b[91m",
  brightGreen: "\x1b[92m",
  brightYellow: "\x1b[93m",
  brightBlue: "\x1b[94m",
  brightMagenta: "\x1b[95m",
  brightCyan: "\x1b[96m",
};

export function color(text: string, color: string): string {
  if (!supportsColor()) return text;
  return `${color}${text}${c.reset}`;
}

export function bold(text: string): string {
  return supportsColor() ? `${c.bold}${text}${c.reset}` : text;
}

export function dim(text: string): string {
  return supportsColor() ? `${c.dim}${text}${c.reset}` : text;
}

// ============================================================================
// Component Interface
// ============================================================================

export interface Component {
  render(): string;
}

// ============================================================================
// Spinner
// ============================================================================

export class Spinner implements Component {
  private frame = 0;
  private readonly chars = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  constructor(public message = "Loading...") {}

  render(): string {
    return `${this.chars[this.frame++ % this.chars.length]} ${this.message}`;
  }

  tick(): void {
    this.frame++;
  }

  setMessage(message: string): void {
    this.message = message;
  }
}

// ============================================================================
// Progress Bar
// ============================================================================

export class ProgressBar implements Component {
  constructor(
    public current: number,
    public total: number,
    public width = 40,
    public label = "",
  ) {}

  render(): string {
    const ratio = this.total > 0 ? this.current / this.total : 0;
    const filled = Math.round(ratio * this.width);
    const bar = "█".repeat(filled) + "░".repeat(this.width - filled);
    const pct = Math.round(ratio * 100);
    const label = this.label ? ` ${this.label}` : "";
    return `[${bar}] ${pct}%${label}`;
  }
}

// ============================================================================
// Text
// ============================================================================

export class Text implements Component {
  constructor(
    public content: string,
    public style?: "bold" | "dim" | "italic" | "error" | "warning" | "success" | "accent",
  ) {}

  render(): string {
    if (!this.style) return this.content;
    const styleMap: Record<string, string> = {
      bold: c.bold,
      dim: c.dim,
      italic: c.italic,
      error: c.red,
      warning: c.yellow,
      success: c.green,
      accent: c.blue,
    };
    return color(this.content, styleMap[this.style] ?? c.reset);
  }
}

// ============================================================================
// Divider
// ============================================================================

export class Divider implements Component {
  constructor(
    public char = "─",
    public width = 60,
  ) {}

  render(): string {
    return this.char.repeat(this.width);
  }
}

// ============================================================================
// Panel / Box
// ============================================================================

export class Panel implements Component {
  constructor(
    public title: string,
    public lines: string[],
    public options: { border?: boolean; width?: number; style?: "double" | "single" | "none" } = {},
  ) {}

  render(): string {
    const w = this.options.width ?? Math.max(this.title.length + 4, 40);
    const style = this.options.style ?? "single";

    const tl = style === "double" ? "╔" : style === "single" ? "┌" : "";
    const tr = style === "double" ? "╗" : style === "single" ? "┐" : "";
    const bl = style === "double" ? "╚" : style === "single" ? "└" : "";
    const br = style === "double" ? "╝" : style === "single" ? "┘" : "";
    const h = style === "double" ? "═" : style === "single" ? "─" : " ";

    const lines: string[] = [];
    if (style !== "none") {
      lines.push(`${tl}${h.repeat(w)}${tr}`);
      lines.push(`${bold(this.title.padEnd(w))}${tr.replace(".", "")}`);
      lines.push(`${bl}${h.repeat(w)}${br}`);
    }

    for (const line of this.lines) {
      const padded = line.padEnd(w - 2).slice(0, w - 2);
      lines.push(`  ${padded}`);
    }

    if (style !== "none") {
      lines.push(`${bl}${h.repeat(w)}${br}`);
    }

    return lines.join("\n");
  }
}

// ============================================================================
// Status Bar
// ============================================================================

export interface StatusBarData {
  model: string;
  cwd: string;
  gitBranch?: string;
  permissionMode: string;
  memoryAdapter?: string;
  tokenUsage?: { input: number; output: number };
  provider?: string;
}

export class StatusBar implements Component {
  constructor(
    private data: StatusBarData,
    private theme: TUITheme = DefaultTheme,
  ) {}

  private getGitBranch(): string {
    try {
      const result = execSync("git branch --show-current 2>/dev/null", {
        encoding: "utf-8",
        timeout: 2000,
      });
      return result.trim() || "";
    } catch {
      return "";
    }
  }

  private shortenCwd(cwd: string, maxLen = 36): string {
    const home = os.homedir();
    if (cwd.startsWith(home)) {
      cwd = "~" + cwd.slice(home.length);
    }
    if (cwd.length > maxLen) {
      return "…" + cwd.slice(-(maxLen - 1));
    }
    return cwd;
  }

  render(): string {
    const branch = this.data.gitBranch ?? this.getGitBranch();
    const cwd = this.shortenCwd(this.data.cwd);
    const branchDisplay = branch ? ` ${dim("|")} ${color(branch, this.theme.accent)}` : "";
    const tokenDisplay = this.data.tokenUsage
      ? ` ${dim("|")} tokens: ${this.data.tokenUsage.input}/${this.data.tokenUsage.output}`
      : "";
    const memoryDisplay = this.data.memoryAdapter ? ` ${dim("|")} ${this.data.memoryAdapter}` : "";

    const left = [
      color(this.data.model, this.theme.accent),
      dim("│"),
      dim(cwd),
      branchDisplay,
      dim("│"),
      color(this.data.permissionMode, this.theme.warning),
      memoryDisplay,
      tokenDisplay,
    ].join(" ");

    const w = process.stdout.columns ?? 80;
    const bar = "─".repeat(Math.max(1, w - 2));

    return `\n${color(bar, this.theme.muted)}\n${left}\n${color(bar, this.theme.muted)}`;
  }
}

// ============================================================================
// Tool Call Card
// ============================================================================

export type ToolStatus = "pending" | "running" | "success" | "error" | "permission";

export interface ToolCardData {
  name: string;
  status: ToolStatus;
  duration?: number;
  summary?: string;
  error?: string;
  risk?: string;
  args?: Record<string, unknown>;
}

export class ToolCard implements Component {
  constructor(
    private data: ToolCardData,
    private theme: TUITheme = DefaultTheme,
  ) {}

  private statusIcon(): string {
    switch (this.data.status) {
      case "success":
        return color("✓", this.theme.success);
      case "error":
        return color("✗", this.theme.error);
      case "pending":
        return color("○", this.theme.muted);
      case "running":
        return color("⋯", this.theme.accent);
      case "permission":
        return color("⚠", this.theme.warning);
    }
  }

  private statusLabel(): string {
    switch (this.data.status) {
      case "success":
        return color("success", this.theme.success);
      case "error":
        return color("error", this.theme.error);
      case "pending":
        return color("pending", this.theme.muted);
      case "running":
        return color("running", this.theme.accent);
      case "permission":
        return color("permission", this.theme.warning);
    }
  }

  render(): string {
    const icon = this.statusIcon();
    const name = bold(this.data.name);
    const duration = this.data.duration !== undefined ? dim(` ${this.data.duration}ms`) : "";

    const lines: string[] = [];
    lines.push(`  ${icon} ${name} ${this.statusLabel()}${duration}`);

    if (this.data.risk) {
      const riskColor =
        this.data.risk === "critical" || this.data.risk === "high"
          ? this.theme.error
          : this.data.risk === "medium"
            ? this.theme.warning
            : this.theme.success;
      lines.push(`    ${dim("risk:")} ${color(this.data.risk, riskColor)}`);
    }

    if (this.data.args && Object.keys(this.data.args).length > 0) {
      const argsStr = JSON.stringify(this.data.args).slice(0, 100);
      lines.push(`    ${dim("args:")} ${argsStr}`);
    }

    if (this.data.summary) {
      lines.push(`    ${dim("→")} ${this.data.summary}`);
    }

    if (this.data.error) {
      lines.push(`    ${color("ERROR:", this.theme.error)} ${this.data.error}`);
    }

    return lines.join("\n");
  }
}

// ============================================================================
// Diff Preview
// ============================================================================

export interface DiffLine {
  type: "add" | "remove" | "context";
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

export interface FilePatch {
  filePath: string;
  hunks: DiffHunk[];
  oldRevision?: string;
  newRevision?: string;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export class DiffPreview implements Component {
  constructor(
    private patch: FilePatch,
    private theme: TUITheme = DefaultTheme,
    private maxWidth = process.stdout.columns ?? 120,
  ) {}

  render(): string {
    const lines: string[] = [];
    const header = `--- ${this.patch.filePath}${this.patch.oldRevision ? ` (${this.patch.oldRevision})` : ""}`;

    lines.push(dim(header));

    for (const hunk of this.patch.hunks) {
      lines.push(this.renderHunk(hunk));
    }

    return lines.join("\n");
  }

  private renderHunk(hunk: DiffHunk): string {
    const lines: string[] = [];
    const header = `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`;
    lines.push(color(header, this.theme.accent));

    for (const line of hunk.lines) {
      lines.push(this.renderLine(line));
    }

    return lines.join("\n");
  }

  private renderLine(line: DiffLine): string {
    const content =
      line.content.length > this.maxWidth - 6
        ? line.content.slice(0, this.maxWidth - 9) + "…"
        : line.content;

    switch (line.type) {
      case "add":
        return `+ ${color(content, this.theme.success)}`;
      case "remove":
        return `- ${color(content, this.theme.error)}`;
      case "context":
        return `  ${dim(content)}`;
    }
  }
}

// Parse a unified diff into structured format
export function parseDiff(diffText: string): FilePatch[] {
  const patches: FilePatch[] = [];
  const lines = diffText.split("\n");

  let currentFile: FilePatch | null = null;
  let currentHunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const rawLine of lines) {
    const line = rawLine;

    // File header
    const fileMatch = line.match(/^---\s+(.+)/);
    if (fileMatch) {
      if (currentHunk && currentFile) {
        currentFile.hunks.push(currentHunk);
      }
      if (currentFile) {
        patches.push(currentFile);
      }
      currentFile = { filePath: fileMatch[1], hunks: [] };
      currentHunk = null;
      continue;
    }

    // Hunk header
    const hunkMatch = line.match(/^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
    if (hunkMatch) {
      if (currentHunk && currentFile) {
        currentFile.hunks.push(currentHunk);
      }
      oldLine = parseInt(hunkMatch[1], 10);
      newLine = parseInt(hunkMatch[3], 10);
      currentHunk = {
        oldStart: oldLine,
        oldLines: parseInt(hunkMatch[2] || "1", 10),
        newStart: newLine,
        newLines: parseInt(hunkMatch[4] || "1", 10),
        lines: [],
      };
      continue;
    }

    // Content lines
    if (currentHunk) {
      if (line.startsWith("+")) {
        currentHunk.lines.push({
          type: "add",
          content: line.slice(1),
          newLineNo: newLine++,
        });
      } else if (line.startsWith("-")) {
        currentHunk.lines.push({
          type: "remove",
          content: line.slice(1),
          oldLineNo: oldLine++,
        });
      } else if (line.startsWith(" ") || line === "") {
        currentHunk.lines.push({
          type: "context",
          content: line.slice(1),
          oldLineNo: oldLine++,
          newLineNo: newLine++,
        });
      }
    }
  }

  if (currentHunk && currentFile) {
    currentFile.hunks.push(currentHunk);
  }
  if (currentFile) {
    patches.push(currentFile);
  }

  return patches;
}

// Apply patch to get new content (basic three-way merge simulation)
export function applyPatch(original: string, patch: FilePatch): string {
  const originalLines = original.split("\n");
  const result: string[] = [];

  for (const hunk of patch.hunks) {
    // Copy context before hunk
    while (result.length < hunk.oldStart - 1) {
      result.push(originalLines[result.length]);
    }

    // Apply hunk
    for (const line of hunk.lines) {
      if (line.type === "add") {
        result.push(line.content);
      } else if (line.type === "context") {
        result.push(line.content);
      }
      // skip removes
    }
  }

  // Append remaining
  while (result.length < originalLines.length) {
    result.push(originalLines[result.length]);
  }

  return result.join("\n");
}

// ============================================================================
// Banner / Welcome
// ============================================================================

export function renderBanner(version: string): string {
  const theme = DefaultTheme;
  const lines = [
    "",
    `${color("╔" + "═".repeat(49) + "╗", theme.accent)}`,
    `${color("║", theme.accent)}  ${color("Altos", theme.bright)} ${color("v" + version, theme.muted)}${" ".repeat(32)}${color("║", theme.accent)}`,
    `${color("╠" + "═".repeat(49) + "╣", theme.accent)}`,
    `${color("║", theme.accent)}  ${dim("Type /help for commands")}${" ".repeat(27)}${color("║", theme.accent)}`,
    `${color("║", theme.accent)}  ${dim("Press Ctrl+C to pause")}${" ".repeat(29)}${color("║", theme.accent)}`,
    `${color("╚" + "═".repeat(49) + "╝", theme.accent)}`,
    "",
  ];
  return lines.join("\n");
}

// ============================================================================
// Session Info
// ============================================================================

export function renderSessionSummary(summary: {
  id: string;
  status: string;
  cwd: string;
  model?: string;
  eventCount: number;
  createdAt: number;
  updatedAt: number;
}): string {
  const theme = DefaultTheme;
  const statusColor =
    summary.status === "running"
      ? theme.success
      : summary.status === "waiting_for_permission"
        ? theme.warning
        : theme.muted;

  const lines = [
    "",
    dim("─".repeat(50)),
    `  ${bold("Session")}  ${summary.id}`,
    `  ${bold("Status")}   ${color(summary.status, statusColor)}`,
    `  ${bold("CWD")}     ${summary.cwd}`,
    summary.model ? `  ${bold("Model")}   ${summary.model}` : null,
    `  ${bold("Events")}  ${summary.eventCount}`,
    `  ${bold("Started")} ${new Date(summary.createdAt).toLocaleTimeString()}`,
    dim("─".repeat(50)),
    "",
  ].filter(Boolean);

  return lines.join("\n");
}

// ============================================================================
// Confirm Dialog
// ============================================================================

export async function confirm(
  question: string,
  rl: { question: (q: string, cb: (ans: string) => void) => void },
): Promise<boolean> {
  return new Promise((resolve) => {
    rl.question(`${question} (y/N) `, (ans: string) => {
      resolve(ans.toLowerCase() === "y");
    });
  });
}

// ============================================================================
// Stream Renderer (for streaming text output)
// ============================================================================

export class StreamRenderer {
  private buffer = "";
  private lastLen = 0;

  constructor(private output = process.stdout) {}

  write(chunk: string): void {
    this.buffer += chunk;
    // Write only the new part
    if (chunk) {
      this.output.write(chunk);
      this.lastLen += chunk.length;
    }
  }

  flush(): string {
    const result = this.buffer;
    this.buffer = "";
    return result;
  }

  clear(): void {
    if (this.lastLen > 0) {
      // Move cursor back and clear
      this.output.write(`\r${" ".repeat(this.lastLen)}\r`);
      this.lastLen = 0;
    }
  }
}
