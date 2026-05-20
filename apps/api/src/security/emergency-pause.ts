import { eq } from "drizzle-orm";
import type { DbClient } from "../db/client.js";
import { localSettings } from "../db/schema.js";
import { createTelegramService } from "../notifications/telegram.js";
import { setEmergencyPauseState } from "../ops/metrics.js";
import { alertEmergencyPauseEnabled } from "../ops/alert-webhook.js";

const localSettingsId = "00000000-0000-4000-8000-000000000001";

export class EmergencyPauseError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 423,
  ) {
    super(message);
    this.name = "EmergencyPauseError";
  }
}

const getOrCreateLocalSettings = async (db: DbClient) => {
  const [existing] = await db
    .select()
    .from(localSettings)
    .where(eq(localSettings.id, localSettingsId));
  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(localSettings)
    .values({
      id: localSettingsId,
      globalEmergencyPaused: false,
    })
    .returning();
  if (!created) {
    throw new EmergencyPauseError("Failed to create local settings", 500);
  }
  return created;
};

export const getEmergencyPauseStatus = async (db: DbClient) => {
  const settings = await getOrCreateLocalSettings(db);
  return {
    globalEmergencyPaused: settings.globalEmergencyPaused === true,
    updatedAt: settings.updatedAt,
  };
};

export const isGlobalEmergencyPaused = async (db: DbClient) =>
  (await getEmergencyPauseStatus(db)).globalEmergencyPaused;

export const assertGlobalEmergencyNotPaused = async (db: DbClient) => {
  if (await isGlobalEmergencyPaused(db)) {
    throw new EmergencyPauseError("Global emergency pause is enabled");
  }
};

const setEmergencyPause = async (db: DbClient, enabled: boolean) => {
  await getOrCreateLocalSettings(db);
  const [updated] = await db
    .update(localSettings)
    .set({ globalEmergencyPaused: enabled, updatedAt: new Date() })
    .where(eq(localSettings.id, localSettingsId))
    .returning();

  if (!updated) {
    throw new EmergencyPauseError("Failed to update emergency pause", 500);
  }

  setEmergencyPauseState(enabled);
  if (enabled) {
    void alertEmergencyPauseEnabled();
    const telegram = createTelegramService(db);
    await telegram
      .notify({
        eventType: "emergency pause",
        walletName: "Global",
        walletAddress: "global",
        action: "PAUSE",
        pair: "all wallets",
        amount: "0",
        status: "PAUSED",
        txHash: null,
        basescanUrl: null,
        timestamp: new Date(),
      })
      .catch(() => undefined);
  }

  return {
    globalEmergencyPaused: updated.globalEmergencyPaused === true,
    updatedAt: updated.updatedAt,
  };
};

export const enableGlobalEmergencyPause = async (db: DbClient) =>
  await setEmergencyPause(db, true);

export const disableGlobalEmergencyPause = async (db: DbClient) =>
  await setEmergencyPause(db, false);

export const isEmergencyPauseError = (
  error: unknown,
): error is EmergencyPauseError => error instanceof EmergencyPauseError;

