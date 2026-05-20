import { and, eq } from "drizzle-orm";
import {
  createWalletClient,
  erc20Abi,
  formatUnits,
  http,
  isAddress,
  maxUint256,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { BASE_CHAIN_ID } from "@base-orchestrator/shared";
import { getRuntimeConfig } from "../config/runtime-config.js";
import { buildBasescanTransactionLink } from "../blockchain/basescan.js";
import { baseMainnet, basePublicClient } from "../blockchain/baseClient.js";
import type { DbClient } from "../db/client.js";
import { routers, tokens, transactions, wallets } from "../db/schema.js";
import { createTelegramService } from "../notifications/telegram.js";
import {
  assertPrivateKeyMatchesAddress,
  decryptPrivateKey,
  loadOrCreateMasterKey,
} from "../vault/wallet-vault.js";
import {
  demoModeLiveRejectionReasons,
  isDemoMode,
  isDryRunEnabled,
  requireLiveConfirmation,
} from "../runtime/mode.js";
import {
  allowUnlimitedApproval,
  parseApprovalAmount,
  validateApprovalAmount,
} from "./approval-policy.js";
import {
  assertRouterVerifiedForLive,
  assertSpenderVerifiedForLive,
  assertTokenVerifiedForLive,
  routerAllowanceTargetAddress,
} from "../risk/verification.js";
import { NonceReservationService, NonceReservationError } from "../nonce/nonce-reservation.js";

export class ApprovalServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = "ApprovalServiceError";
  }
}

export interface ApprovalRequestInput {
  tokenId: string;
  routerId: string;
  amount?: string | undefined;
  confirmLiveExecution?: boolean | undefined;
  transactionRequestId?: string | undefined;
}

const liveWriteRejectionReasons = (confirmLiveExecution?: boolean) => [
  ...demoModeLiveRejectionReasons(),
  ...(isDryRunEnabled() ? ["Global DRY_RUN must be false"] : []),
  ...(requireLiveConfirmation() && confirmLiveExecution !== true
    ? ["Live execution confirmation is required"]
    : []),
];

const loadApprovalContext = async (
  db: DbClient,
  walletId: string,
  tokenId: string,
  routerId: string,
) => {
  const [wallet, token, router] = await Promise.all([
    db.select().from(wallets).where(eq(wallets.id, walletId)),
    db
      .select()
      .from(tokens)
      .where(and(eq(tokens.id, tokenId), eq(tokens.chainId, BASE_CHAIN_ID))),
    db
      .select()
      .from(routers)
      .where(and(eq(routers.id, routerId), eq(routers.chainId, BASE_CHAIN_ID))),
  ]);

  const loadedWallet = wallet[0];
  const loadedToken = token[0];
  const loadedRouter = router[0];

  if (!loadedWallet) {
    throw new ApprovalServiceError("Wallet not found", 404);
  }
  if (!loadedToken) {
    throw new ApprovalServiceError("Token not found", 404);
  }
  if (!loadedRouter) {
    throw new ApprovalServiceError("Router not found", 404);
  }
  if (!loadedToken.address || !isAddress(loadedToken.address)) {
    throw new ApprovalServiceError("Token contract address must be verified");
  }
  if (!loadedRouter.address || !isAddress(loadedRouter.address)) {
    throw new ApprovalServiceError("Router contract address must be verified");
  }
  if (!loadedRouter.enabled) {
    throw new ApprovalServiceError("Router is disabled");
  }
  try {
    assertTokenVerifiedForLive(loadedToken);
    assertRouterVerifiedForLive(loadedRouter);
    assertSpenderVerifiedForLive({
      spenderAddress: routerAllowanceTargetAddress(loadedRouter),
      router: loadedRouter,
    });
  } catch (error) {
    throw new ApprovalServiceError(
      error instanceof Error ? error.message : "Token/router verification failed",
      400
    );
  }

  return {
    wallet: loadedWallet,
    token: loadedToken,
    router: loadedRouter,
  };
};

