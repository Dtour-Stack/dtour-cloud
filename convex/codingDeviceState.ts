// Pure, Convex-free device-pairing logic for the Self-host coding backend.
// A detour desktop app pairs to a Detour Cloud account via a short-lived code
// the user approves in the (wallet-gated) web app; once approved, the app polls
// for a device token it then uses to dial the relay. No ./_generated imports →
// unit-tested in the existing vitest harness, like codingSessionState.ts.

export type PairingStatus = "pending" | "approved" | "consumed" | "expired";

export interface PairingRow {
  status: "pending" | "approved" | "consumed";
  expiresAt: number; // ms epoch — bounds the PENDING (pre-approval) window
  pubkey?: string; // set at approval (the approving wallet)
  deviceId?: string; // set at approval
}

/** How long a freshly-issued pairing code can sit unapproved. */
export const PAIRING_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class PairingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PairingError";
  }
}

/** Effective status, accounting for expiry of the pending (pre-approval) window. */
export function effectiveStatus(row: PairingRow, now: number): PairingStatus {
  if (row.status === "pending" && now > row.expiresAt) return "expired";
  return row.status;
}

/** A pending, unexpired code may be approved by a signed-in wallet. */
export function assertApprovable(row: PairingRow, now: number): void {
  const s = effectiveStatus(row, now);
  if (s === "expired") throw new PairingError("Pairing code expired — start again");
  if (s !== "pending") throw new PairingError("Pairing code already used");
}

/** Only an approved (not yet consumed) pairing yields the device token, once. */
export function assertConsumable(row: PairingRow, now: number): void {
  const s = effectiveStatus(row, now);
  if (s === "approved") return;
  if (s === "consumed") throw new PairingError("Device token already issued");
  throw new PairingError("Pairing not approved yet");
}

/** Normalize a user-entered pairing code (case- and whitespace-insensitive). */
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

/** Validate the shape of a code (the Convex glue supplies the entropy). */
export function isValidCodeShape(code: string): boolean {
  return /^[A-Z0-9]{8}$/.test(code);
}
