# Sandbox Security

This document describes the sandboxing architecture, security properties, threat model, and usage guidelines for Altos.

## Overview

Altos provides sandbox execution environments for running untrusted code and commands with varying levels of isolation:

1. **Local Sandbox** (`local`) - Process isolation with path boundary enforcement
2. **Docker Sandbox** (`docker`) - Container-based isolation with resource limits
3. **Podman Sandbox** (`podman`) - Rootless container-based isolation

## Security Properties

### Local Sandbox

| Property | Description |
|----------|-------------|
| Workspace Isolation | Commands can only read/write within the designated workspace directory |
| Path Denylist | Prevents access to sensitive paths (~/.ssh, ~/.aws, /etc/passwd, .env files, etc.) |
| Command Policy | Optional policy checker can block dangerous commands before execution |
| Timeout Enforcement | Long-running commands can be killed after a specified duration |
| Resource Limits | Optional memory and CPU limits |

### Docker/Podman Sandbox

All Local Sandbox properties, plus:

| Property | Description |
|----------|-------------|
| Network Isolation | Containers run with `--network none` by default |
| Capability Dropping | All capabilities dropped via `--cap-drop ALL` |
| No New Privileges | `--security-opt no-new-privileges` enabled |
| Read-only Mounts | Workspace mounted read-only when configured |
| Resource Limits | Memory, CPU, and PID limits enforced via container cgroups |
| Automatic Cleanup | Containers removed after execution via `--rm` flag |

## Threat Model

### Threats Addressed

1. **Path Traversal Attacks** - Prevention of `../` escaping the workspace boundary
2. **Sensitive File Access** - Blocking access to SSH keys, credentials, environment files
3. **Privilege Escalation** - Blocking `sudo su`, `chmod 777`, and similar attacks
4. **Shell Injection** - Blocking pipe-to-shell patterns like `| sh`
5. **Resource Exhaustion** - Limits on memory, CPU, time, and file descriptors
6. **Network Exfiltration** - Optional network disable to prevent data exfiltration
7. **Container Escape** - Mitigated via capability dropping and no-new-privileges

### Threats NOT Fully Addressed

1. **Malicious Input** - Commands that produce malicious output (not intercepted)
2. **Symbolic Link Attacks** - Workspace symlinks to sensitive files (workspace should be controlled)
3. **Kernel Exploits** - Container escape via kernel vulnerabilities (mitigated by container runtime)
4. **Denial of Service** - Local sandbox can still consume system resources if limits not set
5. **Information Disclosure** - Error messages may leak path or system information

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        SandboxManager                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Local     │  │   Docker    │  │       Podman            │  │
│  │  Sandbox    │  │  Sandbox    │  │       Sandbox           │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│         │                │                    │                  │
│         ▼                ▼                    ▼                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              SandboxProvider Interface                   │    │
│  │  - prepare(workspace)                                    │    │
│  │  - executeCommand(cmd, options)                          │    │
│  │  - readFile(path) / writeFile(path, content)             │    │
│  │  - isPathAllowed(path)                                   │    │
│  │  - cleanup()                                             │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  PolicyChecker  │
                    │  (optional)     │
                    └─────────────────┘
```

## Usage

### Basic Usage

```typescript
import { Sandbox } from "@altos/sandbox";

// Create a local sandbox
const sandbox = await Sandbox.create("local", "/path/to/workspace");

// Execute a command
const result = await sandbox.executeCommand("ls -la");

// Check path access
if (sandbox.isPathAllowed("/path/to/file")) {
  const content = await sandbox.readFile("relative/path");
}

// Cleanup
await sandbox.cleanup();
```

### With Resource Limits

```typescript
const sandbox = await Sandbox.create("local", workspace, {
  limits: {
    maxMemoryMB: 512,
    maxCPUPercent: 50,
    maxDurationMs: 30000,
  },
});
```

### With Docker

```typescript
const sandbox = await Sandbox.create("docker", workspace, {
  networkEnabled: false,  // Network disabled by default
  limits: { maxMemoryMB: 1024 },
  dockerConfig: {
    image: "altos/sandbox:latest",
    workdir: "/workspace",
  },
});
```

### With Policy Checker

```typescript
const sandbox = await Sandbox.create("local", workspace, {
  policyChecker: (command) => {
    // Block dangerous commands
    if (command.includes("rm -rf /")) {
      return { allowed: false, reason: "Blocked destructive command" };
    }
    return { allowed: true };
  },
});
```

## CLI Usage

```bash
# Check sandbox status
altos sandbox status

# Run command in sandbox
altos sandbox run "ls -la" --workspace /path/to/workspace

# With options
altos sandbox run "npm install" \
  --workspace /path/to/workspace \
  --provider docker \
  --limits mem=512,cpu=50,time=60000 \
  --timeout 120000 \
  --docker-image node:18-alpine
```

## Path Denylist

The following paths are blocked by default:

| Pattern | Reason |
|---------|--------|
| `../` or `..` at path start | Path traversal |
| `~/.ssh/*` | SSH credentials |
| `~/.aws/*` | AWS credentials |
| `~/.kube/*` | Kubernetes config |
| `~/.env` | Environment files |
| `*.env` | Environment files |
| `/etc/passwd` | System files |
| `/etc/shadow` | Shadow password file |
| `/System/*` | macOS system directory |
| `~/.aws/credentials` | AWS credentials file |
| `~/.docker/config.json` | Docker config |

## Docker Security Options

When using Docker sandbox, the following security options are applied:

```dockerfile
--cap-drop ALL              # Drop all Linux capabilities
--security-opt no-new-privileges  # Prevent privilege escalation
--network none              # Disable network (default)
-v /host/workspace:/workspace:ro  # Read-only workspace mount
--memory 512m               # Memory limit
--cpu-period 100000         # CPU period
--cpu-quota 50000           # 50% CPU limit
--pids-limit 100            # Limit number of processes
```

## Best Practices

1. **Always Set Resource Limits** - Prevent resource exhaustion attacks
2. **Use Docker for Untrusted Code** - Stronger isolation than local sandbox
3. **Disable Network by Default** - Enable only when needed
4. **Validate Workspace** - Ensure workspace doesn't contain symlinks to sensitive files
5. **Use Policy Checker** - Block known dangerous patterns before execution
6. **Set Appropriate Timeouts** - Prevent indefinite execution
7. **Prefer Read-only Mounts** - When write access isn't needed

## Security Checklist

When deploying sandboxed execution:

- [ ] Workspace directory has appropriate permissions
- [ ] Resource limits are configured
- [ ] Network is disabled unless explicitly required
- [ ] Policy checker blocks known dangerous commands
- [ ] Docker image is from a trusted source
- [ ] Timeout is set to prevent indefinite execution
- [ ] Audit logging is enabled for permission decisions