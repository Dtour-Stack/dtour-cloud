import { useAction, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { providerById, type CodingProviderId } from "@/lib/codingProviders";
import { getDtourSessionToken } from "@/lib/session";
import { Icon } from "@/ui";
import { useCodingSession } from "./CodingSessionContext";

type KeyRow = { id: string; configured: boolean; prefix: string | null };

export function CodingKeysPage({ providerId }: { providerId: CodingProviderId }) {
  const navigate = useNavigate();
  const token = getDtourSessionToken();
  const { backend, setActiveProvider, onLaunchInTerminal } = useCodingSession();
  const provider = providerById(providerId);
  const keys = useQuery(
    anyApi.codingProviders.listKeys,
    token ? { token } : "skip",
  ) as KeyRow[] | null | undefined;
  const setKey = useAction(anyApi.codingProviderActions.setKeyForUi);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const keyRow = keys?.find((k) => k.id === providerId);

  useEffect(() => {
    setActiveProvider(providerId);
  }, [providerId, setActiveProvider]);

  async function saveKey() {
    if (!token || !draft.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      await setKey({ token, uiProvider: providerId, apiKey: draft.trim() });
      setDraft("");
      setMsg(
        backend === "sandbox"
          ? "Saved — reconnect Sandbox to inject keys."
          : "Saved — reconnect Detour Cloud to inject into E2B.",
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't save key");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 px-6 py-8" data-tour="coding-launch">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">{provider.label}</h1>
        <p className="mt-1 text-[13px] text-white/45">{provider.hint}</p>
      </header>

      {keyRow?.configured && keyRow.prefix && (
        <p className="font-mono text-[12px] text-white/40">Saved key {keyRow.prefix}</p>
      )}

      <input
        type="password"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={`${provider.envVar} — paste once`}
        className="w-full rounded-xl border border-white/12 bg-black/40 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-violet-400/40 focus:outline-none"
      />
      <button
        type="button"
        disabled={busy || !draft.trim() || !token}
        onClick={() => void saveKey()}
        className="w-full rounded-xl bg-white/10 py-2.5 text-sm font-medium text-white transition hover:bg-white/15 disabled:opacity-40"
      >
        {busy ? "Saving…" : "Save encrypted key"}
      </button>
      {msg && <p className="text-[12px] text-violet-200/90">{msg}</p>}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => {
            navigate("/coding");
            onLaunchInTerminal(provider.launchCmd);
          }}
          className="flex-1 rounded-xl border border-violet-400/30 bg-violet-400/10 py-2.5 text-sm text-violet-100 transition hover:bg-violet-400/15"
        >
          Open terminal · <span className="font-mono">{provider.launchCmd}</span>
        </button>
        <a
          href={provider.docsUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-1 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-white/60 hover:bg-white/5"
        >
          Docs <Icon.ArrowUpRight size={14} />
        </a>
      </div>
    </div>
  );
}
