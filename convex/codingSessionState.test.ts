import { describe, it, expect } from "vitest";
import {
  applyBackendChange,
  deriveBranchName,
  toColumns,
  fromColumns,
  nextStatus,
  HandoffWithoutCheckpointError,
  SessionStateError,
  type ActiveBackend,
} from "./codingSessionState";

const DETACHED: ActiveBackend = { kind: "detached" };

describe("applyBackendChange", () => {
  it("attaches a cloud backend from detached", () => {
    expect(applyBackendChange(DETACHED, { kind: "cloud", sandboxId: "sbx_1" })).toEqual({
      kind: "cloud",
      sandboxId: "sbx_1",
    });
  });

  it("attaches a local backend from detached", () => {
    expect(applyBackendChange(DETACHED, { kind: "local", deviceId: "dev_1" })).toEqual({
      kind: "local",
      deviceId: "dev_1",
    });
  });

  it("is idempotent when re-attaching the same target", () => {
    const cur: ActiveBackend = { kind: "cloud", sandboxId: "sbx_1" };
    expect(applyBackendChange(cur, { kind: "cloud", sandboxId: "sbx_1" })).toEqual(cur);
  });

  it("refuses to move a live session to a different backend without a checkpoint", () => {
    const cur: ActiveBackend = { kind: "cloud", sandboxId: "sbx_1" };
    expect(() => applyBackendChange(cur, { kind: "local", deviceId: "dev_1" })).toThrow(
      HandoffWithoutCheckpointError,
    );
  });

  it("allows a checkpointed handoff between backends", () => {
    const cur: ActiveBackend = { kind: "cloud", sandboxId: "sbx_1" };
    expect(
      applyBackendChange(cur, { kind: "local", deviceId: "dev_1", checkpointed: true }),
    ).toEqual({ kind: "local", deviceId: "dev_1" });
  });

  it("allows detaching a live backend without a checkpoint", () => {
    const cur: ActiveBackend = { kind: "local", deviceId: "dev_1" };
    expect(applyBackendChange(cur, { kind: "detached" })).toEqual({ kind: "detached" });
  });

  it("rejects an empty deviceId", () => {
    expect(() => applyBackendChange(DETACHED, { kind: "local", deviceId: " " })).toThrow(
      SessionStateError,
    );
  });

  it("rejects an empty sandboxId", () => {
    expect(() => applyBackendChange(DETACHED, { kind: "cloud", sandboxId: "" })).toThrow(
      SessionStateError,
    );
  });
});

describe("column mapping round-trips", () => {
  it("local", () => {
    const b: ActiveBackend = { kind: "local", deviceId: "dev_1" };
    expect(fromColumns(toColumns(b))).toEqual(b);
  });
  it("cloud", () => {
    const b: ActiveBackend = { kind: "cloud", sandboxId: "sbx_1" };
    expect(fromColumns(toColumns(b))).toEqual(b);
  });
  it("detached", () => {
    expect(fromColumns(toColumns(DETACHED))).toEqual(DETACHED);
  });
});

describe("deriveBranchName", () => {
  it("is deterministic and namespaced", () => {
    expect(deriveBranchName("abc123")).toBe("dtour/session-abc123");
  });
});

describe("nextStatus", () => {
  it("allows live → idle", () => {
    expect(nextStatus("live", "idle")).toBe("idle");
  });
  it("allows idle → archived", () => {
    expect(nextStatus("idle", "archived")).toBe("archived");
  });
  it("refuses to reactivate an archived session", () => {
    expect(() => nextStatus("archived", "live")).toThrow(SessionStateError);
  });
});
