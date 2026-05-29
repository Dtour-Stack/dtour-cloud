import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { useState } from "react";
import { getDtourSessionToken } from "@/lib/session";
import {
  Button,
  EmptyState,
  Icon,
  IconButton,
  Panel,
  SectionHeading,
  Skeleton,
} from "@/ui";

type Entry = { email: string; pubkey: string | null; at: number };

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
  const entries = useQuery(
    anyApi.waitlist.list,
    token ? { token } : "skip",
  ) as Entry[] | undefined;
  const removeEntry = useMutation(anyApi.waitlist.remove);
  const [copied, setCopied] = useState(false);

  async function remove(email: string) {
    if (!token) return;
    try {
      await removeEntry({ token, email });
    } catch {
      /* ignore — list is reactive */
    }
  }

  async function copyEmails() {
    if (!entries?.length) return;
    try {
      await navigator.clipboard.writeText(entries.map((e) => e.email).join(", "));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  return (
    <Panel className="fade-up p-6">
      <SectionHeading
        title="Waitlist signups"
        description={entries ? `${entries.length} total` : undefined}
        action={
          entries && entries.length > 0 ? (
            <Button size="sm" variant="secondary" onClick={copyEmails}>
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
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<Icon.Sparkles size={20} />}
          title="No signups yet"
          description="Non-whitelisted wallets that enter their email at the gate show up here."
        />
      ) : (
        <ul className="mt-4 divide-y divide-white/5">
          {entries.map((e) => (
            <li
              key={e.email}
              className="flex items-center justify-between gap-3 py-3"
            >
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
    </Panel>
  );
}
