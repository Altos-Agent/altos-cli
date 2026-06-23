// @altos/sandbox - Process isolation and resource limits

// Re-export all types from provider
export type {
  ResourceLimits,
  ProcessResult,
  SandboxProviderType,
  SandboxProviderInfo,
  SandboxProvider,
  SandboxExecutionOptions,
  SandboxProviderStatus,
  SandboxResult,
  PathValidationResult,
  DenylistEntry,
  DockerSandboxConfig,
  DockerRunConfig,
  DockerMount,
} from "./provider.js";

export { DEFAULT_PATH_DENYLIST } from "./provider.js";

// Core Sandbox class
export { Sandbox, createSandbox, parseResourceLimits } from "./sandbox.js";

// Provider implementations
export {
  LocalSandboxProvider,
  createLocalSandbox,
  checkPathAgainstDenylist,
  validateWorkspaceBoundary,
} from "./local.js";
export {
  DockerSandboxProvider,
  PodmanSandboxProvider,
  createDockerSandbox,
  createPodmanSandbox,
  detectAvailableProviders,
} from "./docker.js";

// Policy integration
export {
  createSandboxPolicyChecker,
  isNetworkCommand,
  isDangerousCommand,
  getCommandRiskLevel,
  shouldAllowSandboxCommand,
  type SandboxPolicyResult,
  type SandboxPolicyConfig,
  type SandboxPermissionRequest,
} from "./policy.js";
