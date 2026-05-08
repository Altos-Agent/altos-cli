export const conservativeDefaultSlippageBps = 50;
export const estimatedDryRunSlippageBps = 50;

export const checkSlippage = ({
  requestedSlippageBps,
  maxSlippageBps
}: {
  requestedSlippageBps: number;
  maxSlippageBps: number | null;
}) => {
  const limit = maxSlippageBps ?? conservativeDefaultSlippageBps;

  if (requestedSlippageBps > limit) {
    return [`Slippage exceeds max slippage of ${limit} bps`];
  }

  return [];
};
