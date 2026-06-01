/** Inference gateway order — A/B per user, monitored on inferenceUsage rows. */

export type InferenceGateway = "elizacloud" | "openrouter";
export type InferenceRouteVariant = "eliza_first" | "openrouter_first";

export type InferenceRouteMode = "ab" | "eliza_first" | "openrouter_first";

/** Sticky 50/50 bucket from pubkey (deterministic per wallet). */
export function inferenceRouteVariantForPubkey(pubkey: string): InferenceRouteVariant {
  let h = 0;
  for (let i = 0; i < pubkey.length; i++) h = (h * 31 + pubkey.charCodeAt(i)) | 0;
  return (h & 1) === 0 ? "eliza_first" : "openrouter_first";
}

export function resolveInferenceRouteMode(): InferenceRouteMode {
  const raw = (process.env.INFERENCE_ROUTE_MODE ?? "ab").trim().toLowerCase();
  if (raw === "eliza_first" || raw === "eliza") return "eliza_first";
  if (raw === "openrouter_first" || raw === "openrouter") return "openrouter_first";
  return "ab";
}

export function resolveRouteVariant(pubkey: string): InferenceRouteVariant {
  const mode = resolveInferenceRouteMode();
  if (mode === "eliza_first") return "eliza_first";
  if (mode === "openrouter_first") return "openrouter_first";
  return inferenceRouteVariantForPubkey(pubkey);
}

export function gatewayAttemptOrder(
  variant: InferenceRouteVariant,
  available: { elizacloud: boolean; openrouter: boolean },
): InferenceGateway[] {
  const primary: InferenceGateway =
    variant === "eliza_first" ? "elizacloud" : "openrouter";
  const secondary: InferenceGateway =
    primary === "elizacloud" ? "openrouter" : "elizacloud";
  const out: InferenceGateway[] = [];
  if (primary === "elizacloud" && available.elizacloud) out.push("elizacloud");
  if (primary === "openrouter" && available.openrouter) out.push("openrouter");
  if (secondary === "elizacloud" && available.elizacloud) out.push("elizacloud");
  if (secondary === "openrouter" && available.openrouter) out.push("openrouter");
  return out;
}
