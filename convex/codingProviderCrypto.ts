"use node";

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGO = "aes-256-gcm";

function encryptionKey(): Buffer {
  const raw = process.env.API_TOKENS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "API_TOKENS_ENCRYPTION_KEY is not set — run scripts/generate-api-tokens-key.sh and convex env set",
    );
  }
  return scryptSync(raw, "dtour-coding-provider", 32);
}

export function encryptProviderSecret(plaintext: string): { ciphertext: string; iv: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    ciphertext: Buffer.concat([enc, tag]).toString("base64"),
  };
}

export function decryptProviderSecret(ciphertext: string, iv: string): string {
  const buf = Buffer.from(ciphertext, "base64");
  const tag = buf.subarray(buf.length - 16);
  const data = buf.subarray(0, buf.length - 16);
  const decipher = createDecipheriv(ALGO, encryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
