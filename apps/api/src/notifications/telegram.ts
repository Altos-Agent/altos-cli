import { eq } from "drizzle-orm";
import { PRODUCT_NAME } from "@base-orchestrator/shared";
import type { DbClient } from "../db/client.js";
import { telegramSettings } from "../db/schema.js";
import {
  decryptSecret,
  encryptSecret,
  loadOrCreateMasterKey
} from "../vault/wallet-vault.js";

const telegramSettingsId = "00000000-0000-4000-8000-000000000002";

export type TelegramEventType =
  | "dry-run accepted"
  | "dry-run rejected"
  | "transaction submitted"
  | "transaction confirmed"
  | "transaction failed"
  | "transaction rejected"
  | "wallet paused due to risk limit"
  | "emergency pause";

export interface TelegramSettingsResponse {
  id: string;
  enabled: boolean;
  tokenPreview: string | null;
  chatId: string | null;
  notifyOnSubmitted: boolean;
  notifyOnConfirmed: boolean;
  notifyOnFailed: boolean;
  notifyOnRejected: boolean;
  notifyOnDryRun: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateTelegramSettingsInput {
  enabled?: boolean;
  botToken?: string | null;
  chatId?: string | null;
  notifyOnSubmitted?: boolean;
  notifyOnConfirmed?: boolean;
  notifyOnFailed?: boolean;
  notifyOnRejected?: boolean;
  notifyOnDryRun?: boolean;
}

export interface TelegramNotificationPayload {
  eventType: TelegramEventType;
  walletName: string;
  walletAddress: string;
  action: string;
  pair: string;
  amount: string;
  status: string;
  txHash: string | null;
  basescanUrl: string | null;
  timestamp: Date;
}

export class TelegramNotificationError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400
  ) {
    super(message);
    this.name = "TelegramNotificationError";
  }
}

const shortenAddress = (address: string) =>
  address.length <= 14 ? address : `${address.slice(0, 6)}...${address.slice(-4)}`;

export const maskTelegramToken = (token: string) => {
  const [prefix, secret = ""] = token.split(":");
  if (!prefix || secret.length < 6) {
    return "Configured";
  }

  return `${prefix}:${secret.slice(0, 3)}...${secret.slice(-3)}`;
};

export const buildTelegramMessage = (payload: TelegramNotificationPayload) => {
  const lines = [
    PRODUCT_NAME,
    `Event: ${payload.eventType}`,
    `Wallet: ${payload.walletName} (${shortenAddress(payload.walletAddress)})`,
    `Action: ${payload.action}`,
    `Pair: ${payload.pair}`,
    `Amount: ${payload.amount}`,
    `Status: ${payload.status}`,
    `Timestamp: ${payload.timestamp.toISOString()}`
  ];

  if (payload.txHash) {
    lines.push(`Tx hash: ${payload.txHash}`);
  }
  if (payload.basescanUrl) {
    lines.push(`Basescan: ${payload.basescanUrl}`);
  }

  return lines.join("\n");
};

