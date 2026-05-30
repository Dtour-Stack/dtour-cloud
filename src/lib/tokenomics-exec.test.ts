import { describe, expect, test } from "vitest";
import {
  ALWAYS_EXCLUDE_OWNERS,
  applyDustFloor,
  buildExcludeSet,
  computeProRata,
  lamportsToSol,
  solToLamports,
  transfersPerBatch,
  type Cfg,
  type Payout,
} from "./tokenomics-exec";

const cfg = (over: Partial<Cfg> = {}): Cfg => ({
  splitBps: { builder: 3000, holders: 4000, buyback: 2000, treasury: 1000 },
  wallets: { creator: "C", builder: "Bd", treasury: "T", buyback: "Bb" },
  minBalanceTokens: 1000,
  minPayoutSol: 0.001,
  creatorReserveSol: 0.02,
  excludeWallets: ["X"],
  perRunCapSol: 5,
  ...over,
});

describe("lamports conversion", () => {
  test("solToLamports is exact", () => {
    expect(solToLamports(1)).toBe(1_000_000_000n);
    expect(solToLamports(0.001)).toBe(1_000_000n);
  });
  test("round-trips", () => {
    expect(lamportsToSol(solToLamports(0.5))).toBeCloseTo(0.5, 9);
  });
});

describe("buildExcludeSet", () => {
  test("always excludes the 4 pools + the LP owner, in code", () => {
    const set = buildExcludeSet(cfg());
    for (const w of ["C", "Bd", "T", "Bb"]) expect(set.has(w)).toBe(true);
    expect(set.has("X")).toBe(true);
    for (const lp of ALWAYS_EXCLUDE_OWNERS) expect(set.has(lp)).toBe(true);
  });
  test("LP stays excluded even if dropped from config", () => {
    const set = buildExcludeSet(cfg({ excludeWallets: [] }));
    for (const lp of ALWAYS_EXCLUDE_OWNERS) expect(set.has(lp)).toBe(true);
  });
});

describe("computeProRata", () => {
  test("splits pro-rata with no remainder on clean inputs", () => {
    const { payouts, remainderLamports } = computeProRata(
      [
        { owner: "A", amount: 60 },
        { owner: "B", amount: 40 },
      ],
      1000n,
    );
    expect(payouts.find((p) => p.owner === "A")?.lamports).toBe(600n);
    expect(payouts.find((p) => p.owner === "B")?.lamports).toBe(400n);
    expect(remainderLamports).toBe(0n);
  });
  test("empty holders → all remainder", () => {
    const { payouts, remainderLamports } = computeProRata([], 1000n);
    expect(payouts).toHaveLength(0);
    expect(remainderLamports).toBe(1000n);
  });
  test("never over-assigns (sum ≤ pool)", () => {
    const { payouts, remainderLamports } = computeProRata(
      [
        { owner: "A", amount: 33 },
        { owner: "B", amount: 33 },
        { owner: "C", amount: 34 },
      ],
      1000n,
    );
    const sum = payouts.reduce((s, p) => s + p.lamports, 0n);
    expect(sum + remainderLamports).toBe(1000n);
    expect(sum).toBeLessThanOrEqual(1000n);
  });
});

describe("applyDustFloor", () => {
  test("drops payouts below the floor", () => {
    const payouts = [
      { owner: "A", lamports: 600n },
      { owner: "B", lamports: 5n },
    ] as Payout[];
    const { kept, skipped } = applyDustFloor(payouts, 10n);
    expect(kept.map((p) => p.owner)).toEqual(["A"]);
    expect(skipped.map((p) => p.owner)).toEqual(["B"]);
  });
});

describe("transfersPerBatch", () => {
  test("shrinks when a memo is present", () => {
    expect(transfersPerBatch(undefined)).toBe(15);
    expect(transfersPerBatch("")).toBe(15);
    expect(transfersPerBatch("Detour")).toBe(13);
  });
});
