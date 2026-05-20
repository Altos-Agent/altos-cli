export const checkPriceImpact = ({
  priceImpactBps,
  maxPriceImpactBps
}: {
  priceImpactBps: number | null | undefined;
  maxPriceImpactBps: number | null;
}) => {
  if (priceImpactBps === null || priceImpactBps === undefined) {
    return [];
  }

  if (!Number.isFinite(priceImpactBps) || priceImpactBps < 0) {
    return ["Price impact must be a non-negative finite number"];
  }

  if (maxPriceImpactBps !== null && priceImpactBps > maxPriceImpactBps) {
    return [`Price impact exceeds max price impact of ${maxPriceImpactBps} bps`];
  }

  return [];
};
