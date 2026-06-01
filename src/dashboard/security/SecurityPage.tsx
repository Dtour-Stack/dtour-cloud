import { useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { Link, useNavigate } from "react-router-dom";
import { AppShell } from "@/dashboard/AppShell";
import { DTOUR_SESSION_KEY, getDtourSessionToken } from "@/lib/session";
import { surfaceLabelForRoute } from "@/lib/surfaceFlags";
import { useFlags } from "@/lib/useFlags";
import { Badge, Button, Icon } from "@/ui";

type Me = { pubkey: string; lastLoginAt: number | null } | null | undefined;
const trunc = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-6)}` : a);

export default function SecurityPage({ embedded = false }: { embedded?: boolean } = {}) {
  const token = getDtourSessionToken();
  const me = useQuery(anyApi.users.me, token ? { token } : "skip") as Me;
  const navigate = useNavigate();
  const flags = useFlags();
  const apiKeysLabel = surfaceLabelForRoute("/api-keys", flags);

  function signOut() {
    localStorage.removeItem(DTOUR_SESSION_KEY);
    navigate("/login", { replace: true });
  }

  const body = (
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Security</h1>
          <p className="mt-1 text-sm text-white/50">
            Your wallet is your identity — there are no passwords. Access is gated by a
            Sign-In-With-Solana signature + your $DTOUR balance.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <div className="text-xs uppercase tracking-widest text-white/45">Active session</div>
          <div className="mt-2 flex items-center justify-between">
            <div>
              <div className="font-mono text-sm text-white">{me ? trunc(me.pubkey) : "—"}</div>
              <div className="text-xs text-white/40">
                {me?.lastLoginAt ? `Last login ${new Date(me.lastLoginAt).toLocaleString()}` : ""}
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={signOut}>
              <Icon.LogOut size={13} /> Sign out
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm text-white">
                API keys
                {apiKeysLabel && (
                  <Badge
                    tone={apiKeysLabel === "Coming soon" ? "warning" : "accent"}
                    className="px-1.5 py-0 text-[9px]"
                  >
                    {apiKeysLabel}
                  </Badge>
                )}
              </div>
              <div className="text-xs text-white/45">
                Programmatic access tokens are gated until launch hardening is complete.
              </div>
            </div>
            <Link to="/api-keys" className="text-sm text-purple-300 hover:underline">
              {apiKeysLabel === "Coming soon" ? "View status" : "Manage"} →
            </Link>
          </div>
        </div>
      </div>
    );
  return embedded ? body : <AppShell title="Security">{body}</AppShell>;
}
