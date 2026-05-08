# Basescan Links

`base-orchestrator` builds Basescan links locally from configured identifiers. The default explorer base URL is `https://basescan.org`, configurable with `BASESCAN_BASE_URL`.

Owner file: `apps/api/src/blockchain/basescan.ts`.

## Link Format

Address:

```text
https://basescan.org/address/:address
```

Transaction:

```text
https://basescan.org/tx/:txHash
```

Token:

```text
https://basescan.org/token/:tokenAddress
```

## API Endpoints

Wallet explorer link:

```http
GET /api/wallets/:id/basescan
```

Transaction explorer link:

```http
GET /api/transactions/:id/basescan
```

Wallet balances:

```http
GET /api/wallets/:id/balances
```

Chain status:

```http
GET /api/chain/status
```

Transaction rows store `basescanUrl` for submitted live swaps, approvals, and revokes. Confirmation refresh preserves existing links and generates missing links from stored transaction hashes.

## Token Address Policy

Seeded Base tokens start as placeholders when contract addresses have not been verified. The balances endpoint reports token rows with missing or invalid addresses as skipped.

Do not fill or enable token addresses until they are independently verified for Base Mainnet. Verify decimals at the same time.
