# Verified Registry Workflow

Date: 2026-05-20

Live-impacting paths must not use records because they are merely `enabled`. Tokens, pairs, routers, spenders, transaction targets, and allowance targets must be explicitly `VERIFIED` with operator evidence before live approve, revoke, or execute-once can proceed.

## Status Model

- `UNVERIFIED`: Default state. Safe for review and dry-run metadata, not live use.
- `VERIFIED`: Operator has checked the Base contract and saved evidence. Required for live use.
- `PLACEHOLDER`: Demo or seed-only record. Never live usable.
- `BLOCKED`: Known unsafe or intentionally prohibited. Cannot be enabled.

## Evidence Fields

Every `VERIFIED` record requires:

- `verificationSource`: Where the operator verified the record, such as Basescan, official docs, or a provider response.
- `verificationEvidenceUrl`: Direct evidence URL.
- `verifiedBy`: Operator identifier.
- `verifiedAt`: Set by the API when a record is marked `VERIFIED`.
- `verificationNotes`: Optional notes for decimals, spender, selector, or source checks.

## Live Enforcement

Live approve/revoke requires:

- Token `verificationStatus=VERIFIED`.
- Router `verificationStatus=VERIFIED`.
- Router allowance target/spender is verified and exactly matches the configured spender.
- Base chain id `8453`.
- No placeholder or zero addresses.

Live execute-once requires:

- Pair `verificationStatus=VERIFIED`.
- Input and output token `verificationStatus=VERIFIED`.
- Quote chain id `8453`.
- Quote sell/buy token addresses match the pair.
- Quote sell amount raw matches the request.
- Quote `tx.to` matches the verified router transaction target.
- Quote allowance target/spender matches the verified router allowance target.
- Quote native value is zero unless explicitly enabled by runtime config.
- Quote is not expired.
- Function selector is allowlisted when a router allowlist exists.

## Reset Rules

Changing sensitive fields resets verification to `UNVERIFIED` unless the same request provides new verification evidence:

- Token address.
- Token decimals.
- Router address.
- Router spender address.
- Router transaction target.
- Router allowance target.
- Router function selector allowlist.
- Pair token direction or selected routers.

## Live Scheduler No-Go

Live scheduler remains a no-go if any live signing path can bypass this registry workflow. Scheduler automation must inherit the same verified registry checks before any future live implementation.
