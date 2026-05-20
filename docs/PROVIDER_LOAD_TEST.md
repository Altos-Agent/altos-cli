# Provider Load Test

Dry-run load test for quote providers and RPC behavior across multiple wallets. Safe for local testing — never signs transactions or enables live trading.

## Usage

```bash
cd apps/api
pnpm run load-test -- --walletCount 10 --iterations 3 --concurrency 4
```

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--walletCount` | 5 | Number of active wallets to test |
| `--iterations` | 3 | Repeat cycles per wallet |
| `--concurrency` | 4 | Parallel wallet requests per batch |
| `--delayMs` | 100 | Delay between batches (ms) |
| `--pairId` | auto | Use specific pair by ID |
| `--pairSymbol` | auto | Use pair by token symbol |
| `--quoteProvider` | config | Override quote provider (`mock` or `zeroX`) |
| `--maxErrorRate` | 0.5 | Fail test if error rate exceeds this |
| `--outputJson` | false | Emit machine-readable JSON to stdout |
| `--readOnly` | false | Override DRY_RUN=false safety gate |

## Safety

- **Never signs transactions** — only dry-run planner calls
- **Never calls execute/approve/revoke** — only quotes and dry-run plans
- **Requires DRY_RUN=true** unless `--readOnly` is passed
- **No private key access** — only wallet IDs from DB
- **No live scheduler interaction**

## Output

```
────────────────────────────────────────────────────────────
 DRY-RUN PROVIDER LOAD TEST REPORT
────────────────────────────────────────────────────────────

 Summary
   Total requests  : 30
   Success         : 30
   Failure         : 0
   Error rate      : 0.0%
   Duration        : 1247ms
   Quote provider  : mock
   Wallets         : 10
   Iterations      : 3

 Latency (ms)
   p50 : 12
   p95 : 89
   p99 : 134

────────────────────────────────────────────────────────────
 PASS (error rate 0.0% <= 50%)
────────────────────────────────────────────────────────────
```

## Metrics Collected

| Metric | Description |
|--------|-------------|
| Total requests | All dry-run plan calls |
| Success/failure count | Passed vs rejected plans |
| Error rate | Failures / total |
| p50/p95/p99 latency | Quote + plan round-trip |
| Provider 429 count | Rate-limit events |
| RPC timeout count | Network timeout events |
| Quote validation rejections | Invalid quote responses |
| Per-wallet breakdown | Per-wallet success/failure by iteration |

## Environment Requirements

- API server running (`pnpm dev`)
- Active wallets seeded in DB
- `DRY_RUN=true` (default in dev)
- Redis for queue health (optional)