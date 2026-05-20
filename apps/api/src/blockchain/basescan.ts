import { getRuntimeConfig } from "../config/runtime-config.js";

const getBasescanBaseUrl = () => getRuntimeConfig().basescanBaseUrl;

const encodePathSegment = (value: string) => encodeURIComponent(value.trim());

export const buildBasescanAddressLink = (address: string) =>
  `${getBasescanBaseUrl()}/address/${encodePathSegment(address)}`;

export const buildBasescanTransactionLink = (txHash: string) =>
  `${getBasescanBaseUrl()}/tx/${encodePathSegment(txHash)}`;

export const buildBasescanTokenLink = (tokenAddress: string) =>
  `${getBasescanBaseUrl()}/token/${encodePathSegment(tokenAddress)}`;
