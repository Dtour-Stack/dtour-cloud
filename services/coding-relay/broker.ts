// Pure routing core for the Self-host broker (E2). The coding-relay becomes a
// two-sided broker: detour desktop devices dial in and register here; a web
// `backend=selfhost` session is bridged to its owner's device over a multiplexed
// frame protocol (one device socket, many sessions keyed by `sid`). No Bun/WS/
// e2b imports → unit-testable in Node, like the convex pure modules.

export interface DeviceConn {
  pubkey: string;
  deviceId: string;
  /** Send one control/data frame down the device's outbound socket. */
  send: (frame: string) => void;
}

/** Relay → device frames (multiplexed by session id `sid`). */
export type ToDeviceFrame =
  | { t: "open"; sid: string; agent: string }
  | { t: "in"; sid: string; data: string } // keystrokes
  | { t: "resize"; sid: string; cols: number; rows: number }
  | { t: "close"; sid: string };

/** Device → relay frames. */
export type FromDeviceFrame =
  | { t: "out"; sid: string; data: string } // PTY output
  | { t: "exit"; sid: string };

export function encodeToDevice(f: ToDeviceFrame): string {
  return JSON.stringify(f);
}

export function decodeFromDevice(raw: string): FromDeviceFrame | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.t === "out" && typeof o.sid === "string" && typeof o.data === "string") {
    return { t: "out", sid: o.sid, data: o.data };
  }
  if (o.t === "exit" && typeof o.sid === "string") {
    return { t: "exit", sid: o.sid };
  }
  return null;
}

/** A parsed web client frame (the existing wterm protocol: d/r/w prefixes). */
export type WebFrame =
  | { kind: "input"; data: string }
  | { kind: "resize"; cols: number; rows: number }
  | { kind: "save"; name: string }
  | null;

export function parseWebFrame(raw: string): WebFrame {
  if (raw.length === 0) return null;
  const type = raw[0];
  const payload = raw.slice(1);
  if (type === "r") {
    try {
      const { cols, rows } = JSON.parse(payload) as { cols: number; rows: number };
      if (cols > 0 && rows > 0) return { kind: "resize", cols, rows };
    } catch {
      return null;
    }
    return null;
  }
  if (type === "w") {
    try {
      const body = payload ? (JSON.parse(payload) as { name?: string }) : {};
      return { kind: "save", name: typeof body.name === "string" ? body.name : "workspace" };
    } catch {
      return { kind: "save", name: "workspace" };
    }
  }
  // default: PTY input ("d"-prefixed, or raw for safety)
  return { kind: "input", data: type === "d" ? payload : raw };
}

/** Registry of connected devices, keyed by owner pubkey (one device per owner). */
export class DeviceRegistry {
  private byPubkey = new Map<string, DeviceConn>();
  register(conn: DeviceConn): void {
    this.byPubkey.set(conn.pubkey, conn);
  }
  unregister(pubkey: string): void {
    this.byPubkey.delete(pubkey);
  }
  get(pubkey: string): DeviceConn | undefined {
    return this.byPubkey.get(pubkey);
  }
  has(pubkey: string): boolean {
    return this.byPubkey.has(pubkey);
  }
}

/** Routes device "out" frames back to the right web socket, by session id. */
export class SessionRouter {
  private bySid = new Map<string, (data: string) => void>();
  open(sid: string, sink: (data: string) => void): void {
    this.bySid.set(sid, sink);
  }
  route(sid: string, data: string): boolean {
    const sink = this.bySid.get(sid);
    if (!sink) return false;
    sink(data);
    return true;
  }
  close(sid: string): void {
    this.bySid.delete(sid);
  }
  has(sid: string): boolean {
    return this.bySid.has(sid);
  }
}
