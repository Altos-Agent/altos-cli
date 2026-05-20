import { BASE_CHAIN_ID } from "@base-orchestrator/shared";
import type { DbClient } from "../db/client.js";
import { getRuntimeConfig } from "../config/runtime-config.js";
import { getEmergencyPauseStatus } from "../security/emergency-pause.js";
import { getVaultStatus } from "../vault/vault-lock.js";
import { getVaultProviderStatus } from "../vault/providers/provider-registry.js";

const maskRpcUrl = (value: string) => {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ""}`;
  } catch {
    return "configured";
  }
};

export const getRuntimeStatus = async (db: DbClient) => {
  const config = getRuntimeConfig();
  const [vaultStatus, emergencyPause] = await Promise.all([
    getVaultStatus(),
    getEmergencyPauseStatus(db),
  ]);

  return {
    demoMode: config.demoMode,
    dryRun: config.dryRun,
    liveExecutionAllowed:
      !config.demoMode &&
      !config.dryRun &&
      config.requireLiveConfirmation &&
      vaultStatus.status === "UNLOCKED" &&
      !emergencyPause.globalEmergencyPaused,
    requireLiveConfirmation: config.requireLiveConfirmation,
    schedulerLiveExecution: config.schedulerLiveExecution,
    autoApprove: config.autoApprove,
    allowUnlimitedApproval: config.allowUnlimitedApproval,
    quoteProvider: config.quoteProvider,
    baseChainId: BASE_CHAIN_ID,
    baseRpcUrlMasked: maskRpcUrl(config.baseRpcUrl),
    vaultStatus,
    vaultProviderStatus: getVaultProviderStatus(),
    emergencyPaused: emergencyPause.globalEmergencyPaused,
    authEnabled: true,
  };
};
