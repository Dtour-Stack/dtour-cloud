import { ActionRetrier } from "@convex-dev/action-retrier";
import { components } from "./_generated/api";

/** Retries flaky actions (gate verify, OpenRouter, Solana RPC). */
export const retrier = new ActionRetrier(components.actionRetrier, {
  initialBackoffMs: 750,
  base: 2,
  maxFailures: 4,
});
