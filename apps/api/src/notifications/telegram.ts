import { eq } from "drizzle-orm";
import { BASE_CHAIN_ID, PRODUCT_NAME } from "@base-orchestrator/shared";
import type { DbClient } from "../db/client.js";
import { notificationDeliveries, telegramSettings } from "../db/schema.js";
import { getRuntimeConfig } from "../config/runtime-config.js";
import { assertLocalRateLimit, LocalRateLimitError } from "../http/rate-limit.js";
import { getCurrentRequestId } from "../http/request-context.js";
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
  lastTestStatus: string | null;
  lastDeliveryAt: Date | null;
  recentDeliveries: NotificationDeliveryResponse[];
  state: {
    disabled: boolean;
    tokenMissing: boolean;
    chatMissing: boolean;
  };
}

export interface UpdateTelegramSettingsInput {
  enabled?: boolean | undefined;
  botToken?: string | null | undefined;
  chatId?: string | null | undefined;
  notifyOnSubmitted?: boolean | undefined;
  notifyOnConfirmed?: boolean | undefined;
  notifyOnFailed?: boolean | undefined;
  notifyOnRejected?: boolean | undefined;
  notifyOnDryRun?: boolean | undefined;
}

export interface TelegramNotificationPayload {
  eventType: TelegramEventType;
  walletName: string;
  walletAddress: string;
  walletId?: string | null | undefined;
  action: string;
  pair: string;
  amount: string;
  status: string;
  txHash: string | null;
  basescanUrl: string | null;
  transactionId?: string | null | undefined;
  timestamp: Date;
  mode?: "DEMO" | "DRY_RUN" | "LIVE" | undefined;
  chainId?: number | undefined;
  requestId?: string | null | undefined;
  jobId?: string | null | undefined;
}

