# Dry Run Load Testing

## Overview

This guide covers load testing methodology for validating the scheduler's ability to handle multi-wallet dry-run scale.

## Test Objectives

1. **Verify retry behavior** - Transient provider errors are handled gracefully
2. **Validate circuit breaker** - Rate limiting protects the provider
3. **Confirm DLQ recording** - Failed jobs are properly recorded
4. **Ensure LIVE blocking** - Live jobs are never auto-retried
5. **Measure throughput** - 10+ wallets dry-running simultaneously

## Prerequisites

```bash
# Environment
export DATABASE_URL=postgresql://...
export REDIS_URL=redis://...
export API_PORT=8100
export SCHEDULER_LIVE_EXECUTION=false  # Must be false

# Test wallets - need at least 10 configured
# Use test wallets with small amounts
```

## Test Scenarios

### Scenario 1: Basic Multi-Wallet Scale

**Objective:** Verify 10 wallets can dry-run simultaneously

```typescript
const testScenario = async () => {
  const walletCount = 10;
  const results = [];

  for (let i = 0; i < walletCount; i++) {
    results.push(
      triggerDryRun({
        walletId: `wallet-${i}`,
        pairId: "USDC-WETH",
        amountIn: "10", // Small amount
      })
    );
  }

  // All should complete within 30 seconds
  const start = Date.now();
  await Promise.all(results);
  const duration = Date.now() - start;

  console.log(`${walletCount} dry runs completed in ${duration}ms`);
  expect(duration).toBeLessThan(30_000);
};
```

### Scenario 2: Provider Rate Limit Handling

**Objective:** Verify circuit breaker kicks in before hitting hard limits

```typescript
const testRateLimitHandling = async () => {
  const breaker = getCircuitBreaker();

  // Send 20 rapid requests
  for (let i = 0; i < 20; i++) {
    await withCircuitBreaker(() => mockQuoteProvider.getQuote());
  }

  const metrics = breaker.getMetrics();

  // After ~10 requests/second limit, requests should be rejected
  expect(metrics.rejectedRequests).toBeGreaterThan(0);
  expect(metrics.state).toBe("OPEN"); // Or cooldown
};
```

### Scenario 3: Retry Behavior with Transient Errors

**Objective:** Verify retry with exponential backoff

```typescript
const testRetryBehavior = async () => {
  let attemptCount = 0;
  const maxAttempts = 3;

  vi.mocked(mockQuoteProvider.getQuote).mockImplementation(() => {
    attemptCount++;
    if (attemptCount < maxAttempts) {
      throw new ProviderTimeoutError({
        provider: "mock",
        chainId: 8453,
        retryable: true,
      });
    }
    return Promise.resolve(mockQuote);
  });

  // Trigger dry run - should retry up to 3 times
  await triggerDryRun({ walletId: "test-wallet" });

  expect(attemptCount).toBeGreaterThanOrEqual(3);
};
```

### Scenario 4: Non-Retryable Errors Go to DLQ

**Objective:** Verify safety errors don't retry

```typescript
const testNonRetryableError = async () => {
  vi.mocked(mockQuoteProvider.getQuote).mockImplementation(() => {
    throw new HighSlippageError({
      provider: "mock",
      chainId: 8453,
      slippageBps: 500,
      threshold: 100,
      retryable: false,
    });
  });

  await triggerDryRun({ walletId: "test-wallet" });

  // Should record to DLQ but NOT retry
  expect(recordDeadLetterJob).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      errorCode: "HIGH_SLIPPAGE",
      retryable: false,
    })
  );
  expect(attemptCount).toBe(1); // No retries
};
```

### Scenario 5: LIVE Jobs Never Replayed

**Objective:** Verify live mode blocks all retry

```typescript
const testLiveJobBlocking = async () => {
  // Attempt to replay a LIVE job
  const result = await replayDeadLetterJob(db, {
    id: "live-job-dlq-id",
    queues: mockQueues,
  });

  expect(result.success).toBe(false);
  expect(result.message).toContain("Cannot replay LIVE jobs");
};
```

### Scenario 6: DLQ Payload Redaction

**Objective:** Verify sensitive data is never stored

```typescript
const testDlqRedaction = async () => {
  const payload = {
    walletId: "wallet-1",
    apiKey: "secret-key",        // Should be redacted
    privateKey: "0xdead...",    // Should be redacted
    rpcUrl: "https://secret.io", // Should be redacted
  };

  await recordDeadLetterJob(db, {
    ...params,
    payload,
  });

  // Verify DLQ only contains safe fields
  const dlqEntry = getRecordedDlqEntry();
  expect(dlqEntry.payloadPreviewJson).toHaveProperty("walletId");
  expect(dlqEntry.payloadPreviewJson).not.toHaveProperty("apiKey");
  expect(dlqEntry.payloadPreviewJson).not.toHaveProperty("privateKey");
};
```

## Load Test Harness

```typescript
// load-test.ts
interface LoadTestConfig {
  walletCount: number;
  requestsPerWallet: number;
  thinkTimeMs: number;
  injectErrors: boolean;
  errorRate: number; // 0.0 - 1.0
}

export const runLoadTest = async (config: LoadTestConfig) => {
  const startTime = Date.now();
  const results = [];

  for (let i = 0; i < config.walletCount; i++) {
    const walletResults = [];

    for (let j = 0; j < config.requestsPerWallet; j++) {
      walletResults.push(
        simulateDryRun({
          walletId: `load-test-wallet-${i}`,
          injectError: config.injectErrors && Math.random() < config.errorRate,
        })
      );

      await sleep(config.thinkTimeMs);
    }

    results.push(Promise.all(walletResults));
  }

  await Promise.all(results);

  return {
    duration: Date.now() - startTime,
    totalRequests: config.walletCount * config.requestsPerWallet,
    results,
    metrics: gatherMetrics(),
  };
};
```

## Success Criteria

| Metric | Target | Acceptable Range |
|--------|--------|------------------|
| Throughput | 10 wallets/30s | > 5 wallets/30s |
| Error rate | < 5% | < 10% |
| DLQ growth | Stable | No continuous growth |
| Circuit breaker activations | Controlled | Not on every run |
| Retry count | 1-3 per failure | 1-5 per failure |

## Monitoring During Load Test

```bash
# Watch queue depths
watch -n 1 'curl -s http://localhost:8100/api/scheduler/status | jq .queues'

# Watch DLQ
watch -n 1 'curl -s http://localhost:8100/api/scheduler/status | jq .dlq'

# Watch circuit breaker
watch -n 1 'curl -s http://localhost:8100/api/scheduler/status | jq .provider'
```

## Cleanup

```bash
# Purge queues after test
curl -X POST http://localhost:8100/api/scheduler/purge \
  -H "Content-Type: application/json" \
  -d '{"confirm": "PURGE SCHEDULER QUEUES"}'

# Clear DLQ
curl -X POST http://localhost:8100/api/dlq/purge \
  -H "Content-Type: application/json" \
  -d '{"confirm": "PURGE DLQ"}'
```