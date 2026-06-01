import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { useState } from "react";
import type { Role } from "@/lib/roles";
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

type Entry = {
  email: string;
  pubkey: string | null;
  kind: "early_access" | "dev_tester";
  name: string | null;
  reason: string | null;
  at: number;
};

function truncate(a: string) {
  return a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}

function fmtDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function AdminWaitlist() {
  const token = getDtourSessionToken();
  const me = useQuery(anyApi.users.me, token ? { token } : "skip") as
    | { role?: Role }
    | null
    | undefined;
  const entries = useQuery(
    anyApi.waitlist.list,
    token ? { token } : "skip",
  ) as Entry[] | undefined;
  const removeEntry = useMutation(anyApi.waitlist.remove);
  const approveTester = useMutation(anyApi.waitlist.approveTester);
  const denyTester = useMutation(anyApi.waitlist.denyTester);
  const [copied, setCopied] = useState(false);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canReview = me?.role === "super_admin" || me?.role === "admin";
  const testerApplications = entries?.filter((e) => e.kind === "dev_tester") ?? [];
  const accessEntries = entries?.filter((e) => e.kind !== "dev_tester") ?? [];

  async function remove(email: string) {
    if (!token) return;
    setError(null);
    try {
      await removeEntry({ token, email });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove entry");
    }
  }

  async function approve(email: string) {
    if (!token) return;
    setBusyEmail(`approve:${email}`);
    setError(null);
    try {
      await approveTester({ token, email });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to approve application");
    } finally {
      setBusyEmail(null);
    }
  }

  async function deny(email: string) {
    if (!token) return;
    setBusyEmail(`deny:${email}`);
    setError(null);
    try {
      await denyTester({ token, email, reason: "Denied from admin requests queue" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to deny application");
    } finally {
      setBusyEmail(null);
    }
  }

  async function copyEmails(items: Entry[]) {
    if (!items.length) return;
    try {
      await navigator.clipboard.writeText(items.map((e) => e.email).join(", "));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Clipboard access was blocked");
    }
  }

  return (
    <div className="space-y-6">
      <Panel className="fade-up p-6">
        <SectionHeading
          title="Tester / early dev applications"
          description={
            entries ? `${testerApplications.length} pending` : undefined
          }
        />
        {entries === undefined ? (
          <div className="mt-4 space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : testerApplications.length === 0 ? (
          <EmptyState
            icon={<Icon.Shield size={20} />}
            title="No tester applications"
            description="Applications from the login gate appear here for review."
          />
        ) : (
          <ul className="mt-4 divide-y divide-white/5">
            {testerApplications.map((e) => (
              <li key={e.email} className="flex items-center justify-between gap-4 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm text-white/90">{e.email}</span>
                    <Badge tone="accent">Dev / Tester</Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/40">
                    {e.name && <span>{e.name}</span>}
                    {e.pubkey && <span className="font-mono">{truncate(e.pubkey)}</span>}
                    <span>{fmtDate(e.at)}</span>
                  </div>
                  {e.reason && (
                    <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-white/55">
                      {e.reason}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {canReview && e.pubkey && (
                    <Button
                      size="sm"
                      onClick={() => approve(e.email)}
                      disabled={busyEmail === `approve:${e.email}`}
                    >
                      {busyEmail === `approve:${e.email}` ? "Approving…" : "Approve"}
                    </Button>
                  )}
                  {canReview && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => deny(e.email)}
                      disabled={busyEmail === `deny:${e.email}`}
                    >
                      {busyEmail === `deny:${e.email}` ? "Denying…" : "Deny"}
                    </Button>
                  )}
                  <IconButton label={`Remove ${e.email}`} onClick={() => remove(e.email)}>
                    <Icon.Trash size={15} />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel className="fade-up p-6" style={{ animationDelay: "60ms" }}>
        <SectionHeading
          title="Waitlist signups"
          description={entries ? `${accessEntries.length} total` : undefined}
          action={
            accessEntries && accessEntries.length > 0 ? (
              <Button size="sm" variant="secondary" onClick={() => copyEmails(accessEntries)}>
                <Icon.Copy size={14} /> {copied ? "Copied" : "Copy emails"}
              </Button>
            ) : undefined
          }
        />
        {entries === undefined ? (
          <div className="mt-4 space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : accessEntries.length === 0 ? (
          <EmptyState
            icon={<Icon.Sparkles size={20} />}
            title="No signups yet"
            description="Non-whitelisted wallets that enter their email at the gate show up here."
          />
        ) : (
          <ul className="mt-4 divide-y divide-white/5">
            {accessEntries.map((e) => (
              <li key={e.email} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <span className="block truncate text-sm text-white/90">
                    {e.email}
                  </span>
                  {e.pubkey && (
                    <span className="font-mono text-xs text-white/40">
                      {truncate(e.pubkey)}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-white/40">{fmtDate(e.at)}</span>
                  <IconButton label={`Remove ${e.email}`} onClick={() => remove(e.email)}>
                    <Icon.Trash size={15} />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
        {error && <p className="mt-3 text-xs text-red-400/90">{error}</p>}
      </Panel>
    </div>
  );
}
