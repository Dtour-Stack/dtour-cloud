/**
 * Client-side USDC transfer for credit top-ups: user wallet → credits treasury.
 * USDC is a STANDARD SPL token (TOKEN_PROGRAM_ID, not Token-2022) with 6
 * decimals. The user signs + broadcasts via their wallet adapter;
 * convex/credits.ts then verifies the landed tx and grants USD credits 1:1
 * (USDC is $1 — no price oracle).
 */
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { type Connection, PublicKey, Transaction } from "@solana/web3.js";

export const USDC_DECIMALS = 6;
// Mainnet USDC mint (Circle). Standard SPL token — TOKEN_PROGRAM_ID.
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/** Build an unsigned USDC transfer tx (payer → treasury). Creates the
 *  treasury's USDC token account idempotently in the same tx if missing. */
export async function buildUsdcTopUpTx(opts: {
  connection: Connection;
  payer: PublicKey;
  treasury: PublicKey;
  mint: PublicKey;
  amountUi: number;
}): Promise<Transaction> {
  const { connection, payer, treasury, mint, amountUi } = opts;
  const payerAta = getAssociatedTokenAddressSync(mint, payer, false, TOKEN_PROGRAM_ID);
  const treasuryAta = getAssociatedTokenAddressSync(mint, treasury, false, TOKEN_PROGRAM_ID);
  const amount = BigInt(Math.round(amountUi * 10 ** USDC_DECIMALS));

  const tx = new Transaction();
  tx.add(
    createAssociatedTokenAccountIdempotentInstruction(
      payer,
      treasuryAta,
      treasury,
      mint,
      TOKEN_PROGRAM_ID,
    ),
  );
  tx.add(
    createTransferCheckedInstruction(
      payerAta,
      mint,
      treasuryAta,
      payer,
      amount,
      USDC_DECIMALS,
      [],
      TOKEN_PROGRAM_ID,
    ),
  );
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer;
  return tx;
}
