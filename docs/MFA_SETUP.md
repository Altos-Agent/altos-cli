# MFA Setup Guide

## Overview

Multi-factor authentication (MFA) uses Time-based One-Time Passwords (TOTP) via an authenticator app (Google Authenticator, Authy, etc.).

## Setup Flow

### 1. Initiate MFA Setup

The operator requests MFA setup via `POST /api/auth/mfa/setup`. This generates:
- A TOTP secret (32 bytes, base32 encoded)
- An OTP auth URI for QR code generation
- 8 recovery codes (random 8-character alphanumeric strings)

### 2. Scan QR Code

The QR code is rendered from the `qrCodeBase64` field returned by the setup endpoint. The operator scans it with their authenticator app.

### 3. Verify and Enable

The operator enters a 6-digit TOTP code from their authenticator app via `POST /api/auth/mfa/verify-setup`. If valid, MFA is enabled on the account.

### 4. Store Secrets Safely

The TOTP secret is encrypted using AES-256-GCM with a key derived from the operator's password. Recovery codes are hashed with bcrypt before storage.

## Recovery Codes

8 recovery codes are generated during setup. Each can only be used once to regain access if the authenticator is lost.

**Important**: Store recovery codes securely. They are displayed only once after QR code generation.

## Disabling MFA

To disable MFA, the operator must:
1. Complete re-authentication (`POST /api/auth/reauth`)
2. Submit a valid TOTP code (`POST /api/auth/mfa/disable`)

This prevents unauthorized MFA disabling if the account is compromised.

## Login with MFA

When MFA is enabled on an account:
1. The operator enters username/password
2. The server returns `requiresMfa: true` and a `tempSessionId`
3. The operator submits the TOTP code via `POST /api/auth/mfa/verify`
4. On success, a full session is established

## TOTP Validation

TOTP codes are validated using the RFC 6238 algorithm:
- Time step: 30 seconds
- Hash algorithm: HMAC-SHA1
- Code length: 6 digits

A grace period of 1 step (30 seconds) is allowed to account for clock skew.