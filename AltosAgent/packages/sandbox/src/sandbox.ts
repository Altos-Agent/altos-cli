// @altos/sandbox - Main sandbox orchestration

import type {
  SandboxProvider,
  SandboxProviderType,
  SandboxProviderInfo,
  SandboxExecutionOptions,
  SandboxProviderStatus,
  SandboxResult,
  ResourceLimits,
} from "./provider.js";
import { LocalSandboxProvider } from "./local.js";
import {
  DockerSandboxProvider,
  PodmanSandboxProvider,
  detectAvailableProviders,
} from "./docker.js";

/**
 * Sandbox orchestration class that manages multiple provider types
 */
export class Sandbox {
  private provider: SandboxProvider | null = null;
  private _workspace: string | null = null;
  private _type: SandboxProviderType = "local";

  /**
   * Get the current provider type
   */
  get type(): SandboxProviderType {
    return this._type;
  }

  /**
   * Get the current workspace
   */
  get workspace(): string | null {
    return this._workspace;
  }

  /**
   * Get the current provider status
   */
  get status(): SandboxProviderStatus | null {
    return this.provider?.getStatus() ?? null;
  }

  /**
   * Check if sandbox is ready
   */
  get isReady(): boolean {
    return this.provider?.getStatus().isReady ?? false;
  }

  /**
   * List available sandbox providers on this system
   */
  static listProviders(): SandboxProviderInfo[] {
    return detectAvailableProviders();
  }

  /**
   * Create a sandbox with the specified provider type
   */
  static async create(
    type: SandboxProviderType = "local",
    workspace: string,
    options?: {
      networkEnabled?: boolean;
      limits?: ResourceLimits;
      policyChecker?: (command: string) => { allowed: boolean; reason?: string };
      dockerConfig?: {
        image?: string;
        user?: string;
        workdir?: string;
      };
    },
  ): Promise<Sandbox> {
    const sandbox = new Sandbox();

    switch (type) {
      case "local": {
        const provider = new LocalSandboxProvider(undefined, options?.policyChecker);
        // Cast to SandboxProvider since LocalSandboxProvider has the extra methods
        sandbox.provider = provider as unknown as SandboxProvider;
        break;
      }

      case "docker":
        sandbox.provider = new DockerSandboxProvider("docker", {
          image: options?.dockerConfig?.image,
          user: options?.dockerConfig?.user,
          workdir: options?.dockerConfig?.workdir,
        });
        break;

      case "podman":
        sandbox.provider = new PodmanSandboxProvider({
          image: options?.dockerConfig?.image,
          user: options?.dockerConfig?.user,
          workdir: options?.dockerConfig?.workdir,
        });
        break;

      default:
        throw new Error(`Unknown sandbox provider type: ${type}`);
    }

    if (!sandbox.provider.available) {
      throw new Error(`Sandbox provider ${type} is not available on this system`);
    }

    sandbox._type = type;
    sandbox._workspace = workspace;

    // Apply options using type assertion for provider-specific methods
    if (options?.networkEnabled !== undefined) {
      (sandbox.provider as LocalSandboxProvider | DockerSandboxProvider).setNetworkEnabled(
        options.networkEnabled,
      );
    }
    if (options?.limits) {
      (sandbox.provider as LocalSandboxProvider | DockerSandboxProvider).setLimits(options.limits);
    }

    // Prepare the sandbox
    await sandbox.provider.prepare(workspace);

    return sandbox;
  }

  /**
   * Execute a command in the sandbox
   */
  async executeCommand(command: string, options?: SandboxExecutionOptions): Promise<SandboxResult> {
    if (!this.provider || !this._workspace) {
      throw new Error("Sandbox not initialized. Call create() first.");
    }

    const result = await this.provider.executeCommand(command, options);

    return {
      ...result,
      providerId: this.provider.id,
      providerType: this.provider.type,
      workspace: this._workspace,
      sandboxed: this.provider.type !== "local",
    };
  }

  /**
   * Read a file from the sandbox workspace
   */
  async readFile(path: string): Promise<string> {
    if (!this.provider) {
      throw new Error("Sandbox not initialized. Call create() first.");
    }
    return this.provider.readFile(path);
  }

  /**
   * Write a file to the sandbox workspace
   */
  async writeFile(path: string, content: string): Promise<void> {
    if (!this.provider) {
      throw new Error("Sandbox not initialized. Call create() first.");
    }
    return this.provider.writeFile(path, content);
  }

  /**
   * Check if a path is allowed in the sandbox
   */
  isPathAllowed(path: string): boolean {
    if (!this.provider) return false;
    return this.provider.isPathAllowed(path);
  }

  /**
   * Clean up sandbox resources
   */
  async cleanup(): Promise<void> {
    if (this.provider) {
      await this.provider.cleanup();
    }
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

export function createSandbox(
  type: SandboxProviderType = "local",
  workspace: string,
  options?: {
    networkEnabled?: boolean;
    limits?: ResourceLimits;
    policyChecker?: (command: string) => { allowed: boolean; reason?: string };
  },
): Promise<Sandbox> {
  return Sandbox.create(type, workspace, options);
}

export function parseResourceLimits(spec: string): ResourceLimits {
  const limits: ResourceLimits = {};
  const parts = spec.split(",");
  for (const part of parts) {
    const [key, value] = part.trim().split("=");
    switch (key) {
      case "mem":
        limits.maxMemoryMB = Number(value);
        break;
      case "cpu":
        limits.maxCPUPercent = Number(value);
        break;
      case "time":
        limits.maxDurationMs = Number(value);
        break;
      case "file":
        limits.maxFileSizeMB = Number(value);
        break;
      case "fds":
        limits.maxOpenFiles = Number(value);
        break;
    }
  }
  return limits;
}
