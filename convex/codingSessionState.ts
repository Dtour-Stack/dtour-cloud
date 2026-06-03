// Pure, Convex-free session-state logic for portable coding sessions (spec §2/§4).
// Imports nothing from ./_generated, so it runs in plain Node and is unit-tested
// in the existing vitest harness. The Convex glue (codingSessions.ts) wraps this.

export type SessionStatus = "live" | "idle" | "archived";

/** Which backend a session is currently attached to (normalized form). */
export type ActiveBackend =
  | { kind: "detached" }
  | { kind: "local"; deviceId: string }
  | { kind: "cloud"; sandboxId: string };

/** Flat representation persisted in a Convex row (the backend columns). */
export interface BackendColumns {
  activeBackend: "detached" | "local" | "cloud";
  activeDeviceId?: string;
  activeSandboxId?: string;
}

/** A request to change which backend a session runs on. */
export type AttachEvent =
  | { kind: "detached" }
  | { kind: "local"; deviceId: string; checkpointed?: boolean }
  | { kind: "cloud"; sandboxId: string; checkpointed?: boolean };

/** Generic invalid-state error (bad backend args, illegal status move). */
export class SessionStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionStateError";
  }
}

/** Moving a live session to a different backend without checkpointing first. */
export class HandoffWithoutCheckpointError extends Error {
  constructor() {
    super("Refusing to move a live session to another backend without a checkpoint");
    this.name = "HandoffWithoutCheckpointError";
  }
}

function sameTarget(a: ActiveBackend, e: AttachEvent): boolean {
  if (a.kind !== e.kind) return false;
  if (a.kind === "local" && e.kind === "local") return a.deviceId === e.deviceId;
  if (a.kind === "cloud" && e.kind === "cloud") return a.sandboxId === e.sandboxId;
  return a.kind === "detached"; // both detached
}

/**
 * Compute the next active backend. Enforces the handoff invariant (spec §4):
 * moving a LIVE session from one backend to a *different* one requires
 * `checkpointed` (working tree committed/stashed + turn flushed) so in-flight
 * work is never silently dropped. Same-target attaches are idempotent.
 */
export function applyBackendChange(
  current: ActiveBackend,
  event: AttachEvent,
): ActiveBackend {
  if (event.kind === "local" && !event.deviceId.trim()) {
    throw new SessionStateError("deviceId is required to attach a local backend");
  }
  if (event.kind === "cloud" && !event.sandboxId.trim()) {
    throw new SessionStateError("sandboxId is required to attach a cloud backend");
  }

  if (sameTarget(current, event)) return current; // idempotent no-op

  const leavingLiveBackend = current.kind !== "detached";
  const goingToNewBackend = event.kind !== "detached";
  const checkpointed = "checkpointed" in event && event.checkpointed === true;
  if (leavingLiveBackend && goingToNewBackend && !checkpointed) {
    throw new HandoffWithoutCheckpointError();
  }

  switch (event.kind) {
    case "detached":
      return { kind: "detached" };
    case "local":
      return { kind: "local", deviceId: event.deviceId };
    case "cloud":
      return { kind: "cloud", sandboxId: event.sandboxId };
  }
}

/** Map the normalized ActiveBackend → the flat columns stored in Convex. */
export function toColumns(b: ActiveBackend): BackendColumns {
  switch (b.kind) {
    case "detached":
      return { activeBackend: "detached" };
    case "local":
      return { activeBackend: "local", activeDeviceId: b.deviceId };
    case "cloud":
      return { activeBackend: "cloud", activeSandboxId: b.sandboxId };
  }
}

/** Map the flat Convex columns → the normalized ActiveBackend. */
export function fromColumns(c: BackendColumns): ActiveBackend {
  switch (c.activeBackend) {
    case "local":
      return { kind: "local", deviceId: c.activeDeviceId ?? "" };
    case "cloud":
      return { kind: "cloud", sandboxId: c.activeSandboxId ?? "" };
    default:
      return { kind: "detached" };
  }
}

/** The dedicated git branch a session works on. Deterministic + pure (spec §6). */
export function deriveBranchName(sessionId: string): string {
  return `dtour/session-${sessionId}`;
}

/** Status transition guard. Archived is terminal. */
export function nextStatus(current: SessionStatus, to: SessionStatus): SessionStatus {
  if (current === "archived" && to !== "archived") {
    throw new SessionStateError("Archived sessions cannot be reactivated");
  }
  return to;
}
