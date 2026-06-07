import { useQuery } from "convex/react";
import { anyApi } from "convex/server";
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import {
  DTOUR_TEST_SESSION_TOKEN,
  readDtourPlaywrightUser,
} from "@/lib/playwright-dtour-auth";
import { getDtourSessionToken } from "@/lib/session";
import { SplashScreen } from "@/ui";

/**
 * Route guard for the app. Requires:
 *  1. a dtour session token (the $DTOUR gate issued one), and
 *  2. a completed profile (username + email) — enforced for EVERY wallet,
 *     including whitelisted ones, so no one can skip onboarding by deep-linking.
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const testUser = readDtourPlaywrightUser();
  const token = testUser ? DTOUR_TEST_SESSION_TOKEN : getDtourSessionToken();
  const meQuery = useQuery(anyApi.users.me, token && !testUser ? { token } : "skip") as
    | { username: string | null }
    | null
    | undefined;
  const me = testUser ?? meQuery;

  // No token, or session invalid/expired → back to the gate.
  if (!token || me === null) return <Navigate to="/login" replace />;

  // Resolving the session.
  if (me === undefined) return <SplashScreen />;

  // Authenticated but no profile yet → must finish onboarding first.
  if (!me.username) return <Navigate to="/onboarding" replace />;

  return <>{children}</>;
}
