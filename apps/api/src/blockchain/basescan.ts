import { BASESCAN_BASE_URL } from "@base-orchestrator/shared";

const getBasescanBaseUrl = () =>
  (process.env.BASESCAN_BASE_URL ?? BASESCAN_BASE_URL).replace(/\/+$/, "");

const encodePathSegment = (value: string) => encodeURIComponent(value.trim());

export const buildBasescanAddressLink = (address: string) =>
  `${getBasescanBaseUrl()}/address/${encodePathSegment(address)}`;

export const buildBasescanTransactionLink = (txHash: string) =>
  `${getBasescanBaseUrl()}/tx/${encodePathSegment(txHash)}`;

export const buildBasescanTokenLink = (tokenAddress: string) =>
  `${getBasescanBaseUrl()}/token/${encodePathSegment(tokenAddress)}`;
