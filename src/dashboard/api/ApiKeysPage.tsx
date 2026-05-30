import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { useState } from "react";
import { AppShell } from "@/dashboard/AppShell";
import { getDtourSessionToken } from "@/lib/session";
import { Button, Icon } from "@/ui";

type Key = { id: string; label: string; masked: string; createdAt: number; lastUsedAt: number | null };

export default function ApiKeysPage() {
  const token = getDtourSessionToken();
  const keys = useQuery(anyApi.apikeys.list, token ? { token } : "skip") as Key[] | undefined;
  const create = useMutation(anyApi.apikeys.create);
  const revoke = useMutation(anyApi.apikeys.revoke);
  const [label, setLabel] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!token || !label.trim()) return;
    setBusy(true);
    try {
      const r = (await create({ token, label })) as { key: string };
      setFresh(r.key);
      setLabel("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="API Keys">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-white">API Keys</h1>
          <p className="mt-1 text-sm text-white/50">
            Programmatic access to the Detour API. Keys are shown once — store them safely.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex gap-2">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Key label (e.g. production)"
              className="flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-purple-400/50 focus:outline-none"
            />
            <Button onClick={add} disabled={busy || !label.trim()}>
              <Icon.Plus size={14} /> Create
            </Button>
          </div>
          {fresh && (
            <div className="mt-3 rounded-lg border border-emerald-400/30 bg-emerald-400/[0.06] p-3">
              <p className="text-xs text-emerald-200">Copy your key now — it won't be shown again:</p>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 break-all rounded bg-black/40 px-2 py-1 font-mono text-xs text-white">
                  {fresh}
                </code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(fresh)}
                  className="text-white/50 hover:text-white"
                >
                  <Icon.Copy size={14} />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02]">
          {keys === undefined ? (
            <p className="p-4 text-sm text-white/40">Loading…</p>
          ) : keys.length === 0 ? (
            <p className="p-4 text-sm text-white/40">No keys yet.</p>
          ) : (
            keys.map((k) => (
              <div
                key={k.id}
                className="flex items-center justify-between border-b border-white/5 p-4 last:border-0"
              >
                <div>
                  <div className="text-sm text-white">{k.label}</div>
                  <code className="font-mono text-xs text-white/40">{k.masked}</code>
                </div>
                <Button size="sm" variant="ghost" onClick={() => token && revoke({ token, id: k.id })}>
                  <Icon.Trash size={13} /> Revoke
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}
