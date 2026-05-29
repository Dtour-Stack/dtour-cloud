import { createContext, type ReactNode } from "react";
import type { StewardSessionUser } from "@/lib/hooks/use-session-auth";

/**
 * Minimal Steward auth context for the custom Detour shell.
 *
 * `useSessionAuth` falls back to reading the session from localStorage/cookies
 * when this context is null, so the landing/token pages render with real
 * session detection and no @stwd runtime. The full Steward runtime (token
 * refresh, SIWS/SIWE) is wired in alongside the login route.
 */
export interface StewardAuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: StewardSessionUser;
  session: unknown;
  signOut: () => void;
  getToken: () => string | null;
}

export const LocalStewardAuthContext =
  createContext<StewardAuthContextValue | null>(null);

export function StewardProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
