import { describe, expect, it, vi } from "vitest";
import {
	type DeviceConn,
	DeviceRegistry,
	decodeFromDevice,
	encodeToDevice,
	parseWebFrame,
	SessionRouter,
} from "./broker";

describe("device frame codec", () => {
	it("round-trips a relay→device open frame", () => {
		const raw = encodeToDevice({ t: "open", sid: "s1", agent: "claude" });
		expect(JSON.parse(raw)).toEqual({ t: "open", sid: "s1", agent: "claude" });
	});
	it("decodes a device→relay output frame", () => {
		expect(
			decodeFromDevice(JSON.stringify({ t: "out", sid: "s1", data: "hi" })),
		).toEqual({
			t: "out",
			sid: "s1",
			data: "hi",
		});
	});
	it("decodes an exit frame", () => {
		expect(decodeFromDevice(JSON.stringify({ t: "exit", sid: "s1" }))).toEqual({
			t: "exit",
			sid: "s1",
		});
	});
	it("rejects malformed / unknown frames", () => {
		expect(decodeFromDevice("not json")).toBeNull();
		expect(decodeFromDevice(JSON.stringify({ t: "bogus" }))).toBeNull();
		expect(decodeFromDevice(JSON.stringify({ t: "out", sid: 5 }))).toBeNull();
	});
});

describe("parseWebFrame", () => {
	it("parses d-prefixed input", () => {
		expect(parseWebFrame("dls -la")).toEqual({ kind: "input", data: "ls -la" });
	});
	it("treats unprefixed bytes as raw input (safety)", () => {
		expect(parseWebFrame("\x03")).toEqual({ kind: "input", data: "\x03" });
	});
	it("parses a resize frame", () => {
		expect(
			parseWebFrame(`r${JSON.stringify({ cols: 120, rows: 40 })}`),
		).toEqual({
			kind: "resize",
			cols: 120,
			rows: 40,
		});
	});
	it("rejects a non-positive resize", () => {
		expect(
			parseWebFrame(`r${JSON.stringify({ cols: 0, rows: 40 })}`),
		).toBeNull();
	});
	it("parses a save frame with a name", () => {
		expect(parseWebFrame(`w${JSON.stringify({ name: "proj" })}`)).toEqual({
			kind: "save",
			name: "proj",
		});
	});
	it("returns null for an empty frame", () => {
		expect(parseWebFrame("")).toBeNull();
	});
});

describe("DeviceRegistry", () => {
	const conn = (pubkey: string, deviceId = "d"): DeviceConn => ({
		pubkey,
		deviceId,
		send: () => {},
	});
	it("registers and finds a device by owner", () => {
		const r = new DeviceRegistry();
		r.register(conn("pkA"));
		expect(r.has("pkA")).toBe(true);
		expect(r.get("pkA")?.pubkey).toBe("pkA");
	});
	it("finds a selected device when an owner has multiple connected devices", () => {
		const r = new DeviceRegistry();
		const laptop = conn("pkA", "laptop");
		const desktop = conn("pkA", "desktop");
		r.register(laptop);
		r.register(desktop);
		expect(r.has("pkA", "laptop")).toBe(true);
		expect(r.get("pkA", "desktop")).toBe(desktop);
	});
	it("a new registration for the same device replaces the old", () => {
		const r = new DeviceRegistry();
		const first = conn("pkA");
		const second = conn("pkA");
		r.register(first);
		r.register(second);
		expect(r.get("pkA")).toBe(second);
	});
	it("unregisters one selected device without dropping the owner", () => {
		const r = new DeviceRegistry();
		r.register(conn("pkA", "laptop"));
		r.register(conn("pkA", "desktop"));
		r.unregister("pkA", "laptop");
		expect(r.has("pkA", "laptop")).toBe(false);
		expect(r.has("pkA", "desktop")).toBe(true);
	});
	it("unregisters all owner devices", () => {
		const r = new DeviceRegistry();
		r.register(conn("pkA"));
		r.unregister("pkA");
		expect(r.has("pkA")).toBe(false);
	});
});

describe("SessionRouter", () => {
	it("routes output to the open session's sink", () => {
		const r = new SessionRouter();
		const sink = vi.fn();
		r.open("s1", sink);
		expect(r.route("s1", "out!")).toBe(true);
		expect(sink).toHaveBeenCalledWith("out!");
	});
	it("returns false routing to an unknown/closed session", () => {
		const r = new SessionRouter();
		expect(r.route("ghost", "x")).toBe(false);
		r.open("s1", () => {});
		r.close("s1");
		expect(r.route("s1", "x")).toBe(false);
	});
});
