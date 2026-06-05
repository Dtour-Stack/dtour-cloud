import { describe, expect, test } from "vitest";
import {
  canLaunchRemote,
  defaultDetourSubdomain,
  remoteRuntimeUrl,
  remoteStatusLabel,
} from "./remoteRuntime";

describe("remoteRuntime", () => {
  test("derives stable detour.ninja runtime domains", () => {
    expect(defaultDetourSubdomain("jh7xz_ABC-1234567890")).toBe(
      "agent-1234567890.detour.ninja",
    );
    expect(remoteRuntimeUrl("agent-one", "detour")).toBe(
      "https://agent-agentone.detour.ninja",
    );
  });

  test("normalizes custom domains", () => {
    expect(remoteRuntimeUrl("agent-one", "custom", "Desk.Agent.Example")).toBe(
      "https://desk.agent.example",
    );
  });

  test("labels and gates launchable statuses", () => {
    expect(remoteStatusLabel("not_configured")).toBe("on-demand");
    expect(canLaunchRemote("configured")).toBe(true);
    expect(canLaunchRemote("queued")).toBe(false);
  });
});
