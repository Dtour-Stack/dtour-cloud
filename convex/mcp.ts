import { defineMcpAction, defineMcpQuery, mcpCallerValidator } from "convex-mcp-gateway";
import { v } from "convex/values";
import { api } from "./_generated/api";

/** MCP tool catalog — synced on each `/mcp` connect. */
export const tools = [
  defineMcpQuery({
    name: "dtour_flags",
    description: "Public feature flags for Detour Cloud.",
    fn: api.flags.all,
    args: {},
    metadata: { public: true },
  }),
  defineMcpAction({
    name: "dtour_inference_status",
    description: "Whether OpenRouter direct inference is configured.",
    fn: api.inference.status,
    args: {},
    metadata: { public: true },
  }),
  defineMcpQuery({
    name: "dtour_me",
    description: "Profile and credit balance for the authenticated caller (Bearer API key or OAuth).",
    fn: api.mcpQueries.meForCaller,
    args: { caller: mcpCallerValidator },
    identityArg: "caller",
  }),
  defineMcpQuery({
    name: "dtour_freetour_status",
    description: "Free-tier budget for the authenticated caller.",
    fn: api.mcpQueries.freetourForCaller,
    args: { caller: mcpCallerValidator },
    identityArg: "caller",
  }),
  defineMcpQuery({
    name: "dtour_freetour_status_session",
    description: "Free-tier budget when passing a dashboard session token (legacy).",
    fn: api.inference.freetourStatus,
    args: { token: v.string() },
    metadata: { auth: "session_arg" },
  }),
];
