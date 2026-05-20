import net from "node:net";
import { localSettings } from "../db/schema.js";
import type { DbClient } from "../db/client.js";
import { getRuntimeConfig } from "../config/runtime-config.js";
import { getBaseChainStatus } from "../blockchain/baseClient.js";
import { isDemoMode } from "../runtime/mode.js";

export type DependencyStatus = "ok" | "degraded" | "down" | "skipped";

export interface HealthDependency {
  status: DependencyStatus;
  detail?: string;
  checkedAt: string;
}

const checkedAt = () => new Date().toISOString();

const safeError = (error: unknown) =>
  error instanceof Error ? error.name || "Error" : "UnknownError";

const withTimeout = async <T>(
  task: Promise<T>,
  timeoutMs: number,
  label: string,
) =>
  await Promise.race([
    task,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timeout`)), timeoutMs);
    }),
  ]);

export const checkDbHealth = async (
  db: DbClient,
): Promise<HealthDependency> => {
  try {
    await withTimeout(
      db.select({ id: localSettings.id }).from(localSettings),
      2_000,
      "database",
    );
    return { status: "ok", checkedAt: checkedAt() };
  } catch (error) {
    return {
      status: "down",
      detail: safeError(error),
      checkedAt: checkedAt(),
    };
  }
};

export const checkRedisHealth = async (
  redisUrl: string,
): Promise<HealthDependency> => {
  try {
    const url = new URL(redisUrl);
    const port = Number(url.port || "6379");
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        const socket = net.createConnection({
          host: url.hostname,
          port,
        });
        socket.once("connect", () => {
          socket.end();
          resolve();
        });
        socket.once("error", reject);
      }),
      2_000,
      "redis",
    );
    return { status: "ok", checkedAt: checkedAt() };
  } catch (error) {
    return {
      status: "down",
      detail: safeError(error),
      checkedAt: checkedAt(),
    };
  }
};

export const checkRpcHealth = async (): Promise<HealthDependency> => {
  if (isDemoMode()) {
    return {
      status: "skipped",
      detail: "demo mode",
      checkedAt: checkedAt(),
    };
  }

  try {
    const status = await withTimeout(getBaseChainStatus(), 3_000, "rpc");
    return {
      status: "ok",
      detail: `chain ${status.chainId} block ${status.latestBlockNumber}`,
      checkedAt: checkedAt(),
    };
  } catch (error) {
    return {
      status: "degraded",
      detail: safeError(error),
      checkedAt: checkedAt(),
    };
  }
};

export const getHealthStatus = async (db: DbClient) => {
  const config = getRuntimeConfig();
  const [database, redis, rpc] = await Promise.all([
    checkDbHealth(db),
    checkRedisHealth(config.redisUrl),
    checkRpcHealth(),
  ]);
  const dependencies = { database, redis, rpc };
  const ok = database.status === "ok" && redis.status === "ok";

  return {
    ok,
    status: ok ? "ok" : "degraded",
    dependencies,
  };
};
