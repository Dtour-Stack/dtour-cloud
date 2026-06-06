import { describe, expect, it } from "vitest";
import { BETA_PRODUCTION_ENABLED_FLAGS } from "./betaProductionFlags";
import { getFlagDef, resolveFlag } from "./flagRegistry";

describe("beta production flags", () => {
	it("keeps chat elizaOS plugins enabled in the production repair path", () => {
		const def = getFlagDef("chat_eliza_plugins");

		expect(def?.defaultEnabled).toBe(true);
		expect(def ? resolveFlag(undefined, def) : false).toBe(true);
		expect(BETA_PRODUCTION_ENABLED_FLAGS).toContain("chat_eliza_plugins");
	});

	it("exposes auto-run tools in beta production without changing its registry default", () => {
		const def = getFlagDef("chat_auto_run_tools");

		expect(def?.defaultEnabled).toBe(false);
		expect(def ? resolveFlag(undefined, def) : true).toBe(false);
		expect(BETA_PRODUCTION_ENABLED_FLAGS).toContain("chat_auto_run_tools");
	});
});
