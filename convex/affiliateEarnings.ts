export function affiliateEarningsMicroForUsage({
  costMicroUsd,
  priceMicroUsd,
  shareBps,
}: {
  costMicroUsd: number;
  priceMicroUsd: number;
  shareBps: number;
}): number {
  const marginMicro = priceMicroUsd - costMicroUsd;
  if (marginMicro <= 0) return 0;
  return Math.round(marginMicro * (shareBps / 10000));
}