export const getTokenAllowance = async ({
  tokenAddress,
  owner,
  spender,
}: {
  tokenAddress: string;
  owner: string;
  spender: string;
}) =>
  await basePublicClient.readContract({
    address: tokenAddress as Address,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner as Address, spender as Address],
  });

const storeApprovalTransaction = async ({
  db,
  walletId,
  action,
  routerName,
  tokenSymbol,
  rawAmount,
  txHash,
  basescanUrl,
  status,
  errorMessage,
  requestId,
}: {
  db: DbClient;
  walletId: string;
  action: "APPROVE" | "REVOKE";
  routerName: string;
  tokenSymbol: string;
  rawAmount: string;
  txHash: string | null;
  basescanUrl: string | null;
  status: "SUBMITTED" | "FAILED" | "REJECTED";
  errorMessage: string | null;
  requestId?: string | null;
}) => {
  const [transaction] = await db
    .insert(transactions)
    .values({
      walletId,
      requestId: requestId ?? null,
      pairId: null,
      chainId: BASE_CHAIN_ID,
      txHash,
      status,
      action,
      router: routerName,
      tokenIn: tokenSymbol,
      tokenOut: null,
      amountIn: rawAmount,
      amountInRaw: rawAmount,
      amountInUsd: null,
      amountOut: null,
      amountOutRaw: null,
      amountOutUsd: null,
      gasUsed: null,
      gasUsd: null,
      feeNative: null,
      errorMessage,
      basescanUrl,
    })
    .returning();

  return transaction;
};

const notifyApproval = async ({
  db,
  walletName,
  walletAddress,
  action,
  tokenSymbol,
  routerName,
  amount,
  status,
  txHash,
  basescanUrl,
}: {
  db: DbClient;
  walletName: string;
  walletAddress: string;
  action: "APPROVE" | "REVOKE";
  tokenSymbol: string;
  routerName: string;
  amount: string;
  status: string;
  txHash: string | null;
  basescanUrl: string | null;
}) => {
  const telegram = createTelegramService(db);
  await telegram.notify({
    eventType:
      status === "SUBMITTED"
        ? "transaction submitted"
        : status === "FAILED"
          ? "transaction failed"
          : "transaction rejected",
    walletName,
    walletAddress,
    action,
    pair: `${tokenSymbol}/${routerName}`,
    amount,
    status,
    txHash,
    basescanUrl,
    timestamp: new Date(),
  });
};

const signAndSubmitApproval = async ({
  wallet,
  tokenAddress,
  spender,
  rawAmount,
  nonce,
}: {
  wallet: typeof wallets.$inferSelect;
  tokenAddress: string;
  spender: string;
  rawAmount: string;
  nonce?: number;
}) => {
  const masterKey = await loadOrCreateMasterKey();
  const privateKey = decryptPrivateKey(wallet.encryptedPrivateKey, masterKey);
  assertPrivateKeyMatchesAddress(privateKey, wallet.address);
  const account = privateKeyToAccount(privateKey as Hex);
  const amount = BigInt(rawAmount);
  const simulation = await basePublicClient.simulateContract({
    account,
    address: tokenAddress as Address,
    abi: erc20Abi,
    functionName: "approve",
    args: [spender as Address, amount],
  });
  const walletClient = createWalletClient({
    account,
    chain: baseMainnet,
    transport: http(getRuntimeConfig().baseRpcUrl),
    ...(nonce !== undefined ? { nonce } : {}),
  });

  return await walletClient.writeContract(simulation.request);
};

let _nonceReservation: NonceReservationService | null = null;
const getNonceReservation = (db: DbClient) => {
  if (!_nonceReservation) _nonceReservation = new NonceReservationService(db);
  return _nonceReservation;
};

