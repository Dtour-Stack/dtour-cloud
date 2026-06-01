import { useQuery } from "convex/react";
import { anyApi } from "convex/server";
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import {
  DTOUR_TEST_SESSION_TOKEN,
  readDtourPlaywrightUser,
} from "@/lib/playwright-dtour-auth";
import { atLeast, type Role } from "@/lib/roles";
import { getDtourSessionToken } from "@/lib/session";

/** Like RequireSession, but also requires an effective role >= `min`.
 *  Below-min users are sent to /dashboard; profile-less users to onboarding. */
export function RequireRole({
  min,
  children,
}: {
  min: Role;
  children: ReactNode;
}) {
  const testUser = readDtourPlaywrightUser();
  const token = testUser ? DTOUR_TEST_SESSION_TOKEN : getDtourSessionToken();
  const meQuery = useQuery(anyApi.users.me, token && !testUser ? { token } : "skip") as
    | { username: string | null; role: Role }
    | null
    | undefined;
  const me = testUser ?? meQuery;

  if (!token || me === null) return <Navigate to="/login" replace />;
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
  if (!me.username) return <Navigate to="/onboarding" replace />;
  if (!atLeast(me.role, min)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
