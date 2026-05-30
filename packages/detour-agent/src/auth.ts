import { AgentMode } from "@/lib/eliza/agent-mode-types";
import type { UserContext } from "@/lib/eliza/user-context";

/**
 * Result shape returned by the Convex `sessions:verify` query.
 * Mirrors convex/sessions.ts: { valid:false } | { valid:true, pubkey, balance, organizationId }.
 */
type VerifyResult =
  | { valid: false }
  | { valid: true; pubkey: string; balance: number; organizationId: string };

/**
 * Minimal structural type for the Convex client we depend on. Both the real
 * `ConvexHttpClient`/`ConvexClient` from `convex/browser` and the test mock
 * satisfy this. We keep it loose because the function-reference generics from
 * `convex/_generated` are not needed for a single string-addressed query call.
 */
interface ConvexLike {
  query(name: never, args: never): Promise<unknown>;
}

/**
 * Build a session verifier bound to a Convex client and the shared ElizaOS
 * Cloud API key. The verifier exchanges a dtour-session token for an elizaOS
 * `UserContext` (or null if the token is invalid/expired).
 */
export function makeVerifySession(convex: ConvexLike, elizaCloudApiKey: string) {
  return async function verifySession(token: string): Promise<UserContext | null> {
    if (!token) return null;
    const res = (await convex.query("sessions:verify" as never, { token } as never)) as VerifyResult;
    if (!res.valid) return null;
    return {
      userId: res.pubkey,
      entityId: res.pubkey,
      organizationId: res.organizationId,
      agentMode: AgentMode.CHAT,
      apiKey: elizaCloudApiKey,
      isAnonymous: false,
      sessionToken: token,
    } satisfies UserContext;
  };
}
