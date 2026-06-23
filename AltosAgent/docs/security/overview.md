# Security Overview

Altos is designed with security as a first-class concern. Every tool execution is gated, every secret is masked, and every decision is audited.

## Permission System

Every tool execution requires explicit permission. The system supports:

- **Allow/deny rules** with glob path patterns (e.g., `allow /home/user/project/src/**`, `deny /etc/**`)
- **Interactive permission prompts** for new operations not covered by a rule
- **Configurable default policies** — ask, allow, or deny by default
- **Session-scoped decisions** — remember decisions within a session

### Permission Flow

```
Tool Call Request
       │
       ▼
Permission Engine Check
       │
  ┌────┴────┐
  │ Match?  │
  └────┬────┘
   No  │  Yes
   │   │
   ▼    ▼
 Prompt  Execute
 User
   │
┌──┴──┐
│Allow│Deny
└──┬──┘
   │
   ▼
 Record & Execute
```

## Sandbox Isolation

Tools that execute external processes run in a sandbox with configurable resource limits:

| Limit | Description |
|-------|-------------|
| Memory | Maximum RAM in MB |
| CPU | CPU time cap as percentage |
| Timeout | Maximum execution time in ms |
| File size | Maximum file write size |
| FDs | Open file descriptor limit |

Supported sandbox backends:
- **Local** — `node:child_process` with resource limits
- **Docker** — Containerized execution with custom seccomp profiles
- **Podman** — Rootless container isolation

## Secret Masking

API keys, tokens, and credentials are masked in:
- Log output
- Error messages
- Telemetry events
- Audit records

Detection patterns cover common secret formats (Bearer tokens, Bearer tokens in headers, API keys, etc.).

## Audit Logging

Every permission decision is recorded with:

- Timestamp (ISO 8601)
- Session ID
- Tool name and arguments (with secret masking)
- Decision outcome (allow/deny)
- Matched policy rule (if any)

Audit logs are stored in the session directory and can be exported for compliance review.

## Security Best Practices

1. **Review permission policies** before running untrusted prompts
2. **Use sandbox mode** (`--sandbox docker`) for prompts from unknown sources
3. **Keep audit logs** for compliance and incident investigation
4. **Use environment variables** for secrets, not hardcoded values
5. **Run with minimal permissions** — deny by default and only allow what's needed

## Future Work

- Container-based sandboxing with seccomp profiles
- Mandatory access control (SELinux/AppArmor) integration
- Hardware security key support for approval escalation
- Encrypted session storage with customer-managed keys

## See Also

- [Permission Engine](../security/permission-engine.md)
- [Sandboxing](../security/sandboxing.md)
- [Example Global Policy](../security/example-global-policy.json)
