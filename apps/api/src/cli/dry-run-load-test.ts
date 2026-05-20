#!/usr/bin/env node
/**
 * Dry-run provider load test
 *
 * Tests quote/RPC behavior across multiple wallets using dry-run only.
 * Never signs transactions or calls live execution endpoints.
 */

import "dotenv/config";
import { eq, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import { wallets, pairs } from "../db/schema.js";
import { getRuntimeConfig } from "../config/runtime-config.js";
import { planDryRunTrade } from "../strategy/planner.js";
import { loadTradeContext } from "../strategy/trade-context.js";
import { getQuote } from "../quote/quoteEngine.js";

interface LoadTestOptions {
  walletCount: number;
  pairId: string | undefined;
  pairSymbol: string | undefined;
  iterations: number;
  concurrency: number;
  quoteProvider: string | undefined;
  delayMs: number;
  maxErrorRate: number;
  outputJson: boolean;
  readOnly: boolean;
}

interface LoadTestResult {
  summary: {
    totalRequests: number;
    successCount: number;
    failureCount: number;
    errorRate: number;
    durationMs: number;
    timestamp: string;
    environment: {
      dryRun: boolean;
      demoMode: boolean;
      quoteProvider: string;
      walletCount: number;
      iterations: number;
      concurrency: number;
    };
  };
  latencies: Metric;
  errorBreakdown: Record<string, number>;
  provider429Count: number;
  rpcTimeoutCount: number;
  quoteValidationRejections: number;
  perWalletResults: PerWalletResult[];
}

interface Metric {
  label: string;
  p50: number;
  p95: number;
  p99: number;
  total: number;
}

interface PerWalletResult {
  walletId: string;
  walletName: string;
  walletAddress: string;
  success: boolean;
  latencyMs: number;
  error?: string | undefined;
  iteration: number;
}

function parseArgs(argv: string[]): LoadTestOptions {
  const args: [string, string][] = [];
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args.push([key, next]);
        i++;
      } else {
        args.push([key, "true"]);
      }
    }
  }
  const get = (key: string, fallback: string): string => {
    const found = args.find(([k]) => k === key);
    return found ? found[1] : fallback;
  };
  return {
    walletCount: Number(get("walletCount", "5")) || 5,
    pairId: get("pairId", "") || undefined,
    pairSymbol: get("pairSymbol", "") || undefined,
    iterations: Number(get("iterations", "3")) || 3,
    concurrency: Number(get("concurrency", "4")) || 4,
    quoteProvider: get("quoteProvider", "") || undefined,
    delayMs: Number(get("delayMs", "100")) || 100,
    maxErrorRate: Number(get("maxErrorRate", "0.5")) || 0.5,
    outputJson: get("outputJson", "") === "true" || get("outputJson", "") === "1",
    readOnly: get("readOnly", "") === "true" || get("readOnly", "") === "1",
  };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] as number;
}

function computeMetric(label: string, values: number[]): Metric {
  return {
    label,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    p99: percentile(values, 99),
    total: values.length,
  };
}

const getActiveWallets = async (count: number) => {
  const rows = await db
    .select()
    .from(wallets)
    .where(eq(wallets.status, "ACTIVE"))
    .orderBy(desc(wallets.createdAt))
    .limit(count);
  return rows;
};

/* eslint-disable @typescript-eslint/no-unused-vars */
const getPairByIdOrSymbol = async (pairId?: string, _pairSymbol?: string) => {
  if (pairId) {
    const [row] = await db.select().from(pairs).where(eq(pairs.id, pairId));
    return row ?? null;
  }
  const [row] = await db.select().from(pairs).limit(1);
  return row ?? null;
};

interface IterationResult {
  success: boolean;
  latencyMs: number;
  error?: string | undefined;
}

