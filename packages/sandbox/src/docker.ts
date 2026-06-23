// @altos/sandbox - Docker sandbox provider

import { spawn, execSync } from "child_process";
import * as path from "path";
import * as fs from "fs";
import type {
  SandboxProvider,
  SandboxProviderInfo,
  SandboxExecutionOptions,
  SandboxProviderStatus,
  DockerSandboxConfig,
  DockerRunConfig,
  DockerMount,
} from "./provider.js";
import type { ResourceLimits, ProcessResult } from "./index.js";
import { validateWorkspaceBoundary } from "./local.js";

const DEFAULT_DOCKER_IMAGE = "altos/sandbox:latest";

export class DockerSandboxProvider implements SandboxProvider {
  readonly id: string;
  readonly name: string;
  readonly type: "docker" = "docker";

  protected _available: boolean;
  protected _version: string | undefined;
  private _workspace: string | null = null;
  private _ready = false;
  private _activeCommands = 0;
  private _networkEnabled = true;
  private _limits?: ResourceLimits;
  private _config: DockerSandboxConfig;
  protected _containerId: string | null = null;

  constructor(
    id: string = "docker",
    config: DockerSandboxConfig = {},
    protected denylistPath: string = "/etc,/proc,/sys,/root/.ssh",
  ) {
    this.id = id;
    this.name = config.user ? `Docker (${config.user})` : "Docker Sandbox";
    this._config = { ...config };
    this._available = this.checkDockerAvailable();
  }

  get available(): boolean {
    return this._available;
  }

  protected checkDockerAvailable(): boolean {
    try {
      execSync("docker --version", { stdio: "pipe" });
      const versionOutput = execSync("docker --version", { encoding: "utf-8" });
      this._version = versionOutput.trim();
      return true;
    } catch {
      return false;
    }
  }

