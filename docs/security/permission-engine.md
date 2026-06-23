# Altos Permission Engine

## Overview

The permission engine is a critical security component that controls what operations Altos can perform. It evaluates every tool call against configurable policies and requires user approval for risky operations.

## Core Principles

1. **Safe by default** - Unknown or risky operations are denied unless explicitly allowed
2. **User visibility** - Every approval request shows exactly what will happen
3. **Audit trail** - All decisions are logged for security review
4. **No hidden execution** - Nothing runs without explicit user consent

## Risk Categories

| Category | Severity | Description |
|----------|----------|-------------|
| `read` | Low | Reading files or data |
| `write` | Medium | Writing or modifying files |
| `execute` | High | Executing code or commands |
| `network` | High | Network access |
| `credential` | Critical | Access to credentials/secrets |
| `destructive` | Critical | Destructive operations (rm, etc.) |
| `remote` | High | Remote operations (git push, etc.) |
| `external_write` | Critical | Writing to external systems |

## Permission Decisions

- **allow** - Operation proceeds without prompting
- **ask** - User is prompted for approval
- **deny** - Operation is blocked immediately

## Default Policy

### Allowed by Default
- Read operations within workspace
- Safe bash commands (ls, grep, git status, etc.)

### Requires Approval
- Write operations (show diff before/after)
- Execute operations
- Network access
- Remote operations (git push)
- External system writes

### Always Denied
- Access to credentials/secrets (~/.ssh, .env, etc.)
- Destructive operations (rm -rf, chmod -R 777, etc.)
- Pipe-to-shell patterns (curl | sh)
- Privilege escalation (sudo su)

## Policy Configuration

### Global Policy (~/.altos/policy.json)
User-level policy that applies to all projects.

### Project Policy (.altos/policy.json)
Project-specific policy that overrides global policy.

### Policy Schema
```json
{
  "version": "1.0",
  "rules": [
    {
      "action": "allow|ask|deny",
      "riskCategories": ["read", "write"],
      "toolNames": ["bash", "read"],
      "pathPattern": "/workspace/**",
      "commandPattern": "git\\s+push",
      "reason": "Why this rule exists"
    }
  ],
  "defaults": {
    "read": "allow",
    "write": "ask",
    "credential": "deny"
  },
  "sessionTimeout": 1800000,
  "maxSessionApprovals": 100
}
```

## Approval Flow

When approval is required:

1. **Display Request**
   - Tool name and risk category
   - Path/command details
   - Risk level indicator (🟢🟡🟠🔴)

2. **Show Context**
   - Input summary
   - Diff for write operations
   - Affected paths

3. **User Choices**
   - `a` - Allow once (this operation only)
   - `s` - Allow for session (30 minutes)
   - `d` - Deny

4. **Confirmation**
   - Clear feedback on what was chosen
   - Decision is logged

## Audit Logging

Logs are written to `~/.altos/audit/YYYY-MM.jsonl`

Each entry contains:
```json
{
  "id": "uuid",
  "timestamp": 1234567890,
  "sessionId": "session-id",
  "request": {
    "toolName": "bash",
    "riskCategory": "remote",
    "command": "git push origin main",
    "inputSummary": "git push origin main"
  },
  "decision": "ask",
  "approvalType": "once|session|denied",
  "riskLevel": "high",
  "reason": "Remote operations require explicit approval"
}
```

### Viewing Audit Logs
```bash
# View recent decisions
cat ~/.altos/audit/2026-06.jsonl | jq

# Get statistics
altos permissions stats
```

## Dangerous Patterns

### Always Blocked
- `rm -rf *` - Recursive force remove
- `sudo su` - Privilege escalation
- `curl | sh` / `wget | sh` - Pipe to shell
- `chmod -R 777` - Recursive 777 permissions
- Access to ~/.ssh, ~/.env, /etc/shadow, /System

### Protected Paths
```
~/.ssh/*
~/.env
~/.env.*
/etc/passwd
/etc/shadow
/System/*
~/.aws/*
~/.kube/*
~/.gnupg/*
*.env
```

## CLI Integration

The permission manager integrates with the CLI tool:

```typescript
import { createPermissionManager } from '@altos/permissions';

const manager = createPermissionManager();
await manager.loadPolicies();

// Check if operation is allowed
const result = manager.evaluate(request);
if (result.decision === 'allow') {
  // Proceed
} else if (result.decision === 'ask') {
  // Request approval
  const { granted } = await manager.requestPermission(request, true);
  if (!granted) {
    // Handle denial
  }
} else {
  // Denied - block operation
}
```

## Security Considerations

1. **No execution without consent** - Every potentially harmful operation requires approval
2. **Transparent logging** - All decisions are recorded
3. **Session timeouts** - Session approvals expire to limit exposure
4. **Defense in depth** - Multiple checks (always-deny, protected paths, category defaults)
5. **Safe defaults** - Favor security over convenience

## Future Enhancements

- [ ] Rate limiting for approval prompts
- [ ] Biometric authentication for critical operations
- [ ] Policy versioning and rollback
- [ ] Centralized policy management
- [ ] Integration with secret managers
