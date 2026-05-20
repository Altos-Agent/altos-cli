import { getRuntimeConfig } from "../config/runtime-config.js";

export const isDemoMode = () => getRuntimeConfig().demoMode;

export const isDryRunEnabled = () => getRuntimeConfig().dryRun;

export const requireLiveConfirmation = () =>
  getRuntimeConfig().requireLiveConfirmation;

export const demoModeLiveRejectionReasons = () =>
  isDemoMode() ? ["Demo mode blocks live execution"] : [];
