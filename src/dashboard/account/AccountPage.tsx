import { useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { Link } from "react-router-dom";
import { AppShell } from "@/dashboard/AppShell";
import { getDtourSessionToken } from "@/lib/session";

type Me = {
  pubkey: string;
  balance: number;
  role: string;
  plan: string | null;
  username: string | null;
  email: string | null;
  lastLoginAt: number | null;
} | null | undefined;

const trunc = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-6)}` : a);

export default function AccountPage({ embedded = false }: { embedded?: boolean } = {}) {
  const token = getDtourSessionToken();
  const me = useQuery(anyApi.users.me, token ? { token } : "skip") as Me;

  const body = (
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-xl font-semibold text-white">Account</h1>
        <div className="divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/[0.02]">
          <Row label="Wallet" value={me ? trunc(me.pubkey) : "—"} mono />
          <Row label="Username" value={me?.username ?? "—"} />
          <Row label="Email" value={me?.email ?? "—"} />
          <Row label="Tier" value={me?.role ?? "—"} />
          <Row label="Plan" value={me?.plan === "lifetime" ? "Lifetime (unlimited)" : "Standard"} />
          <Row label="$DTOUR balance" value={me ? me.balance.toLocaleString() : "—"} />
        </div>
        <div className="flex gap-3 text-sm">
          <Link to="/profile" className="text-purple-300 hover:underline">Edit profile</Link>
          <Link to="/security" className="text-purple-300 hover:underline">Security</Link>
          <Link to="/billing" className="text-purple-300 hover:underline">Billing</Link>
        </div>
      </div>
    );
  return embedded ? body : <AppShell title="Account">{body}</AppShell>;
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-sm text-white/45">{label}</span>
      <span className={`text-sm text-white ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