  async prepare(workspace: string): Promise<void> {
    if (!this._available) {
      throw new Error("Docker is not available on this system");
    }

    // Validate workspace
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
      const timeout = options.timeout ?? this._limits?.maxDurationMs ?? 300000; // 5 min default for docker
      const networkEnabled = options.networkEnabled ?? this._networkEnabled;
      const limits = options.limits ?? this._limits;

      // Build docker run configuration
      const dockerConfig = this.buildDockerConfig(command, {
        cwd: options.cwd ?? this._workspace,
        env: options.env ?? {},
        timeout,
        networkEnabled,
        limits,
      });

      // Execute via docker run
      const result = await this.runDocker(dockerConfig, timeout);

      return result;
    } finally {
      this._activeCommands--;
    }
  }

  async readFile(relativePath: string): Promise<string> {
    if (!this._workspace) {
      throw new Error("Sandbox not prepared. Call prepare() first.");
    }

    const fullPath = path.resolve(this._workspace, relativePath);

    // Validate path is within workspace
    const validation = validateWorkspaceBoundary(fullPath, this._workspace);
    if (!validation.allowed) {
      throw new Error(`Path is not allowed: ${relativePath}`);
    }

    if (!fs.existsSync(fullPath)) {
      throw new Error(`File does not exist: ${relativePath}`);
    }

    return fs.readFileSync(fullPath, "utf-8");
  }

  async writeFile(relativePath: string, content: string): Promise<void> {
    if (!this._workspace) {
      throw new Error("Sandbox not prepared. Call prepare() first.");
    }

    const fullPath = path.resolve(this._workspace, relativePath);

    // Validate path is within workspace
    const validation = validateWorkspaceBoundary(fullPath, this._workspace);
    if (!validation.allowed) {
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
    // Remove any created containers
    if (this._containerId) {
      try {
        execSync(`docker rm -f ${this._containerId}`, { stdio: "pipe" });
      } catch {
        // Container may have already been removed
      }
      this._containerId = null;
    }

    this._ready = false;
    this._workspace = null;
    this._activeCommands = 0;
  }

  isPathAllowed(targetPath: string): boolean {
    if (!this._workspace) return false;

    const validation = validateWorkspaceBoundary(targetPath, this._workspace);
    if (!validation.allowed) return false;

    // Also check system paths
    const systemPaths = this.denylistPath.split(",");
    const resolvedTarget = path.resolve(targetPath);
    for (const sysPath of systemPaths) {
      if (resolvedTarget.startsWith(sysPath)) {
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
      version: this._version,
    };
  }

  setNetworkEnabled(enabled: boolean): void {
    this._networkEnabled = enabled;
  }

  setLimits(limits: ResourceLimits): void {
    this._limits = limits;
  }

  getContainerId(): string | null {
    return this._containerId;
  }

  // -------------------------------------------------------------------------
  // Docker Configuration Builder
  // -------------------------------------------------------------------------

  protected buildDockerConfig(
    command: string,
    options: {
      cwd: string;
      env: Record<string, string>;
      timeout: number;
      networkEnabled: boolean;
      limits?: ResourceLimits;
    },
  ): DockerRunConfig {
    const image = this._config.image ?? DEFAULT_DOCKER_IMAGE;
    const workdir = this._config.workdir ?? "/workspace";

    const mounts: DockerMount[] = [
      {
        Type: "bind",
        Source: this._workspace!,
        Target: workdir,
        ReadOnly: this._config.readOnly ?? false,
      },
    ];

    const env: string[] = [];
    for (const [key, value] of Object.entries(options.env)) {
      env.push(`${key}=${value}`);
    }

    const config: DockerRunConfig = {
      Image: image,
      Cmd: ["/bin/sh", "-c", command],
      Env: env,
      WorkingDir: workdir,
      Mounts: mounts,
      NetworkDisabled: !options.networkEnabled,
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges"],
      AutoRemove: true,
      AttachStdin: false,
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
    };

    // Apply resource limits
    if (options.limits) {
      if (options.limits.maxMemoryMB) {
        config.Memory = options.limits.maxMemoryMB * 1024 * 1024;
      }
      if (options.limits.maxCPUPercent) {
        // Convert percentage to docker cpu quota
        // CPU period is 100000 (100ms), quota = percent * 1000
        config.CpuPeriod = 100000;
        config.CpuQuota = Math.floor(options.limits.maxCPUPercent * 1000);
      }
      if (options.limits.maxOpenFiles) {
        config.PidsLimit = options.limits.maxOpenFiles;
      }
    }

    return config;
  }

  /**
   * Generate docker run command string (for debugging/display)
   */
  generateDockerCommand(config: DockerRunConfig): string {
    const args = ["docker", "run", "--rm"];

    if (config.NetworkDisabled) {
      args.push("--network", "none");
    }

    for (const mount of config.Mounts) {
      const ro = mount.ReadOnly ? ":ro" : ":rw";
      args.push("-v", `${mount.Source}:${mount.Target}${ro}`);
    }

    if (config.CapDrop?.length) {
      args.push("--cap-drop", config.CapDrop.join("--cap-drop"));
    }

    if (config.SecurityOpt?.length) {
      for (const opt of config.SecurityOpt) {
        args.push("--security-opt", opt);
      }
    }

    if (config.Memory) {
      args.push("--memory", config.Memory.toString());
    }

    if (config.CpuPeriod && config.CpuQuota) {
      args.push("--cpu-period", config.CpuPeriod.toString());
      args.push("--cpu-quota", config.CpuQuota.toString());
    }

    if (config.PidsLimit) {
      args.push("--pids-limit", config.PidsLimit.toString());
    }

    args.push("-w", config.WorkingDir);

    for (const env of config.Env) {
      args.push("-e", env);
    }

    args.push(config.Image);
    args.push(...config.Cmd);

    return args.join(" ");
  }

  // -------------------------------------------------------------------------
  // Private Methods
  // -------------------------------------------------------------------------

  protected async runDocker(config: DockerRunConfig, timeout: number): Promise<ProcessResult> {
    return new Promise((resolve) => {
      const start = Date.now();
      let killed = false;
      let stdout = "";
      let stderr = "";
      let timer: NodeJS.Timeout | undefined;

      // Build docker arguments
      const dockerArgs = this.buildDockerArgs(config);

      const proc = spawn("docker", dockerArgs, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      if (timeout > 0) {
        timer = setTimeout(() => {
          killed = true;
          proc.kill("SIGKILL");
          // Also kill the container
          if (this._containerId) {
            try {
              execSync(`docker rm -f ${this._containerId}`, { stdio: "pipe" });
            } catch {
              // Ignore
            }
          }
        }, timeout);
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

  protected buildDockerArgs(config: DockerRunConfig): string[] {
    const args: string[] = ["run", "--rm"];

    if (config.NetworkDisabled) {
      args.push("--network", "none");
    }

    for (const mount of config.Mounts) {
      const ro = mount.ReadOnly ? ":ro" : "";
      args.push("-v", `${mount.Source}:${mount.Target}${ro}`);
    }

    if (config.CapDrop?.length) {
      for (const cap of config.CapDrop) {
        args.push("--cap-drop", cap);
      }
    }

    if (config.SecurityOpt?.length) {
      for (const opt of config.SecurityOpt) {
        args.push("--security-opt", opt);
      }
    }

    if (config.Memory) {
      args.push("--memory", config.Memory.toString());
    }

    if (config.CpuPeriod && config.CpuQuota) {
      args.push("--cpu-period", config.CpuPeriod.toString());
      args.push("--cpu-quota", config.CpuQuota.toString());
    }

    if (config.PidsLimit) {
      args.push("--pids-limit", config.PidsLimit.toString());
    }

    args.push("-w", config.WorkingDir);

    for (const env of config.Env) {
      args.push("-e", env);
    }

    args.push(config.Image);
    args.push(...config.Cmd);

    return args;
  }
}

// =============================================================================
// Podman Support
// =============================================================================

export class PodmanSandboxProvider extends DockerSandboxProvider {
  constructor(
    config: DockerSandboxConfig = {},
    denylistPath: string = "/etc,/proc,/sys,/root/.ssh",
  ) {
    super("podman", config, denylistPath);
  }

  protected checkDockerAvailable(): boolean {
    try {
      execSync("podman --version", { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  }

  protected buildDockerArgs(config: DockerRunConfig): string[] {
    // Same as Docker but use podman command
    const args: string[] = ["podman", "run", "--rm"];

    if (config.NetworkDisabled) {
      args.push("--network", "none");
    }

    for (const mount of config.Mounts) {
      const ro = mount.ReadOnly ? ":ro" : "";
      args.push("-v", `${mount.Source}:${mount.Target}${ro}`);
    }

    if (config.CapDrop?.length) {
      for (const cap of config.CapDrop) {
        args.push("--cap-drop", cap);
      }
    }

    if (config.SecurityOpt?.length) {
      for (const opt of config.SecurityOpt) {
        args.push("--security-opt", opt);
      }
    }

    if (config.Memory) {
      args.push("--memory", config.Memory.toString());
    }

    if (config.CpuPeriod && config.CpuQuota) {
      args.push("--cpu-period", config.CpuPeriod.toString());
      args.push("--cpu-quota", config.CpuQuota.toString());
    }

    if (config.PidsLimit) {
      args.push("--pids-limit", config.PidsLimit.toString());
    }

    args.push("-w", config.WorkingDir);

    for (const env of config.Env) {
      args.push("-e", env);
    }

    args.push(config.Image);
    args.push(...config.Cmd);

    return args;
  }
}

// =============================================================================
// Factory and Utilities
// =============================================================================

export function createDockerSandbox(config?: DockerSandboxConfig): DockerSandboxProvider {
  return new DockerSandboxProvider("docker", config);
}

export function createPodmanSandbox(config?: DockerSandboxConfig): PodmanSandboxProvider {
  return new PodmanSandboxProvider(config);
}

export function detectAvailableProviders(): SandboxProviderInfo[] {
  const providers: SandboxProviderInfo[] = [];

  // Check Docker
  try {
    execSync("docker --version", { stdio: "pipe" });
    providers.push({
      id: "docker",
      name: "Docker",
      type: "docker",
      available: true,
      version: execSync("docker --version", { encoding: "utf-8" }).trim(),
    });
  } catch {
    providers.push({
      id: "docker",
      name: "Docker",
      type: "docker",
      available: false,
    });
  }

  // Check Podman
  try {
    execSync("podman --version", { stdio: "pipe" });
    providers.push({
      id: "podman",
      name: "Podman",
      type: "podman",
      available: true,
      version: execSync("podman --version", { encoding: "utf-8" }).trim(),
    });
  } catch {
    providers.push({
      id: "podman",
      name: "Podman",
      type: "podman",
      available: false,
    });
  }

  // Local is always available
  providers.push({
    id: "local",
    name: "Local Sandbox",
    type: "local",
    available: true,
  });

  return providers;
}