export const createApprovalService = (db: DbClient) => ({
  async listWalletAllowances(walletId: string) {
    const [wallet] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.id, walletId));
    if (!wallet) {
      throw new ApprovalServiceError("Wallet not found", 404);
    }

    const [tokenRows, routerRows] = await Promise.all([
      db.select().from(tokens).where(eq(tokens.chainId, BASE_CHAIN_ID)),
      db.select().from(routers).where(eq(routers.chainId, BASE_CHAIN_ID)),
    ]);

    const rows = await Promise.all(
      tokenRows.flatMap((token) =>
        routerRows.map(async (router) => {
          const skippedReason =
            !token.address || !isAddress(token.address)
              ? "Token contract address is not verified"
              : !router.address || !isAddress(router.address)
                ? "Router contract address is not verified"
                : null;
          const rawAllowance = isDemoMode()
            ? 0n
            : skippedReason
            ? null
              : await getTokenAllowance({
                  tokenAddress: token.address as string,
                  owner: wallet.address,
                  spender: routerAllowanceTargetAddress(router) as string,
                });
          const allowanceRaw = rawAllowance?.toString() ?? null;
          const isUnlimited = rawAllowance === maxUint256;

          return {
            token: {
              id: token.id,
              symbol: token.symbol,
              name: token.name,
              address: token.address,
              decimals: token.decimals,
              enabled: token.enabled,
            },
            router: {
              id: router.id,
              name: router.name,
              address: router.address,
              allowanceTargetAddress: routerAllowanceTargetAddress(router),
              enabled: router.enabled,
            },
            allowanceRaw,
            allowanceFormatted:
              rawAllowance === undefined || rawAllowance === null
                ? null
                : formatUnits(rawAllowance, token.decimals),
            isNonZero:
              rawAllowance !== undefined &&
              rawAllowance !== null &&
              rawAllowance > 0n,
            isUnlimited,
            skippedReason,
          };
        }),
      ),
    );

    return rows;
  },

  async approve(walletId: string, input: ApprovalRequestInput) {
    if (!input.amount) {
      throw new ApprovalServiceError("Approval amount is required");
    }

    const context = await loadApprovalContext(
      db,
      walletId,
      input.tokenId,
      input.routerId,
    );
    let rawAmount: string;
    try {
      rawAmount = parseApprovalAmount(input.amount, context.token.decimals);
    } catch {
      throw new ApprovalServiceError(
        "Approval amount must be a valid token amount",
      );
    }
    const reasons = [
      ...liveWriteRejectionReasons(input.confirmLiveExecution),
      ...validateApprovalAmount({
        rawAmount,
        allowUnlimitedApproval: allowUnlimitedApproval(),
      }),
    ];

    if (reasons.length > 0) {
      const transaction = await storeApprovalTransaction({
        db,
        walletId,
        action: "APPROVE",
        routerName: context.router.name,
        tokenSymbol: context.token.symbol,
        rawAmount,
        txHash: null,
        basescanUrl: null,
        status: "REJECTED",
        errorMessage: reasons.join("; "),
        requestId: input.transactionRequestId ?? null,
      });

      return {
        accepted: false,
        rejected: true,
        reasons,
        status: "REJECTED" as const,
        txHash: null,
        basescanUrl: null,
        transactionId: transaction?.id ?? null,
      };
    }

    // Check wallet can submit (no active lock) before signing
    const canSubmit = await getNonceReservation(db).canWalletSubmit(walletId);
    if (!canSubmit.canSubmit) {
      const transaction = await storeApprovalTransaction({
        db,
        walletId,
        action: "APPROVE",
        routerName: context.router.name,
        tokenSymbol: context.token.symbol,
        rawAmount,
        txHash: null,
        basescanUrl: null,
        status: "REJECTED",
        errorMessage: canSubmit.reason ?? "Wallet cannot submit",
        requestId: input.transactionRequestId ?? null,
      });
      return {
        accepted: false,
        rejected: true,
        reasons: [canSubmit.reason ?? "Wallet cannot submit"],
        status: "REJECTED" as const,
        txHash: null,
        basescanUrl: null,
        transactionId: transaction?.id ?? null,
      };
    }

    // Reserve nonce
    let nonceReservationResult: { reservationId: string; nonce: number } | null = null;
    try {
      nonceReservationResult = await getNonceReservation(db).reserveNonceForWallet(
        walletId,
        BASE_CHAIN_ID,
        "LIVE_APPROVE",
        true,
      );
    } catch (err) {
      if (err instanceof NonceReservationError) {
        const transaction = await storeApprovalTransaction({
          db,
          walletId,
          action: "APPROVE",
          routerName: context.router.name,
          tokenSymbol: context.token.symbol,
          rawAmount,
          txHash: null,
          basescanUrl: null,
          status: "REJECTED",
          errorMessage: err.message,
          requestId: input.transactionRequestId ?? null,
        });
        return {
          accepted: false,
          rejected: true,
          reasons: [err.message],
          status: "REJECTED" as const,
          txHash: null,
          basescanUrl: null,
          transactionId: transaction?.id ?? null,
        };
      }
      throw err;
    }

    try {
      const txHash = await signAndSubmitApproval({
        wallet: context.wallet,
        tokenAddress: context.token.address as string,
        spender: routerAllowanceTargetAddress(context.router) as string,
        rawAmount,
        nonce: nonceReservationResult.nonce,
      });
      await getNonceReservation(db).attachSubmittedTx(walletId, nonceReservationResult.reservationId, txHash);
      const basescanUrl = buildBasescanTransactionLink(txHash);
      const transaction = await storeApprovalTransaction({
        db,
        walletId,
        action: "APPROVE",
        routerName: context.router.name,
        tokenSymbol: context.token.symbol,
        rawAmount,
        txHash,
        basescanUrl,
        status: "SUBMITTED",
        errorMessage: null,
        requestId: input.transactionRequestId ?? null,
      });
      await notifyApproval({
        db,
        walletName: context.wallet.name,
        walletAddress: context.wallet.address,
        action: "APPROVE",
        tokenSymbol: context.token.symbol,
        routerName: context.router.name,
        amount: input.amount,
        status: "SUBMITTED",
        txHash,
        basescanUrl,
      }).catch(() => undefined);

      return {
        accepted: true,
        rejected: false,
        reasons: [],
        status: "SUBMITTED" as const,
        txHash,
        basescanUrl,
        transactionId: transaction?.id ?? null,
      };
    } catch {
      const transaction = await storeApprovalTransaction({
        db,
        walletId,
        action: "APPROVE",
        routerName: context.router.name,
        tokenSymbol: context.token.symbol,
        rawAmount,
        txHash: null,
        basescanUrl: null,
        status: "FAILED",
        errorMessage: "Approval signing or submission failed",
        requestId: input.transactionRequestId ?? null,
      });
      await notifyApproval({
        db,
        walletName: context.wallet.name,
        walletAddress: context.wallet.address,
        action: "APPROVE",
        tokenSymbol: context.token.symbol,
        routerName: context.router.name,
        amount: input.amount,
        status: "FAILED",
        txHash: null,
        basescanUrl: null,
      }).catch(() => undefined);

      return {
        accepted: false,
        rejected: true,
        reasons: ["Approval signing or submission failed"],
        status: "FAILED" as const,
        txHash: null,
        basescanUrl: null,
        transactionId: transaction?.id ?? null,
      };
    }
  },

  async revoke(walletId: string, input: ApprovalRequestInput) {
    const context = await loadApprovalContext(
      db,
      walletId,
      input.tokenId,
      input.routerId,
    );
    const rawAmount = "0";
    const reasons = liveWriteRejectionReasons(input.confirmLiveExecution);

    if (reasons.length > 0) {
      const transaction = await storeApprovalTransaction({
        db,
        walletId,
        action: "REVOKE",
        routerName: context.router.name,
        tokenSymbol: context.token.symbol,
        rawAmount,
        txHash: null,
        basescanUrl: null,
        status: "REJECTED",
        errorMessage: reasons.join("; "),
        requestId: input.transactionRequestId ?? null,
      });

      return {
        accepted: false,
        rejected: true,
        reasons,
        status: "REJECTED" as const,
        txHash: null,
        basescanUrl: null,
        transactionId: transaction?.id ?? null,
      };
    }

    // Check wallet can submit (no active lock) before signing
    const canSubmit = await getNonceReservation(db).canWalletSubmit(walletId);
    if (!canSubmit.canSubmit) {
      const transaction = await storeApprovalTransaction({
        db,
        walletId,
        action: "REVOKE",
        routerName: context.router.name,
        tokenSymbol: context.token.symbol,
        rawAmount,
        txHash: null,
        basescanUrl: null,
        status: "REJECTED",
        errorMessage: canSubmit.reason ?? "Wallet cannot submit",
        requestId: input.transactionRequestId ?? null,
      });
      return {
        accepted: false,
        rejected: true,
        reasons: [canSubmit.reason ?? "Wallet cannot submit"],
        status: "REJECTED" as const,
        txHash: null,
        basescanUrl: null,
        transactionId: transaction?.id ?? null,
      };
    }

    // Reserve nonce
    let nonceReservationResult: { reservationId: string; nonce: number } | null = null;
    try {
      nonceReservationResult = await getNonceReservation(db).reserveNonceForWallet(
        walletId,
        BASE_CHAIN_ID,
        "LIVE_REVOKE",
        true,
      );
    } catch (err) {
      if (err instanceof NonceReservationError) {
        const transaction = await storeApprovalTransaction({
          db,
          walletId,
          action: "REVOKE",
          routerName: context.router.name,
          tokenSymbol: context.token.symbol,
          rawAmount,
          txHash: null,
          basescanUrl: null,
          status: "REJECTED",
          errorMessage: err.message,
          requestId: input.transactionRequestId ?? null,
        });
        return {
          accepted: false,
          rejected: true,
          reasons: [err.message],
          status: "REJECTED" as const,
          txHash: null,
          basescanUrl: null,
          transactionId: transaction?.id ?? null,
        };
      }
      throw err;
    }

    try {
      const txHash = await signAndSubmitApproval({
        wallet: context.wallet,
        tokenAddress: context.token.address as string,
        spender: routerAllowanceTargetAddress(context.router) as string,
        rawAmount,
        nonce: nonceReservationResult.nonce,
      });
      await getNonceReservation(db).attachSubmittedTx(walletId, nonceReservationResult.reservationId, txHash);
      const basescanUrl = buildBasescanTransactionLink(txHash);
      const transaction = await storeApprovalTransaction({
        db,
        walletId,
        action: "REVOKE",
        routerName: context.router.name,
        tokenSymbol: context.token.symbol,
        rawAmount,
        txHash,
        basescanUrl,
        status: "SUBMITTED",
        errorMessage: null,
        requestId: input.transactionRequestId ?? null,
      });
      await notifyApproval({
        db,
        walletName: context.wallet.name,
        walletAddress: context.wallet.address,
        action: "REVOKE",
        tokenSymbol: context.token.symbol,
        routerName: context.router.name,
        amount: "0",
        status: "SUBMITTED",
        txHash,
        basescanUrl,
      }).catch(() => undefined);

      return {
        accepted: true,
        rejected: false,
        reasons: [],
        status: "SUBMITTED" as const,
        txHash,
        basescanUrl,
        transactionId: transaction?.id ?? null,
      };
    } catch {
      const transaction = await storeApprovalTransaction({
        db,
        walletId,
        action: "REVOKE",
        routerName: context.router.name,
        tokenSymbol: context.token.symbol,
        rawAmount,
        txHash: null,
        basescanUrl: null,
        status: "FAILED",
        errorMessage: "Revoke signing or submission failed",
        requestId: input.transactionRequestId ?? null,
      });
      await notifyApproval({
        db,
        walletName: context.wallet.name,
        walletAddress: context.wallet.address,
        action: "REVOKE",
        tokenSymbol: context.token.symbol,
        routerName: context.router.name,
        amount: "0",
        status: "FAILED",
        txHash: null,
        basescanUrl: null,
      }).catch(() => undefined);

      return {
        accepted: false,
        rejected: true,
        reasons: ["Revoke signing or submission failed"],
        status: "FAILED" as const,
        txHash: null,
        basescanUrl: null,
        transactionId: transaction?.id ?? null,
      };
    }
  },
});

export const isApprovalError = (
  error: unknown,
): error is ApprovalServiceError => error instanceof ApprovalServiceError;
