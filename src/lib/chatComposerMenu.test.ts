import { describe, expect, it } from "vitest";
import { buildChatMenuItems, chatGalleryAttachEnabled, chatVoiceInputEnabled } from "./chatComposerMenu";

const ALL_ON: Record<string, boolean> = {
  surface_gallery: true,
  image_generation_enabled: true,
  paid_inference_enabled: true,
  surface_agents: true,
  surface_mcps: true,
  chat_auto_run_tools: true,
  chat_eliza_plugins: true,
  surface_design_studio: true,
  surface_voice: true,
  tts_enabled: true,
};

describe("buildChatMenuItems", () => {
  it("includes core items when inference + gallery flags are on", () => {
    const ids = buildChatMenuItems(ALL_ON).map((i) => i.id);
    expect(ids).toContain("gallery_attach");
    expect(ids).toContain("generate_image");
    expect(ids).toContain("instructions");
    expect(ids).toContain("mcp_tools");
    expect(ids).toContain("eliza_plugins");
  });

  it("hides gallery attach when surface_gallery is off", () => {
    const ids = buildChatMenuItems({ ...ALL_ON, surface_gallery: false }).map((i) => i.id);
    expect(ids).not.toContain("gallery_attach");
  });

  it("marks generate image unavailable when paid inference is paused", () => {
    const item = buildChatMenuItems({ ...ALL_ON, paid_inference_enabled: false }).find(
      (i) => i.id === "generate_image",
    );
    expect(item).toBeDefined();
    expect(item?.available).toBe(false);
    expect(item?.badge).toBe("soon");
  });

  it("hides MCP rows unless surface_mcps is on", () => {
    const off = buildChatMenuItems({ ...ALL_ON, surface_mcps: false }).map((i) => i.id);
    expect(off).not.toContain("mcp_tools");
    const on = buildChatMenuItems({ ...ALL_ON, surface_mcps: true }).map((i) => i.id);
    expect(on).toContain("mcp_tools");
    expect(on).toContain("manage_mcps");
  });

  it("shows auto-run only when chat_auto_run_tools opt-in is on", () => {
    expect(
      buildChatMenuItems({ ...ALL_ON, chat_auto_run_tools: false }).some((i) => i.id === "auto_run_tools"),
    ).toBe(false);
    expect(
      buildChatMenuItems({ ...ALL_ON, chat_auto_run_tools: true }).some((i) => i.id === "auto_run_tools"),
    ).toBe(true);
  });
});

describe("composer affordances", () => {
  it("gates gallery toolbar button", () => {
    expect(chatGalleryAttachEnabled({ surface_gallery: true })).toBe(true);
    expect(chatGalleryAttachEnabled({ surface_gallery: false })).toBe(false);
  });

  it("gates voice when both voice surface and TTS are on", () => {
    expect(chatVoiceInputEnabled({ surface_voice: true, tts_enabled: true })).toBe(true);
    expect(chatVoiceInputEnabled({ surface_voice: true, tts_enabled: false })).toBe(false);
  });
});
