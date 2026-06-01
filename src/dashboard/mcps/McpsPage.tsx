import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { AppShell } from "@/dashboard/AppShell";
import { MCP_CATALOG } from "@/lib/mcpCatalog";
import { getDtourSessionToken } from "@/lib/session";
import { useFlag } from "@/lib/useFlags";
import { Button, Icon } from "@/ui";

export default function McpsPage() {
  const mcpsEnabled = useFlag("surface_mcps");
  const token = getDtourSessionToken();
  const connected = useQuery(anyApi.mcps.connected, token ? { token } : "skip") as string[] | undefined;
  const connect = useMutation(anyApi.mcps.connect);
  const disconnect = useMutation(anyApi.mcps.disconnect);
  const isOn = (id: string) => connected?.includes(id) ?? false;

  return (
    <AppShell title="MCPs">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-white">MCP servers</h1>
          <p className="mt-1 text-sm text-white/50">
            Hosted Model Context Protocol tools your agents can call. Browse + bookmark the catalog
            now; live tool execution is coming soon.
          </p>
        </div>
        <div className="rounded-lg border border-amber-400/25 bg-amber-400/[0.06] px-4 py-2.5 text-xs text-amber-200/90">
          ⓘ <span className="font-medium">Coming soon.</span> "Connect" saves the server to your
          account so it's ready to wire — agents don't execute MCP tools yet.
        </div>
        {!mcpsEnabled && (
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/50">
            MCP servers are disabled by an admin feature flag. Enable{" "}
            <code className="text-white/70">surface_mcps</code> to use this surface.
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {MCP_CATALOG.map((m) => {
            const on = isOn(m.id);
            return (
              <div
                key={m.id}
                className="flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 rounded-lg bg-white/5 p-2 text-white/70">
                    <Icon.Zap size={15} />
                  </span>
                  <div>
                    <div className="text-sm font-medium text-white">{m.name}</div>
                    <div className="text-[11px] uppercase tracking-wide text-white/35">{m.category}</div>
                    <div className="mt-1 text-xs text-white/50">{m.desc}</div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={on ? "ghost" : "secondary"}
                  disabled={!token || !mcpsEnabled}
                  onClick={() =>
                    token && (on ? disconnect({ token, mcp: m.id }) : connect({ token, mcp: m.id }))
                  }
                >
                  {on ? "Connected" : "Connect"}
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
