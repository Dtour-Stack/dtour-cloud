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

    let balance = 0;
    try {
      balance = (await ctx.runAction(api.tokens.balanceOf, { pubkey })) as number;
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
