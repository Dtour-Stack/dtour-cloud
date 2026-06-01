import { useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { isDtourPlaywrightAuthActive } from "@/lib/playwright-dtour-auth";
import { DEFAULT_SURFACE_FLAGS } from "@/lib/surfaceFlags";

/** App-wide feature flags (public). Values are *effective* on/off (registry defaults + kill-switch semantics). */
export function useFlags(): Record<string, boolean> {
  const testAuth = isDtourPlaywrightAuthActive();
  const flags = useQuery(
    anyApi.flags.all,
    testAuth ? "skip" : {},
  ) as Record<string, boolean> | undefined;

  return testAuth ? testFlags : flags ?? defaultFlags;
}

/** True when the flag is effectively enabled for gating UI/features. */
export function useFlag(key: string): boolean {
  return useFlags()[key] === true;
}

const defaultFlags: Record<string, boolean> = {
  ...DEFAULT_SURFACE_FLAGS,
  paid_inference_enabled: true,
  freetour_enabled: true,
  tts_enabled: false,
  video_enabled: false,
  freetour_user_visible: true,
  image_generation_enabled: true,
  chat_eliza_plugins: true,
  chat_auto_run_tools: false,
  profile_avatar_upload: false,
  agent_linking: false,
  github_linking: false,
  admin_debug_panel: true,
};

const testFlags: Record<string, boolean> = defaultFlags;
