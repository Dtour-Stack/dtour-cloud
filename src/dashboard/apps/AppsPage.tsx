import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { Link } from "react-router-dom";
import { useState } from "react";
import { AppShell } from "@/dashboard/AppShell";
import { getDtourSessionToken } from "@/lib/session";
import { Button, Icon } from "@/ui";

type Agent = {
  id: string;
  name: string;
  model: string;
  published: boolean;
  priceUsd: number | null;
};

export default function AppsPage() {
  const token = getDtourSessionToken();
  const agents = useQuery(anyApi.agents.list, token ? { token } : "skip") as Agent[] | undefined;
  const setApp = useMutation(anyApi.agents.setApp);
  const [prices, setPrices] = useState<Record<string, string>>({});

  return (
    <AppShell title="My Apps">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-white">My Apps</h1>
          <p className="mt-1 text-sm text-white/50">
            Publish your agents as apps with a price. Distribution to the public catalog proxies
            ElizaCloud's deploy surface.
          </p>
        </div>

        {agents === undefined ? (
          <p className="text-sm text-white/40">Loading…</p>
        ) : agents.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center">
            <div className="text-sm text-white">No agents to publish yet</div>
            <Link to="/agents" className="mt-2 inline-block text-sm text-purple-300 hover:underline">
              Build an agent →
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {agents.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4"
              >
                <div className="flex items-center gap-3">
                  <span className="rounded-lg bg-white/5 p-2 text-white/70">
                    <Icon.LayoutGrid size={16} />
                  </span>
                  <div>
                    <div className="text-sm font-medium text-white">{a.name}</div>
                    <div className="text-xs text-white/40">
                      {a.published ? `Published${a.priceUsd ? ` · $${a.priceUsd}` : " · free"}` : "Draft"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="$ price"
                    value={prices[a.id] ?? (a.priceUsd?.toString() ?? "")}
                    onChange={(e) => setPrices((p) => ({ ...p, [a.id]: e.target.value }))}
                    className="w-24 rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-xs text-white placeholder:text-white/30 focus:border-purple-400/50 focus:outline-none"
                  />
                  <Button
                    size="sm"
                    variant={a.published ? "ghost" : "secondary"}
                    onClick={() =>
                      token &&
                      setApp({
                        token,
                        id: a.id,
                        published: !a.published,
                        priceUsd: Number(prices[a.id] ?? a.priceUsd ?? 0) || undefined,
                      })
                    }
                  >
                    {a.published ? "Unpublish" : "Publish"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
