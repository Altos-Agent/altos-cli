# RBAC and Operator Security

## Overview

The system implements Role-Based Access Control (RBAC) for operator accounts with three permission levels.

## Roles

| Role | Permissions |
|------|-------------|
| `viewer` | Read-only access to dashboard, wallets, transactions |
| `operator` | Can execute trades, manage allowances, trigger scheduler |
| `admin` | Full access including operator management, MFA settings, emergency controls |

## Implementation

### Database Schema

The `operators` table stores operator accounts with a `role` column:

```sql
CREATE TABLE operators (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  mfa_enabled BOOLEAN DEFAULT FALSE,
  mfa_secret_encrypted TEXT,
  mfa_recovery_codes_hash TEXT[],
  mfa_enabled_at TIMESTAMPTZ,
  reauth_required BOOLEAN DEFAULT FALSE,
  reauth_expires_at TIMESTAMPTZ,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Middleware

All sensitive routes are protected by `requireOperator` middleware which:
1. Validates the session cookie
2. Verifies the operator exists and is not locked
3. Checks role permissions for the requested endpoint
4. Sets `res.locals.operator` for downstream handlers

### MFA Requirement

Operators with MFA enabled must complete TOTP verification on every sensitive action. The `requiresMfa` flag is returned during login when MFA is enabled.

### Re-authentication

For high-risk operations (e.g., wallet deletion, scheduler purge), operators must re-authenticate within a configurable time window (default: 5 minutes). The `/api/auth/reauth` endpoint validates the password and updates the `reauth_expires_at` timestamp.

## Security Considerations

- Failed login attempts are tracked; after 5 failures the account is locked for 15 minutes
- MFA recovery codes are hashed before storage
- TOTP secrets are encrypted at rest
- All sensitive routes require CSRF validation