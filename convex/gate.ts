import bs58 from "bs58";
import { v } from "convex/values";
import nacl from "tweetnacl";
import { api, internal } from "./_generated/api";
import { action } from "./_generated/server";

function nonceFromMessage(message: string): string | null {
  const line = message
    .split("\n")
    .find((l) => l.startsWith("Nonce: "));
  return line ? line.slice("Nonce: ".length).trim() : null;
}

/**
 * Early-access gate: validates the server-issued nonce, verifies the SIWS
 * signature, and issues a session token ONLY for allowlisted wallets. Every
 * other wallet is directed to the email waitlist (handled client-side).
 *
 * (When early access ends, restore the $DTOUR on-chain balance check here so
 * holders can sign in too — see git history of this file.)
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

    // Solana pubkeys are base58-encoded 32-byte ed25519 keys — decode directly
    // rather than pulling in @solana/web3.js inside the node action.
    const verified = nacl.sign.detached.verify(
      new TextEncoder().encode(message),
      bs58.decode(signature),
      bs58.decode(pubkey),
    );
    if (!verified) throw new Error("Signature verification failed");

    // Early access: only allowlisted wallets may sign in.
    const whitelisted = await ctx.runQuery(internal.whitelist.isWhitelisted, {
      pubkey,
    });
    if (!whitelisted) {
      throw new Error(
        "Early access is limited to approved wallets. Join the waitlist for early access.",
      );
    }

    // Read the real on-chain $DTOUR balance for DISPLAY (the access decision above
    // is whitelist-only during early access — balance no longer gates entry, but
    // the dashboard shows it). Never block login on an RPC hiccup → default 0.
    let balance = 0;
    try {
      balance = await ctx.runAction(api.tokens.balanceOf, { pubkey });
    } catch {
      balance = 0;
    }

    const { token, hasProfile } = await ctx.runMutation(
      internal.auth.recordLogin,
      { pubkey, balance },
    );
    return { token, balance, hasProfile };
  },
});
