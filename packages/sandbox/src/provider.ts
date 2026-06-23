// @altos/sandbox - Sandbox provider interface and types

// ============================================================================
// Base Types (defined here to avoid circular imports)
// ============================================================================

export interface ResourceLimits {
  maxMemoryMB?: number;
  maxCPUPercent?: number;
  maxDurationMs?: number;
  maxFileSizeMB?: number;
  maxOpenFiles?: number;
}

export interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  killed: boolean;
}

// ============================================================================
// Provider Types
// ============================================================================

export type SandboxProviderType = "local" | "docker" | "podman";

export interface SandboxProviderInfo {
  id: string;
  name: string;
  type: SandboxProviderType;
  available: boolean;
  version?: string;
}

// ============================================================================
// Sandbox Provider Interface
// ============================================================================

export interface SandboxProvider {
  /** Unique identifier for this provider */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** Provider type */
  readonly type: SandboxProviderType;

  /** Whether this provider is available on the system */
  readonly available: boolean;

  /**
   * Prepare the sandbox for execution.
   * Called once before executeCommand().
   * @param workspace Path to the workspace directory
   */
  prepare(workspace: string): Promise<void>;

  /**
   * Execute a command inside the sandbox.
   * @param command Command to execute
   * @param options Execution options
   */
  executeCommand(command: string, options?: SandboxExecutionOptions): Promise<ProcessResult>;

  /**
   * Read a file from inside the sandbox workspace.
   * @param path Relative path within workspace
   */
  readFile(path: string): Promise<string>;

  /**
   * Write a file inside the sandbox workspace.
   * @param path Relative path within workspace
   * @param content Content to write
   */
  writeFile(path: string, content: string): Promise<void>;

  /**
   * Clean up sandbox resources.
   * Called after execution is complete.
   */
  cleanup(): Promise<void>;

  /**
   * Check if a path is within the sandbox workspace.
   * @param path Path to check
   */
  isPathAllowed(path: string): boolean;

  /**
   * Get provider status information.
   */
  getStatus(): SandboxProviderStatus;
}

export interface SandboxExecutionOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number; // milliseconds
  networkEnabled?: boolean;
  limits?: ResourceLimits;
}

export interface SandboxProviderStatus {
  providerId: string;
  providerName: string;
  type: SandboxProviderType;
  isReady: boolean;
  workspace?: string;
  activeCommands: number;
  networkEnabled: boolean;
  limits?: ResourceLimits;
  version?: string;
}

// ============================================================================
// Sandbox Result Types
// ============================================================================

export interface SandboxResult extends ProcessResult {
  providerId: string;
  providerType: SandboxProviderType;
  workspace: string;
  sandboxed: boolean;
}

// ============================================================================
// Path Validation
// ============================================================================

export interface PathValidationResult {
  allowed: boolean;
  reason?: string;
  resolvedPath?: string;
}

export interface DenylistEntry {
  pattern: RegExp;
  reason: string;
}

// Default path denylist for sandbox execution
export const DEFAULT_PATH_DENYLIST: DenylistEntry[] = [
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

// ============================================================================
// Docker Configuration
// ============================================================================

export interface DockerSandboxConfig {
  image?: string;
  networkEnabled?: boolean;
  readOnly?: boolean;
  limits?: ResourceLimits;
  user?: string;
  workdir?: string;
}

export interface DockerRunConfig {
  Image: string;
  Cmd: string[];
  Entrypoint?: string;
  Env: string[];
  WorkingDir: string;
  Mounts: DockerMount[];
  NetworkDisabled: boolean;
  CapDrop?: string[];
  SecurityOpt?: string[];
  PidsLimit?: number;
  Memory?: number;
  CpuPeriod?: number;
  CpuQuota?: number;
  AutoRemove?: boolean;
  AttachStdin?: boolean;
  AttachStdout?: boolean;
  AttachStderr?: boolean;
  Tty?: boolean;
}

export interface DockerMount {
  Type: "bind" | "volume";
  Source: string;
  Target: string;
  ReadOnly?: boolean;
}
