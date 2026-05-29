import { v } from "convex/values";
import { action } from "./_generated/server";

const DTOUR_MINT = "DijmsEDeTXsWCkCLkhYJNTutKaHf541xZshVrCUbcozy";
const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";

/** Read a wallet's $DTOUR balance server-side (UX display). Keeps the browser
 *  off public Solana RPC (which 403s/rate-limits browser-origin requests).
 *  Pure V8 (fetch JSON-RPC) — no "use node", so it runs in the standard Convex
 *  runtime and avoids the fragile self-hosted node executor. */
export const balanceOf = action({
  args: { pubkey: v.string() },
  handler: async (_ctx, { pubkey }) => {
    const rpc = process.env.SOLANA_RPC_URL || DEFAULT_RPC;
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTokenAccountsByOwner",
        params: [
          pubkey,
          { mint: DTOUR_MINT },
          { encoding: "jsonParsed", commitment: "confirmed" },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Solana RPC error ${res.status}`);
    const json = (await res.json()) as {
      error?: { message?: string };
      result?: { value?: Array<{ account?: { data?: { parsed?: { info?: { tokenAmount?: { uiAmount?: number } } } } } }> };
    };
    if (json.error) throw new Error(json.error.message || "Solana RPC error");

    let balance = 0;
    for (const acc of json.result?.value ?? []) {
      const amount = acc.account?.data?.parsed?.info?.tokenAmount?.uiAmount;
      if (typeof amount === "number") balance += amount;
    }
    return balance;
  },
});