export interface NotificationDeliveryResponse {
  id: string;
  channel: string;
  eventType: string;
  status: string;
  requestId: string | null;
  jobId: string | null;
  walletId: string | null;
  transactionId: string | null;
  destinationPreview: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
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

const notificationRateLimit = {
  limit: 20,
  windowMs: 60_000
};

const shortenAddress = (address: string) =>
  address.length <= 14 ? address : `${address.slice(0, 6)}...${address.slice(-4)}`;

export const maskTelegramToken = (token: string) => {
  const [prefix, secret = ""] = token.split(":");
  if (!prefix || secret.length < 6) {
    return "Configured";
  }

  return `${prefix}:${secret.slice(0, 3)}...${secret.slice(-3)}`;
};

const modeFromRuntime = () => {
  const config = getRuntimeConfig();
  if (config.demoMode) return "DEMO" as const;
  if (config.dryRun) return "DRY_RUN" as const;
  return "LIVE" as const;
};

const destinationPreview = (chatId: string | null) =>
  chatId ? `chat:${chatId.length > 6 ? `${chatId.slice(0, 3)}...${chatId.slice(-3)}` : chatId}` : null;

const redactErrorMessage = (message: string) =>
  message
    .replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot[redacted]")
    .replace(/\d+:[A-Za-z0-9_-]{6,}/g, "[redacted-token]");

const deliveryResponse = (
  row: typeof notificationDeliveries.$inferSelect,
): NotificationDeliveryResponse => ({
  id: row.id,
  channel: row.channel,
  eventType: row.eventType,
  status: row.status,
  requestId: row.requestId,
  jobId: row.jobId,
  walletId: row.walletId,
  transactionId: row.transactionId,
  destinationPreview: row.destinationPreview,
  errorCode: row.errorCode,
  errorMessage: row.errorMessage,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const insertDelivery = async (
  db: DbClient,
  input: {
    eventType: string;
    status: "SENT" | "FAILED" | "SKIPPED";
    requestId?: string | null;
    jobId?: string | null;
    walletId?: string | null;
    transactionId?: string | null;
    destinationPreview?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  },
) => {
  const [row] = await db
    .insert(notificationDeliveries)
    .values({
      channel: "telegram",
      eventType: input.eventType,
      status: input.status,
      requestId: input.requestId ?? getCurrentRequestId(),
      jobId: input.jobId ?? null,
      walletId: input.walletId ?? null,
      transactionId: input.transactionId ?? null,
      destinationPreview: input.destinationPreview ?? null,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage
        ? redactErrorMessage(input.errorMessage)
        : null,
    })
    .returning();

  return row ? deliveryResponse(row) : null;
};

export const buildTelegramMessage = (payload: TelegramNotificationPayload) => {
  const mode = payload.mode ?? modeFromRuntime();
  const chainId = payload.chainId ?? BASE_CHAIN_ID;
  const lines = [
    PRODUCT_NAME,
    `Event: ${payload.eventType}`,
    `Mode: ${mode}`,
    `Chain: Base ${chainId}`,
    `Request ID: ${payload.requestId ?? "not available"}`,
    `Wallet: ${payload.walletName} (${shortenAddress(payload.walletAddress)})`,
    `Wallet address: ${shortenAddress(payload.walletAddress)}`,
    `Action: ${payload.action}`,
    `Pair: ${payload.pair}`,
    `Amount: ${payload.amount}`,
    `Status: ${payload.status}`,
    `Timestamp: ${payload.timestamp.toISOString()}`
  ];

  if (payload.txHash) {
    lines.push(`Tx hash: ${payload.txHash}`);
  }
  if (payload.jobId) {
    lines.push(`Job ID: ${payload.jobId}`);
  }
  if (payload.basescanUrl) {
    lines.push(`Basescan: ${payload.basescanUrl}`);
  }
  if (
    !payload.txHash &&
    (payload.status === "DRY_RUN" ||
      payload.status === "REJECTED" ||
      payload.eventType.startsWith("dry-run"))
  ) {
    lines.push("No transaction was sent");
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
  db: DbClient,
  row: typeof telegramSettings.$inferSelect
): Promise<TelegramSettingsResponse> => {
  let tokenPreview: string | null = null;

  if (row.encryptedBotToken) {
    const masterKey = await loadOrCreateMasterKey();
    const token = decryptSecret(row.encryptedBotToken, masterKey);
    tokenPreview = maskTelegramToken(token);
  }

  const deliveries = await db.select().from(notificationDeliveries);
  const telegramDeliveries = deliveries
    .filter((delivery) => delivery.channel === "telegram")
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  const lastTest = telegramDeliveries.find(
    (delivery) => delivery.eventType === "test notification",
  );

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
    updatedAt: row.updatedAt,
    lastTestStatus: lastTest?.status ?? null,
    lastDeliveryAt: telegramDeliveries[0]?.createdAt ?? null,
    recentDeliveries: telegramDeliveries.slice(0, 10).map(deliveryResponse),
    state: {
      disabled: !row.enabled,
      tokenMissing: !row.encryptedBotToken,
      chatMissing: !row.chatId,
    }
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
    return await sanitizeSettings(db, await getOrCreateSettings(db));
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

    return await sanitizeSettings(db, updated);
  },

  async sendTest() {
    const settings = await getOrCreateSettings(db);
    const requestId = getCurrentRequestId();
    if (!settings.encryptedBotToken || !settings.chatId) {
      await insertDelivery(db, {
        eventType: "test notification",
        status: "SKIPPED",
        requestId,
        destinationPreview: destinationPreview(settings.chatId),
        errorCode: !settings.encryptedBotToken
          ? "TELEGRAM_TOKEN_MISSING"
          : "TELEGRAM_CHAT_MISSING",
        errorMessage: "Telegram bot token and chat ID are required",
      });
      throw new TelegramNotificationError(
        "Telegram bot token and chat ID are required"
      );
    }

    const masterKey = await loadOrCreateMasterKey();
    const botToken = decryptSecret(settings.encryptedBotToken, masterKey);
    try {
      await sendTelegramMessage({
        botToken,
        chatId: settings.chatId,
        text: `${PRODUCT_NAME}\nEvent: test notification\nMode: ${modeFromRuntime()}\nChain: Base ${BASE_CHAIN_ID}\nRequest ID: ${requestId ?? "not available"}\nTimestamp: ${new Date().toISOString()}`
      });
      await insertDelivery(db, {
        eventType: "test notification",
        status: "SENT",
        requestId,
        destinationPreview: destinationPreview(settings.chatId),
      });
    } catch (error) {
      await insertDelivery(db, {
        eventType: "test notification",
        status: "FAILED",
        requestId,
        destinationPreview: destinationPreview(settings.chatId),
        errorCode: "TELEGRAM_SEND_FAILED",
        errorMessage:
          error instanceof Error ? error.message : "Telegram send failed",
      });
      throw error;
    }

    return {
      ok: true,
      sentAt: new Date().toISOString()
    };
  },

  async notify(payload: TelegramNotificationPayload) {
    const settings = await getOrCreateSettings(db);
    const requestId = payload.requestId ?? getCurrentRequestId();
    const deliveryBase = {
      eventType: payload.eventType,
      requestId,
      jobId: payload.jobId ?? null,
      walletId: payload.walletId ?? null,
      transactionId: payload.transactionId ?? null,
      destinationPreview: destinationPreview(settings.chatId),
    };

    if (!settings.enabled) {
      await insertDelivery(db, {
        ...deliveryBase,
        status: "SKIPPED",
        errorCode: "TELEGRAM_DISABLED",
        errorMessage: "Telegram notifications are disabled",
      });
      return { sent: false, reason: "Telegram disabled" };
    }

    if (!settings.encryptedBotToken || !settings.chatId) {
      await insertDelivery(db, {
        ...deliveryBase,
        status: "SKIPPED",
        errorCode: !settings.encryptedBotToken
          ? "TELEGRAM_TOKEN_MISSING"
          : "TELEGRAM_CHAT_MISSING",
        errorMessage: "Telegram bot token or chat ID is missing",
      });
      return { sent: false, reason: "Telegram incomplete" };
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
      await insertDelivery(db, {
        ...deliveryBase,
        status: "SKIPPED",
        errorCode: "TELEGRAM_PREFERENCE_DISABLED",
        errorMessage: "Notification preference disabled",
      });
      return { sent: false, reason: "Notification preference disabled" };
    }

    try {
      assertLocalRateLimit({
        key: "telegram:send",
        limit: notificationRateLimit.limit,
        windowMs: notificationRateLimit.windowMs,
      });
    } catch (error) {
      if (error instanceof LocalRateLimitError) {
        await insertDelivery(db, {
          ...deliveryBase,
          status: "SKIPPED",
          errorCode: "TELEGRAM_RATE_LIMITED",
          errorMessage: error.message,
        });
        return { sent: false, reason: "Telegram rate limited" };
      }
      throw error;
    }

    const masterKey = await loadOrCreateMasterKey();
    const botToken = decryptSecret(settings.encryptedBotToken, masterKey);
    try {
      await sendTelegramMessage({
        botToken,
        chatId: settings.chatId,
        text: buildTelegramMessage({
          ...payload,
          requestId,
          mode: payload.mode ?? modeFromRuntime(),
          chainId: payload.chainId ?? BASE_CHAIN_ID,
        })
      });
      await insertDelivery(db, {
        ...deliveryBase,
        status: "SENT",
      });
    } catch (error) {
      await insertDelivery(db, {
        ...deliveryBase,
        status: "FAILED",
        errorCode: "TELEGRAM_SEND_FAILED",
        errorMessage:
          error instanceof Error ? error.message : "Telegram send failed",
      });
      throw error;
    }

    return { sent: true };
  },

  async listDeliveries() {
    const rows = await db.select().from(notificationDeliveries);
    return rows
      .filter((delivery) => delivery.channel === "telegram")
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .map(deliveryResponse);
  }
});

export const isTelegramError = (
  error: unknown
): error is TelegramNotificationError =>
  error instanceof TelegramNotificationError;
