import { useQuery } from "convex/react";
import { anyApi } from "convex/server";
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { getDtourSessionToken } from "@/lib/session";

/**
 * Route guard for the app. Requires:
 *  1. a dtour session token (the $DTOUR gate issued one), and
 *  2. a completed profile (username + email) — enforced for EVERY wallet,
 *     including whitelisted ones, so no one can skip onboarding by deep-linking.
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const token = getDtourSessionToken();
  const me = useQuery(anyApi.users.me, token ? { token } : "skip") as
    | { username: string | null }
    | null
    | undefined;

  // No token, or session invalid/expired → back to the gate.
  if (!token || me === null) return <Navigate to="/login" replace />;

  // Resolving the session.
  if (me === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0a0a0a]">
        <span
          className="h-5 w-5 rounded-full border-2 border-white/20 border-t-white/70 motion-safe:animate-spin"
          role="status"
          aria-label="Loading"
        />
      </div>
    );
  }

  // Authenticated but no profile yet → must finish onboarding first.
  if (!me.username) return <Navigate to="/onboarding" replace />;

  return <>{children}</>;
}
