"use node";

import { Connection, PublicKey } from "@solana/web3.js";
import { v } from "convex/values";
import { action } from "./_generated/server";

const DTOUR_MINT = "DijmsEDeTXsWCkCLkhYJNTutKaHf541xZshVrCUbcozy";
const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";

/** Read a wallet's $DTOUR balance server-side (UX display). Keeps the browser
 *  off public Solana RPC (which 403s/rate-limits browser-origin requests). */
export const balanceOf = action({
  args: { pubkey: v.string() },
  handler: async (_ctx, { pubkey }) => {
    const connection = new Connection(
      process.env.SOLANA_RPC_URL || DEFAULT_RPC,
      "confirmed",
    );
    const { value } = await connection.getParsedTokenAccountsByOwner(
      new PublicKey(pubkey),
      { mint: new PublicKey(DTOUR_MINT) },
    );
    let balance = 0;
    for (const { account } of value) {
      const amount = account.data.parsed?.info?.tokenAmount?.uiAmount;
      if (typeof amount === "number") balance += amount;
    }
    return balance;
  },
});
