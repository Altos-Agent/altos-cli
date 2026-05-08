export const PRODUCT_NAME = "base-orchestrator";

export const DEFAULT_DRY_RUN = true;

export const BASE_CHAIN_ID = 8453;
export const BASESCAN_BASE_URL = "https://basescan.org";
export const BASE_NATIVE_SYMBOL = "ETH";

export const BASE_MAINNET = {
  chainId: BASE_CHAIN_ID,
  name: "Base Mainnet",
  nativeCurrency: BASE_NATIVE_SYMBOL
} as const;

export const PROHIBITED_FEATURES = [
  "sybil_evasion",
  "reward_program_manipulation",
  "wash_trading",
  "human_mimicry",
  "anti_detection",
  "platform_abuse",
  "detection_bypass_randomization"
] as const;

export type RuntimeMode = "dry-run" | "live";

export type SupportedChain = typeof BASE_MAINNET;

export interface HealthStatus {
  ok: boolean;
  service: typeof PRODUCT_NAME;
  dryRun: typeof DEFAULT_DRY_RUN;
  network: SupportedChain;
}
