/**
 * Client-side $DTOUR transfer for credit top-ups: user wallet → credits treasury.
 * $DTOUR is Token-2022, so all instructions use TOKEN_2022_PROGRAM_ID. The user
 * signs + broadcasts via their wallet adapter; convex/credits.ts then verifies
 * the landed tx and grants USD credits.
 */
import {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { type Connection, PublicKey, Transaction } from "@solana/web3.js";

export const DTOUR_DECIMALS = 6;

/** Build an unsigned $DTOUR transfer tx (payer → treasury). Creates the
 *  treasury's $DTOUR token account idempotently in the same tx if missing. */
export async function buildTopUpTx(opts: {
  connection: Connection;
  payer: PublicKey;
  treasury: PublicKey;
  mint: PublicKey;
  amountUi: number;
}): Promise<Transaction> {
  const { connection, payer, treasury, mint, amountUi } = opts;
  const payerAta = getAssociatedTokenAddressSync(mint, payer, false, TOKEN_2022_PROGRAM_ID);
  const treasuryAta = getAssociatedTokenAddressSync(mint, treasury, false, TOKEN_2022_PROGRAM_ID);
  const amount = BigInt(Math.round(amountUi * 10 ** DTOUR_DECIMALS));

  const tx = new Transaction();
  tx.add(
    createAssociatedTokenAccountIdempotentInstruction(
      payer,
      treasuryAta,
      treasury,
      mint,
      TOKEN_2022_PROGRAM_ID,
    ),
  );
  tx.add(
    createTransferCheckedInstruction(
      payerAta,
      mint,
      treasuryAta,
      payer,
      amount,
      DTOUR_DECIMALS,
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
  );
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer;
  return tx;
}
