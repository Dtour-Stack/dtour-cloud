import { AppShell } from "@/dashboard/AppShell";
import { Button, Icon } from "@/ui";

const MCPS: { name: string; category: string; desc: string }[] = [
  { name: "Web Search", category: "Knowledge", desc: "Live web results for your agents." },
  { name: "Crypto", category: "Knowledge", desc: "Token prices + on-chain data." },
  { name: "Weather", category: "Knowledge", desc: "Current + forecast weather." },
  { name: "Time", category: "Utility", desc: "Timezones + scheduling helpers." },
  { name: "Asana", category: "Productivity", desc: "Tasks + projects." },
  { name: "Jira", category: "Productivity", desc: "Issues + sprints." },
  { name: "Zoom", category: "Productivity", desc: "Meetings + recordings." },
];

export default function McpsPage() {
  return (
    <AppShell title="MCPs">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-white">MCP servers</h1>
          <p className="mt-1 text-sm text-white/50">
            Hosted Model Context Protocol tools your agents can call. Connecting proxies ElizaCloud's
            MCP registry.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {MCPS.map((m) => (
            <div
              key={m.name}
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
              <Button size="sm" variant="ghost" disabled>
                Connect
              </Button>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
