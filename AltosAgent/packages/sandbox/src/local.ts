// @altos/sandbox - Local sandbox provider

import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs";
import type {
  SandboxProvider,
  SandboxExecutionOptions,
  SandboxProviderStatus,
  PathValidationResult,
  DenylistEntry,
} from "./provider.js";
import type { ResourceLimits, ProcessResult } from "./index.js";

const PATH_DENYLIST: DenylistEntry[] = [
  { pattern: /^\/\.\./, reason: "Path traversal attempt" },
  { pattern: /\/\.\.\//, reason: "Path traversal attempt" },
  { pattern: /^~\/\.ssh\//, reason: "SSH directory access is not allowed" },
  { pattern: /^~\/\.aws\//, reason: "AWS credentials access is not allowed" },
  { pattern: /^~\/\.kube\//, reason: "Kubernetes config access is not allowed" },
  { pattern: /^~\/\.gnupg\//, reason: "GPG directory access is not allowed" },
  { pattern: /^~\/\.netrc/, reason: "Netrc file access is not allowed" },
  { pattern: /^~\/\.env$/, reason: "Environment file access is not allowed" },
  { pattern: /\.env$/, reason: "Environment file access is not allowed" },
  { pattern: /\/etc\/passwd$/, reason: "System file access is not allowed" },
  { pattern: /\/etc\/shadow/, reason: "Shadow file access is not allowed" },
  { pattern: /^\/System\//, reason: "System directory access is not allowed" },
  { pattern: /^\/Library\/Apple\//, reason: "Apple system directory access is not allowed" },
  { pattern: /\.aws\/credentials/, reason: "AWS credentials access is not allowed" },
  { pattern: /\.aws\/config/, reason: "AWS config access is not allowed" },
  { pattern: /\.docker\/config\.json$/, reason: "Docker config access is not allowed" },
];

export class LocalSandboxProvider implements SandboxProvider {
  readonly id = "local";
  readonly name = "Local Sandbox";
  readonly type: "local" = "local";
  private _available = true;
  private _workspace: string | null = null;
  private _ready = false;
  private _activeCommands = 0;
  private _networkEnabled = true;
  private _limits?: ResourceLimits;

  constructor(
    private denylist: DenylistEntry[] = PATH_DENYLIST,
    private policyChecker?: (command: string) => { allowed: boolean; reason?: string },
  ) {}

  get available(): boolean {
    return this._available;
  }

  async prepare(workspace: string): Promise<void> {
    // Resolve and validate workspace path
    const resolvedPath = path.resolve(workspace);

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Workspace does not exist: ${resolvedPath}`);
    }

    if (!fs.statSync(resolvedPath).isDirectory()) {
      throw new Error(`Workspace is not a directory: ${resolvedPath}`);
    }

    this._workspace = resolvedPath;
    this._ready = true;
  }

  async executeCommand(
    command: string,
    options: SandboxExecutionOptions = {},
  ): Promise<ProcessResult> {
    if (!this._ready || !this._workspace) {
      throw new Error("Sandbox not prepared. Call prepare() first.");
    }

    this._activeCommands++;

    try {
      // Check command policy before execution
      if (this.policyChecker) {
        const policyResult = this.policyChecker(command);
        if (!policyResult.allowed) {
          return {
            exitCode: 1,
            stdout: "",
            stderr: `Command denied by policy: ${policyResult.reason ?? "policy violation"}`,
            duration: 0,
            killed: false,
          };
        }
      }

      const timeout = options.timeout ?? this._limits?.maxDurationMs ?? 30000;
      const cwd = options.cwd ?? this._workspace;

      // Validate cwd is within workspace
      if (!this.isPathAllowed(cwd)) {
        return {
          exitCode: 1,
          stdout: "",
          stderr: `Working directory is outside workspace: ${cwd}`,
          duration: 0,
          killed: false,
        };
      }

      const result = await this.runCommand(command, {
        cwd,
        env: { ...process.env, ...options.env } as Record<string, string>,
        timeout,
      });

      return result;
    } finally {
      this._activeCommands--;
    }
  }

  async readFile(relativePath: string): Promise<string> {
    if (!this._workspace) {
      throw new Error("Sandbox not prepared. Call prepare() first.");
    }

    const fullPath = this.resolvePath(relativePath);

    if (!this.isPathAllowed(fullPath)) {
      throw new Error(`Path is not allowed: ${relativePath}`);
    }

    return fs.readFileSync(fullPath, "utf-8");
  }

  async writeFile(relativePath: string, content: string): Promise<void> {
    if (!this._workspace) {
      throw new Error("Sandbox not prepared. Call prepare() first.");
    }

    const fullPath = this.resolvePath(relativePath);

    if (!this.isPathAllowed(fullPath)) {
      throw new Error(`Path is not allowed: ${relativePath}`);
    }

    // Ensure parent directory exists
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(fullPath, content, "utf-8");
  }

  async cleanup(): Promise<void> {
    this._ready = false;
    this._workspace = null;
    this._activeCommands = 0;
  }

  isPathAllowed(targetPath: string): boolean {
    if (!this._workspace) return false;

    // Resolve the target path
    const resolvedTarget = path.resolve(targetPath);
    const resolvedWorkspace = path.resolve(this._workspace);

    // Check if target is within workspace
    if (
      !resolvedTarget.startsWith(resolvedWorkspace + path.sep) &&
      resolvedTarget !== resolvedWorkspace
    ) {
      return false;
    }

    // Check against denylist
    const home = process.env.HOME ?? "";
    const expandedPath = resolvedTarget.replace(/^~/, home);

    for (const entry of this.denylist) {
      if (entry.pattern.test(expandedPath)) {
        return false;
      }
    }

    return true;
  }

  getStatus(): SandboxProviderStatus {
    return {
      providerId: this.id,
      providerName: this.name,
      type: this.type,
      isReady: this._ready,
      workspace: this._workspace ?? undefined,
      activeCommands: this._activeCommands,
      networkEnabled: this._networkEnabled,
      limits: this._limits,
    };
  }

  setNetworkEnabled(enabled: boolean): void {
    this._networkEnabled = enabled;
  }

  setLimits(limits: ResourceLimits): void {
    this._limits = limits;
  }

  // -------------------------------------------------------------------------
  // Private Methods
  // -------------------------------------------------------------------------

  private resolvePath(relativePath: string): string {
    if (!this._workspace) {
      throw new Error("Workspace not set");
    }
    return path.resolve(this._workspace, relativePath);
  }

  private async runCommand(
    command: string,
    options: { cwd: string; env: Record<string, string>; timeout: number },
  ): Promise<ProcessResult> {
    return new Promise((resolve) => {
      const start = Date.now();
      let killed = false;
      let stdout = "";
      let stderr = "";
      let timer: NodeJS.Timeout | undefined;

      const shell = process.platform === "win32" ? "cmd.exe" : "/bin/sh";
      const shellArg = process.platform === "win32" ? "/c" : "-c";

      const proc = spawn(shell, [shellArg, command], {
        cwd: options.cwd,
        env: options.env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      if (options.timeout > 0) {
        timer = setTimeout(() => {
          killed = true;
          proc.kill("SIGKILL");
        }, options.timeout);
      }

      proc.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (timer) clearTimeout(timer);
        resolve({
          exitCode: code ?? 0,
          stdout,
          stderr,
          duration: Date.now() - start,
          killed,
        });
      });

      proc.on("error", (err) => {
        if (timer) clearTimeout(timer);
        resolve({
          exitCode: 1,
          stdout,
          stderr: err.message,
          duration: Date.now() - start,
          killed: false,
        });
      });
    });
  }
}

// =============================================================================
// Factory and Utilities
// =============================================================================

export function createLocalSandbox(
  policyChecker?: (command: string) => { allowed: boolean; reason?: string },
): LocalSandboxProvider {
  return new LocalSandboxProvider(undefined, policyChecker);
}

export function checkPathAgainstDenylist(
  targetPath: string,
  denylist: DenylistEntry[],
): PathValidationResult {
  const expandedPath = targetPath.replace(/^~/, process.env.HOME ?? "");

  for (const entry of denylist) {
    if (entry.pattern.test(expandedPath)) {
      return {
        allowed: false,
        reason: entry.reason,
        resolvedPath: path.resolve(expandedPath),
      };
    }
  }

  return {
    allowed: true,
    resolvedPath: path.resolve(expandedPath),
  };
}

export function validateWorkspaceBoundary(
  targetPath: string,
  workspace: string,
): PathValidationResult {
  // Resolve the target path - if it's relative, resolve it against workspace
  const isAbsolute = path.isAbsolute(targetPath);
  const resolvedTarget = isAbsolute
    ? path.resolve(targetPath)
    : path.resolve(workspace, targetPath);
  const resolvedWorkspace = path.resolve(workspace);

  if (
    !resolvedTarget.startsWith(resolvedWorkspace + path.sep) &&
    resolvedTarget !== resolvedWorkspace
  ) {
    return {
      allowed: false,
      reason: `Path ${targetPath} is outside workspace ${workspace}`,
      resolvedPath: resolvedTarget,
    };
  }

  return {
    allowed: true,
    resolvedPath: resolvedTarget,
  };
}
