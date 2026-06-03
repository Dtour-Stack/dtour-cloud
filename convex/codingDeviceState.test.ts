import { describe, it, expect } from "vitest";
import {
  effectiveStatus,
  assertApprovable,
  assertConsumable,
  normalizeCode,
  isValidCodeShape,
  PairingError,
  type PairingRow,
} from "./codingDeviceState";

const T0 = 1_000_000;
const pending = (over: Partial<PairingRow> = {}): PairingRow => ({
  status: "pending",
  expiresAt: T0 + 60_000,
  ...over,
});

describe("effectiveStatus", () => {
  it("pending within window stays pending", () => {
    expect(effectiveStatus(pending(), T0)).toBe("pending");
  });
  it("pending past expiry becomes expired", () => {
    expect(effectiveStatus(pending(), T0 + 120_000)).toBe("expired");
  });
  it("approved is unaffected by the pending window", () => {
    expect(
      effectiveStatus({ status: "approved", expiresAt: T0, pubkey: "pk", deviceId: "d" }, T0 + 1e9),
    ).toBe("approved");
  });
  it("consumed stays consumed", () => {
    expect(effectiveStatus({ status: "consumed", expiresAt: T0 }, T0)).toBe("consumed");
  });
});

describe("assertApprovable", () => {
  it("allows a pending, unexpired code", () => {
    expect(() => assertApprovable(pending(), T0)).not.toThrow();
  });
  it("rejects an expired code", () => {
    expect(() => assertApprovable(pending(), T0 + 120_000)).toThrow(PairingError);
  });
  it("rejects an already-approved code", () => {
    expect(() =>
      assertApprovable({ status: "approved", expiresAt: T0 + 60_000 }, T0),
    ).toThrow(PairingError);
  });
});

describe("assertConsumable", () => {
  it("allows an approved pairing", () => {
    expect(() =>
      assertConsumable({ status: "approved", expiresAt: T0, pubkey: "pk", deviceId: "d" }, T0),
    ).not.toThrow();
  });
  it("rejects a pending pairing (not approved yet)", () => {
    expect(() => assertConsumable(pending(), T0)).toThrow(PairingError);
  });
  it("rejects a consumed pairing (token already issued)", () => {
    expect(() => assertConsumable({ status: "consumed", expiresAt: T0 }, T0)).toThrow(
      PairingError,
    );
  });
});

describe("normalizeCode", () => {
  it("uppercases and strips whitespace", () => {
    expect(normalizeCode("  ab cd12 9z ")).toBe("ABCD129Z");
  });
});

describe("isValidCodeShape", () => {
  it("accepts 8 upper-alphanumeric chars", () => {
    expect(isValidCodeShape("ABCD1234")).toBe(true);
  });
  it("rejects wrong length or lowercase", () => {
    expect(isValidCodeShape("abcd1234")).toBe(false);
    expect(isValidCodeShape("ABCD123")).toBe(false);
  });
});
