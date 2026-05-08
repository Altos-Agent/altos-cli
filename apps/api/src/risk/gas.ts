export interface EstimatedGas {
  gasUsed: string;
  gasUsd: string;
  feeNative: string;
}

export const estimateDryRunGas = (): EstimatedGas => ({
  gasUsed: "180000",
  gasUsd: "2.50",
  feeNative: "0.0007"
});

export const checkGasLimit = ({
  estimatedGasUsd,
  walletMaxGasUsd
}: {
  estimatedGasUsd: string;
  walletMaxGasUsd: string | null;
}) => {
  if (walletMaxGasUsd === null) {
    return [];
  }

  if (Number(estimatedGasUsd) > Number(walletMaxGasUsd)) {
    return ["Estimated gas exceeds wallet max gas limit"];
  }

  return [];
};
