export const isDemoMode = () => process.env.DEMO_MODE === "true";

export const isDryRunEnabled = () => process.env.DRY_RUN !== "false";

export const requireLiveConfirmation = () =>
  process.env.REQUIRE_LIVE_CONFIRMATION !== "false";

export const demoModeLiveRejectionReasons = () =>
  isDemoMode() ? ["Demo mode blocks live execution"] : [];
