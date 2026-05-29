import { Connection, PublicKey } from "@solana/web3.js";

/** $DTOUR SPL mint (Solana mainnet). */
export const DTOUR_MINT = "DijmsEDeTXsWCkCLkhYJNTutKaHf541xZshVrCUbcozy";

export const SOLANA_RPC_URL =
  (import.meta.env.VITE_SOLANA_RPC_URL as string | undefined) ||
  "https://api.mainnet-beta.solana.com";

/**
 * Sum the connected wallet's $DTOUR balance across all its token accounts.
 * Client-side read for immediate UX feedback — the authoritative gate is the
 * server-side check after SIWS sign-in.
 */
export async function getDtourBalance(
  owner: PublicKey | string,
  rpcUrl: string = SOLANA_RPC_URL,
): Promise<number> {
  const connection = new Connection(rpcUrl, "confirmed");
  const ownerKey = typeof owner === "string" ? new PublicKey(owner) : owner;
  const { value } = await connection.getParsedTokenAccountsByOwner(ownerKey, {
    mint: new PublicKey(DTOUR_MINT),
  });
  let total = 0;
  for (const { account } of value) {
    const amount = account.data.parsed?.info?.tokenAmount?.uiAmount;
    if (typeof amount === "number") total += amount;
  }
  return total;
}
