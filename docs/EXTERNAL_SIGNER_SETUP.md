# External HTTP Signer Setup

## Overview

The External HTTP Signer delegates transaction signing to an external service (e.g., Fireblocks, custom MPC node, hardened internal service). Private key material never enters the API process.

## Required Environment Variables

```bash
# Provider selection
VAULT_PROVIDER=external-http-signer

# External signer connection
EXTERNAL_SIGNER_URL=https://signer.your-domain.com
EXTERNAL_SIGNER_TOKEN=your-bearer-token

# Optional mTLS
EXTERNAL_SIGNER_MTLS=true
EXTERNAL_SIGNER_CLIENT_CERT=-----BEGIN CERTIFICATE-----\n...
EXTERNAL_SIGNER_CLIENT_KEY=-----BEGIN PRIVATE KEY-----\n...

# Optional health check
EXTERNAL_SIGNER_HEALTH_URL=https://signer.your-domain.com/health

# Signer behavior
EXTERNAL_SIGNER_SIGN_TIMEOUT_MS=30000
EXTERNAL_SIGNER_NONCE_STRATEGY=rpc  # or "managed"
```

## Signer Service Contract

Your external signer must implement:

### POST /sign

Request:
```json
{
  "from": "0x...",
  "to": "0x...",
  "value": "0",
  "data": "0x...",
  "gasLimit": "21000",
  "chainId": 8453,
  "nonce": 1
}
```

Response:
```json
{
  "v": 27,
  "r": "0x...",
  "s": "0x...",
  "hash": "0x..."  // optional — transaction hash
}
```

### GET /health

Response: `200 OK` when healthy, `503` when unavailable

### POST /wallets/import

Request:
```json
{
  "privateKey": "0x...",
  "metadata": { "name": "My Wallet" }
}
```

Response:
```json
{ "address": "0x..." }
```

### POST /wallets/register

Request:
```json
{
  "address": "0x...",
  "metadata": { "name": "Watch-only Wallet" }
}
```

Response:
```json
{ "address": "0x..." }
```

## Security Requirements

- Always use HTTPS (TLS 1.2+)
- Use mTLS for high-security environments
- Rotate bearer tokens regularly
- Monitor the health endpoint for availability