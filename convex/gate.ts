"use node";

import { Connection, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { v } from "convex/values";
import nacl from "tweetnacl";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";

const DTOUR_MINT = "DijmsEDeTXsWCkCLkhYJNTutKaHf541xZshVrCUbcozy";
const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";

function nonceFromMessage(message: string): string | null {
  const line = message
    .split("\n")
    .find((l) => l.startsWith("Nonce: "));
  return line ? line.slice("Nonce: ".length).trim() : null;
}

/**
 * Authoritative $DTOUR gate: validates the server-issued nonce, verifies the
 * SIWS signature, reads the wallet's on-chain $DTOUR balance, and (only if the
 * balance is > 0) records the login and returns a session token.
 */
export const verify = action({
  args: {
    pubkey: v.string(),
    message: v.string(),
    signature: v.string(),
  },
  handler: async (ctx, { pubkey, message, signature }) => {
    const nonce = nonceFromMessage(message);
    if (!nonce) throw new Error("Message is missing a nonce");

    const nonceOk = await ctx.runMutation(internal.auth.consumeNonce, { nonce });
    if (!nonceOk) throw new Error("Invalid or expired nonce");

    const owner = new PublicKey(pubkey);
    const verified = nacl.sign.detached.verify(
      new TextEncoder().encode(message),
      bs58.decode(signature),
      owner.toBytes(),
    );
    if (!verified) throw new Error("Signature verification failed");

    // Whitelisted wallets always pass, regardless of $DTOUR balance.
    const whitelisted = await ctx.runQuery(internal.whitelist.isWhitelisted, {
      pubkey,
    });

    let balance = 0;
    if (!whitelisted) {
      const rpcUrl = process.env.SOLANA_RPC_URL || DEFAULT_RPC;
      const connection = new Connection(rpcUrl, "confirmed");
      const { value } = await connection.getParsedTokenAccountsByOwner(owner, {
        mint: new PublicKey(DTOUR_MINT),
      });
      for (const { account } of value) {
        const amount = account.data.parsed?.info?.tokenAmount?.uiAmount;
        if (typeof amount === "number") balance += amount;
      }
      if (balance <= 0) throw new Error("This wallet holds no $DTOUR");
    }

    const { token, hasProfile } = await ctx.runMutation(
      internal.auth.recordLogin,
      { pubkey, balance },
    );
    return { token, balance, hasProfile };
  },
});
