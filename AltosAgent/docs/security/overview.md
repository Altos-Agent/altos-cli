# Security Overview

Altos is designed with security as a first-class concern.

## Permission System

Every tool execution requires explicit permission. The system supports:
- Allow/deny rules with path patterns
- Interactive permission prompts for new operations
- Configurable default policies

## Sandbox Isolation

Tools that execute external processes run in a sandbox with configurable resource limits:
- Memory limits (MB)
- CPU usage caps (%)
- Execution timeouts (ms)
- File size limits
- Open file descriptor limits

## Secret Masking

API keys, tokens, and other secrets are masked in logs and error messages by default.

## Audit Logging

Every permission decision is recorded with timestamp, session ID, and outcome.

## Future Work

- Container-based sandboxing
- Seccomp profiles
- Mandatory access control integration
