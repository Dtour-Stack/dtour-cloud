import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { AppShell } from "@/dashboard/AppShell";
import { getDtourSessionToken } from "@/lib/session";
import { Button, Icon } from "@/ui";

const MCPS: { id: string; name: string; category: string; desc: string }[] = [
  { id: "web-search", name: "Web Search", category: "Knowledge", desc: "Live web results for your agents." },
  { id: "crypto", name: "Crypto", category: "Knowledge", desc: "Token prices + on-chain data." },
  { id: "weather", name: "Weather", category: "Knowledge", desc: "Current + forecast weather." },
  { id: "time", name: "Time", category: "Utility", desc: "Timezones + scheduling helpers." },
  { id: "asana", name: "Asana", category: "Productivity", desc: "Tasks + projects." },
  { id: "jira", name: "Jira", category: "Productivity", desc: "Issues + sprints." },
  { id: "zoom", name: "Zoom", category: "Productivity", desc: "Meetings + recordings." },
];

export default function McpsPage() {
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
            Hosted Model Context Protocol tools your agents can call. Connections are saved to your
            account; tool execution proxies ElizaCloud's MCP registry.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {MCPS.map((m) => {
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
                  disabled={!token}
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