export const sendTelegramMessage = async ({
  botToken,
  chatId,
  text
}: {
  botToken: string;
  chatId: string;
  text: string;
}) => {
  let response: Response;

  try {
    response = await fetch(
      `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          chat_id: chatId,
          text
        })
      }
    );
  } catch {
    throw new TelegramNotificationError(
      "Telegram sendMessage request failed",
      502
    );
  }

  if (!response.ok) {
    throw new TelegramNotificationError(
      `Telegram sendMessage failed with ${response.status}`,
      502
    );
  }
};

const sanitizeSettings = async (
  row: typeof telegramSettings.$inferSelect
): Promise<TelegramSettingsResponse> => {
  let tokenPreview: string | null = null;

  if (row.encryptedBotToken) {
    const masterKey = await loadOrCreateMasterKey();
    const token = decryptSecret(row.encryptedBotToken, masterKey);
    tokenPreview = maskTelegramToken(token);
  }

  return {
    id: row.id,
    enabled: row.enabled,
    tokenPreview,
    chatId: row.chatId,
    notifyOnSubmitted: row.notifyOnSubmitted,
    notifyOnConfirmed: row.notifyOnConfirmed,
    notifyOnFailed: row.notifyOnFailed,
    notifyOnRejected: row.notifyOnRejected,
    notifyOnDryRun: row.notifyOnDryRun,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
};

const getOrCreateSettings = async (db: DbClient) => {
  const [existing] = await db
    .select()
    .from(telegramSettings)
    .where(eq(telegramSettings.id, telegramSettingsId));

  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(telegramSettings)
    .values({
      id: telegramSettingsId,
      enabled: false,
      notifyOnDryRun: true
    })
    .returning();

  if (!created) {
    throw new TelegramNotificationError("Failed to create Telegram settings", 500);
  }

  return created;
};

export const createTelegramService = (db: DbClient) => ({
  async getSettings() {
    return await sanitizeSettings(await getOrCreateSettings(db));
  },

  async updateSettings(input: UpdateTelegramSettingsInput) {
    const existing = await getOrCreateSettings(db);
    const updates: Partial<typeof telegramSettings.$inferInsert> = {
      enabled: input.enabled ?? existing.enabled,
      chatId: input.chatId === undefined ? existing.chatId : input.chatId,
      notifyOnSubmitted:
        input.notifyOnSubmitted ?? existing.notifyOnSubmitted,
      notifyOnConfirmed:
        input.notifyOnConfirmed ?? existing.notifyOnConfirmed,
      notifyOnFailed: input.notifyOnFailed ?? existing.notifyOnFailed,
      notifyOnRejected: input.notifyOnRejected ?? existing.notifyOnRejected,
      notifyOnDryRun: input.notifyOnDryRun ?? existing.notifyOnDryRun,
      updatedAt: new Date()
    };

    if (input.botToken !== undefined) {
      if (input.botToken === null || input.botToken.trim() === "") {
        updates.encryptedBotToken = null;
      } else {
        const masterKey = await loadOrCreateMasterKey();
        updates.encryptedBotToken = encryptSecret(input.botToken.trim(), masterKey);
      }
    }

    const [updated] = await db
      .update(telegramSettings)
      .set(updates)
      .where(eq(telegramSettings.id, telegramSettingsId))
      .returning();

    if (!updated) {
      throw new TelegramNotificationError("Failed to update Telegram settings", 500);
    }

    return await sanitizeSettings(updated);
  },

  async sendTest() {
    const settings = await getOrCreateSettings(db);
    if (!settings.encryptedBotToken || !settings.chatId) {
      throw new TelegramNotificationError(
        "Telegram bot token and chat ID are required"
      );
    }

    const masterKey = await loadOrCreateMasterKey();
    const botToken = decryptSecret(settings.encryptedBotToken, masterKey);
    await sendTelegramMessage({
      botToken,
      chatId: settings.chatId,
      text: `${PRODUCT_NAME}\nEvent: test notification\nTimestamp: ${new Date().toISOString()}`
    });

    return {
      ok: true,
      sentAt: new Date().toISOString()
    };
  },

  async notify(payload: TelegramNotificationPayload) {
    const settings = await getOrCreateSettings(db);
    if (!settings.enabled || !settings.encryptedBotToken || !settings.chatId) {
      return { sent: false, reason: "Telegram disabled or incomplete" };
    }

    const shouldSend =
      (payload.eventType === "dry-run accepted" ||
        payload.eventType === "dry-run rejected") &&
        settings.notifyOnDryRun
        ? true
        : payload.eventType === "transaction submitted" &&
            settings.notifyOnSubmitted
          ? true
          : payload.eventType === "transaction confirmed" &&
              settings.notifyOnConfirmed
              ? true
              : payload.eventType === "transaction failed" &&
                  settings.notifyOnFailed
                ? true
                : (payload.eventType === "transaction rejected" ||
                    payload.eventType === "wallet paused due to risk limit" ||
                    payload.eventType === "emergency pause") &&
                  settings.notifyOnRejected;

    if (!shouldSend) {
      return { sent: false, reason: "Notification preference disabled" };
    }

    const masterKey = await loadOrCreateMasterKey();
    const botToken = decryptSecret(settings.encryptedBotToken, masterKey);
    await sendTelegramMessage({
      botToken,
      chatId: settings.chatId,
      text: buildTelegramMessage(payload)
    });

    return { sent: true };
  }
});

export const isTelegramError = (
  error: unknown
): error is TelegramNotificationError =>
  error instanceof TelegramNotificationError;
