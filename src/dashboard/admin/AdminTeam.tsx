import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { type FormEvent, useState } from "react";
import { type Role, ROLE_LABEL } from "@/lib/roles";
import { getDtourSessionToken } from "@/lib/session";
import {
  Badge,
  Button,
  EmptyState,
  Icon,
  IconButton,
  Panel,
  SectionHeading,
  Skeleton,
} from "@/ui";

type Member = {
  pubkey: string;
  role: "dev_tester" | "admin" | "super_admin" | null;
  note: string | null;
  addedAt: number;
  plan: "lifetime" | null;
  creatorRewardsEligible: boolean;
};

const field =
  "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-purple-400/50 focus:outline-none";

function truncate(a: string) {
  return a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}

export function AdminTeam() {
  const token = getDtourSessionToken();
  const me = useQuery(anyApi.users.me, token ? { token } : "skip") as
    | { role?: Role }
    | null
    | undefined;
  const members = useQuery(anyApi.admin.members, token ? { token } : "skip") as
    | Member[]
    | undefined;
  const whitelistAdd = useMutation(anyApi.admin.whitelistAdd);
  const whitelistRemove = useMutation(anyApi.admin.whitelistRemove);
  const setRole = useMutation(anyApi.admin.setRole);
  const setUserPlan = useMutation(anyApi.admin.setUserPlan);

  const isSuper = me?.role === "super_admin";
  const [pubkey, setPubkey] = useState("");
  const [note, setNote] = useState("");
  const [role, setRoleSel] = useState<"none" | "dev_tester" | "admin" | "super_admin">("none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!token || !pubkey.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await whitelistAdd({
        token,
        pubkey: pubkey.trim(),
        note: note.trim() || undefined,
        role: isSuper && role !== "none" ? role : undefined,
      });
      setPubkey("");
      setNote("");
      setRoleSel("none");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to whitelist");
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(pk: string, r: "none" | "dev_tester" | "admin" | "super_admin") {
    if (!token) return;
    setError(null);
    try {
      await setRole({ token, pubkey: pk, role: r });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to set role");
    }
  }

  async function changePlan(pk: string, lifetime: boolean) {
    if (!token) return;
    setError(null);
    try {
      await setUserPlan({ token, pubkey: pk, plan: lifetime ? "lifetime" : "none" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to set plan");
    }
  }

  async function remove(pk: string) {
    if (!token) return;
    setError(null);
    try {
      await whitelistRemove({ token, pubkey: pk });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove");
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <header className="fade-up">
        <h1 className="text-2xl font-semibold tracking-tight">Team &amp; Access</h1>
        <p className="mt-1 text-[13px] text-white/45">
          Grant early access and assign roles. During early access, whitelisted
          wallets can sign in; every other wallet joins the waitlist. Dev/tester
          wallets get builder access and creator-reward eligibility without admin powers.
        </p>
      </header>

      <Panel className="fade-up p-6">
        <SectionHeading
          title="Whitelist a wallet"
          description={
            isSuper
              ? "Optionally grant dev/tester or admin status."
              : "Admins can whitelist; only a super admin can assign roles."
          }
        />
        <form onSubmit={add} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="wl-pubkey" className="mb-1.5 block text-xs uppercase tracking-widest text-white/50">
              Wallet address
            </label>
            <input
              id="wl-pubkey"
              value={pubkey}
              onChange={(e) => setPubkey(e.target.value)}
              placeholder="Solana pubkey"
              required
              className={`${field} font-mono`}
            />
          </div>
          <div className="sm:w-40">
            <label htmlFor="wl-note" className="mb-1.5 block text-xs uppercase tracking-widest text-white/50">
              Note
            </label>
            <input
              id="wl-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="teammate"
              className={field}
            />
          </div>
          {isSuper && (
            <div className="sm:w-36">
              <label htmlFor="wl-role" className="mb-1.5 block text-xs uppercase tracking-widest text-white/50">
                Role
              </label>
              <select
                id="wl-role"
                value={role}
                onChange={(e) => setRoleSel(e.target.value as typeof role)}
                className={field}
              >
                <option value="none">None</option>
                <option value="dev_tester">Dev / Tester</option>
                <option value="admin">Admin</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? "Adding…" : "Whitelist"}
          </Button>
        </form>
        {error && <p className="mt-3 text-xs text-red-400/90">{error}</p>}
      </Panel>

      <Panel className="fade-up p-6" style={{ animationDelay: "60ms" }}>
        <SectionHeading
          title="Whitelisted wallets"
          description={members ? `${members.length} total` : undefined}
        />
        {members === undefined ? (
          <div className="mt-4 space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : members.length === 0 ? (
          <EmptyState
            icon={<Icon.Shield size={20} />}
            title="No wallets whitelisted"
            description="Add a teammate's wallet above to grant access without holding $DTOUR."
          />
        ) : (
          <ul className="mt-4 divide-y divide-white/5">
            {members.map((m) => (
              <li key={m.pubkey} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-white/90">{truncate(m.pubkey)}</span>
                    {m.role && <Badge tone="accent">{ROLE_LABEL[m.role]}</Badge>}
                    {m.creatorRewardsEligible && <Badge tone="neutral">Creator split</Badge>}
                  </div>
                  {m.note && <span className="text-xs text-white/40">{m.note}</span>}
                </div>
                <div className="flex items-center gap-2">
                  {isSuper && (
                    <button
                      type="button"
                      onClick={() => changePlan(m.pubkey, m.plan !== "lifetime")}
                      title={
                        m.plan === "lifetime"
                          ? "Lifetime usage — click to revoke"
                          : "Grant lifetime usage"
                      }
                      className={
                        m.plan === "lifetime"
                          ? "rounded-full bg-emerald-400/15 px-2.5 py-1 text-xs font-medium text-emerald-300 transition hover:bg-emerald-400/25"
                          : "rounded-full border border-white/15 px-2.5 py-1 text-xs font-medium text-white/55 transition hover:bg-white/10"
                      }
                    >
                      {m.plan === "lifetime" ? "★ Lifetime" : "Lifetime"}
                    </button>
                  )}
                  {/* Lifetime is shown to super_admins only (set above). */}
                  {isSuper && (
                    <select
                      aria-label={`Role for ${truncate(m.pubkey)}`}
                      value={m.role ?? "none"}
                      onChange={(e) =>
                        changeRole(m.pubkey, e.target.value as "none" | "dev_tester" | "admin" | "super_admin")
                      }
                      className="rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-xs text-white focus:border-purple-400/50 focus:outline-none"
                    >
                      <option value="none">User</option>
                      <option value="dev_tester">Dev / Tester</option>
                      <option value="admin">Admin</option>
                      <option value="super_admin">Super Admin</option>
                    </select>
                  )}
                  <IconButton label={`Remove ${truncate(m.pubkey)}`} onClick={() => remove(m.pubkey)}>
                    <Icon.Trash size={15} />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