const runSingleIteration = async (
  wallet: typeof wallets.$inferSelect,
  pair: typeof pairs.$inferSelect,
  dryRunEnabled: boolean,
  _quoteProviderName: string
): Promise<IterationResult> => {
  const start = Date.now();
  try {
    const context = await loadTradeContext(db, {
      walletId: wallet.id,
      pairId: pair.id,
      sellAmountDisplay: "1",
    });
    if (!context) {
      return { success: false, latencyMs: Date.now() - start, error: "Context not found" };
    }

    const sellAmountRaw = context.tokenIn
      ? (BigInt(1) * BigInt(10 ** context.tokenIn.decimals)).toString()
      : "1000000";
    const quote = context.tokenIn && context.tokenOut
      ? await getQuote({
          wallet: context.wallet,
          sellToken: context.tokenIn,
          buyToken: context.tokenOut,
          sellAmountDisplay: "1",
          sellAmountRaw,
          routerName: context.pair.preferredRouter ?? null,
        })
      : null;

    const result = planDryRunTrade(
      {
        walletId: wallet.id,
        pairId: pair.id,
        sellAmountDisplay: "1",
        mode: "DRY_RUN_ONLY",
      },
      { ...context, dryRunEnabled, quote },
      new Date()
    );

    return {
      success: result.accepted,
      latencyMs: Date.now() - start,
      error: result.reasons.length > 0 ? result.reasons.join("; ") : undefined as string | undefined,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const latencyMs = Date.now() - start;

    if (
      errorMessage.includes("429") ||
      errorMessage.includes("rate limit") ||
      errorMessage.includes("Too Many Requests")
    ) {
      return { success: false, latencyMs, error: `PROVIDER_429: ${errorMessage}` };
    }
    if (
      errorMessage.includes("timeout") ||
      errorMessage.includes("ETIMEDOUT") ||
      errorMessage.includes("ECONNREFUSED")
    ) {
      return { success: false, latencyMs, error: `RPC_TIMEOUT: ${errorMessage}` };
    }
    if (
      errorMessage.includes("validation") ||
      errorMessage.includes("invalid") ||
      errorMessage.includes("unverified")
    ) {
      return { success: false, latencyMs, error: `QUOTE_VALIDATION: ${errorMessage}` };
    }
    return { success: false, latencyMs, error: errorMessage ?? undefined };
  }
};

const runLoadTest = async (options: LoadTestOptions): Promise<LoadTestResult> => {
  const config = getRuntimeConfig();
  const startTime = Date.now();

  console.error(
    `[LOAD-TEST] Starting | wallets=${options.walletCount} | iterations=${options.iterations} | concurrency=${options.concurrency}`
  );

  if (!config.dryRun && !options.readOnly) {
    throw new Error(
      "DRY_RUN=false — refusing load test. Pass --readOnly to confirm read-only dry-run test."
    );
  }

  const activeWallets = await getActiveWallets(options.walletCount);
  if (activeWallets.length === 0) {
    throw new Error("No active wallets found");
  }

  const pair = await getPairByIdOrSymbol(options.pairId, options.pairSymbol);
  if (!pair) {
    throw new Error("No pair found for load test");
  }

  const quoteProviderName = options.quoteProvider ?? config.quoteProvider ?? "mock";
  const results: PerWalletResult[] = [];
  const allLatencies: number[] = [];
  const errorCounts: Record<string, number> = {};
  let provider429Count = 0;
  let rpcTimeoutCount = 0;
  let quoteValidationRejections = 0;

  for (let iter = 0; iter < options.iterations; iter++) {
    console.error(`[LOAD-TEST] Iteration ${iter + 1}/${options.iterations}`);

    const walletBatches: typeof activeWallets[] = [];
    for (let i = 0; i < activeWallets.length; i += options.concurrency) {
      walletBatches.push(activeWallets.slice(i, i + options.concurrency));
    }

    for (const batch of walletBatches) {
      const batchResults = await Promise.all(
        batch.map((wallet) =>
          runSingleIteration(wallet, pair, config.dryRun, quoteProviderName)
        )
      );

      for (let i = 0; i < batch.length; i++) {
        const wallet = batch[i];
        const result = batchResults[i];
        if (!wallet || result === undefined) continue;

        const item: PerWalletResult = {
          walletId: wallet.id,
          walletName: wallet.name,
          walletAddress: wallet.address,
          success: result.success,
          latencyMs: result.latencyMs,
          error: result.error,
          iteration: iter + 1,
        };
        results.push(item);
        allLatencies.push(result.latencyMs);

        if (!result.success) {
          const errorKey = result.error?.split(":")[0] ?? "UNKNOWN";
          errorCounts[errorKey] = (errorCounts[errorKey] ?? 0) + 1;

          if (result.error?.startsWith("PROVIDER_429")) provider429Count++;
          else if (result.error?.startsWith("RPC_TIMEOUT")) rpcTimeoutCount++;
          else if (result.error?.startsWith("QUOTE_VALIDATION")) quoteValidationRejections++;
        }
      }

      if (options.delayMs > 0) {
        await new Promise((r) => setTimeout(r, options.delayMs));
      }
    }
  }

  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.filter((r) => !r.success).length;
  const totalRequests = results.length;
  const errorRate = totalRequests > 0 ? failureCount / totalRequests : 0;

  return {
    summary: {
      totalRequests,
      successCount,
      failureCount,
      errorRate: Math.round(errorRate * 100) / 100,
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      environment: {
        dryRun: config.dryRun,
        demoMode: config.demoMode,
        quoteProvider: quoteProviderName,
        walletCount: activeWallets.length,
        iterations: options.iterations,
        concurrency: options.concurrency,
      },
    },
    latencies: computeMetric("latencyMs", allLatencies),
    errorBreakdown: errorCounts,
    provider429Count,
    rpcTimeoutCount,
    quoteValidationRejections,
    perWalletResults: results,
  };
};

const printReport = (result: LoadTestResult, asJson: boolean) => {
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const divider = "─".repeat(60);
  console.log(`\n${divider}`);
  console.log(` DRY-RUN PROVIDER LOAD TEST REPORT`);
  console.log(`${divider}`);
  console.log(`\n Summary`);
  console.log(`   Total requests  : ${result.summary.totalRequests}`);
  console.log(`   Success         : ${result.summary.successCount}`);
  console.log(`   Failure         : ${result.summary.failureCount}`);
  console.log(`   Error rate      : ${(result.summary.errorRate * 100).toFixed(1)}%`);
  console.log(`   Duration        : ${result.summary.durationMs}ms`);
  console.log(`   Quote provider  : ${result.summary.environment.quoteProvider}`);
  console.log(`   Wallets         : ${result.summary.environment.walletCount}`);
  console.log(`   Iterations      : ${result.summary.environment.iterations}`);

  console.log(`\n Latency (ms)`);
  console.log(`   p50 : ${result.latencies.p50}`);
  console.log(`   p95 : ${result.latencies.p95}`);
  console.log(`   p99 : ${result.latencies.p99}`);

  if (result.provider429Count > 0) {
    console.log(`\n Provider 429/rate-limit events : ${result.provider429Count}`);
  }
  if (result.rpcTimeoutCount > 0) {
    console.log(`\n RPC timeouts  : ${result.rpcTimeoutCount}`);
  }
  if (result.quoteValidationRejections > 0) {
    console.log(`\n Quote validation rejections : ${result.quoteValidationRejections}`);
  }

  const errorKeys = Object.keys(result.errorBreakdown);
  if (errorKeys.length > 0) {
    console.log(`\n Error breakdown`);
    for (const key of errorKeys) {
      console.log(`   ${key}  : ${result.errorBreakdown[key]}`);
    }
  }

  const failedRows = result.perWalletResults.filter((r) => !r.success);
  if (failedRows.length > 0 && failedRows.length <= 10) {
    console.log(`\n Failed requests (${failedRows.length})`);
    for (const row of failedRows) {
      console.log(
        `   [${row.iteration}] ${row.walletName} (${row.walletAddress.slice(0, 10)}...) — ${row.error}`
      );
    }
  }

  console.log(`\n${divider}`);
  const pass = result.summary.errorRate <= 0.5;
  console.log(
    ` ${pass ? "PASS" : "FAIL"} (error rate ${(result.summary.errorRate * 100).toFixed(1)}%${pass ? "" : " > 50%"})`
  );
  console.log(`${divider}\n`);
};

const main = async () => {
  const options = parseArgs(process.argv);

  try {
    const result = await runLoadTest(options);
    printReport(result, options.outputJson);
    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (options.outputJson) {
      console.error(JSON.stringify({ error: message }, null, 2));
    } else {
      console.error(`\n[ERROR] ${message}\n`);
      console.error(`Usage: pnpm run load-test -- --walletCount 10 --iterations 3 --concurrency 4 --outputJson true\n`);
    }
    process.exit(1);
  }
};

void main();