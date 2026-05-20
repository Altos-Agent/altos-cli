import { verifyOperatorPassword } from "../auth/password.js";
import { getRuntimeConfig } from "../config/runtime-config.js";
import { setVaultLockedState } from "../ops/metrics.js";
import { alertVaultUnlock } from "../ops/alert-webhook.js";

export type VaultLockStatus = "LOCKED" | "UNLOCKED";

let unlockedUntil = 0;

export class VaultLockedError extends Error {
  constructor(message = "Vault is locked") {
    super(message);
    this.name = "VaultLockedError";
  }
}

export const getVaultStatus = () => {
  const config = getRuntimeConfig();
  if (unlockedUntil <= Date.now()) {
    unlockedUntil = 0;
  }

  return {
    status: unlockedUntil > Date.now() ? ("UNLOCKED" as const) : ("LOCKED" as const),
    autoLockMs: config.vaultAutoLockMs,
    unlockedUntil: unlockedUntil > Date.now() ? new Date(unlockedUntil) : null,
  };
};

export const isVaultUnlocked = () => getVaultStatus().status === "UNLOCKED";

export const lockVault = () => {
  unlockedUntil = 0;
  return getVaultStatus();
};

export const unlockVault = async (input: {
  username?: string;
  password?: string;
  passphrase?: string;
}) => {
  const config = getRuntimeConfig();
  const passphraseAccepted =
    config.vaultUnlockPassphrase !== null &&
    input.passphrase === config.vaultUnlockPassphrase;
  const passwordAccepted =
    input.username !== undefined &&
    input.password !== undefined &&
    (await verifyOperatorPassword(config, input.username, input.password));

  if (!passphraseAccepted && !passwordAccepted) {
    throw new VaultLockedError("Vault unlock credentials are invalid");
  }

  unlockedUntil = Date.now() + config.vaultAutoLockMs;
  setVaultLockedState(false);
  void alertVaultUnlock();
  return getVaultStatus();
};

export const assertVaultUnlocked = () => {
  if (!isVaultUnlocked()) {
    throw new VaultLockedError();
  }
};

export const requiresVaultForLiveSigning = () => {
  const config = getRuntimeConfig();
  return !config.dryRun && !config.demoMode;
};
