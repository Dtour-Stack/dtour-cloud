export const USD_MICRO = 1_000_000;
export const STARTER_CREDIT_USD = 0.25;

export function starterCreditSignature(pubkey: string): string {
  return `starter:${pubkey}`;
}
