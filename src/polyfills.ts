// Browser shims the Solana wallet adapters need at module-init time.
// Must be imported before any wallet code (first import in main.tsx).
import { Buffer } from "buffer";

if (typeof globalThis.Buffer === "undefined") {
  globalThis.Buffer = Buffer;
}
if (typeof (globalThis as { global?: unknown }).global === "undefined") {
  (globalThis as { global?: unknown }).global = globalThis;
}
