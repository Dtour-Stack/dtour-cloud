import { useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { Link } from "react-router-dom";
import { AppShell } from "@/dashboard/AppShell";
import { getDtourSessionToken } from "@/lib/session";
import { Icon } from "@/ui";

type Agent = {
  id: string;
  name: string;
  model: string;
  type: string;
  plugins: string[];
};

export default function InstancesPage() {
  const token = getDtourSessionToken();
  const agents = useQuery(anyApi.agents.list, token ? { token } : "skip") as Agent[] | undefined;

  return (
    <AppShell title="Instances">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Instances</h1>
          <p className="mt-1 text-sm text-white/50">
            Your running agents. Lightweight agents run on-demand while you're online; cloud
            containers run via the ElizaCloud runtime.
          </p>
        </div>

        {agents === undefined ? (
          <p className="text-sm text-white/40">Loading…</p>
        ) : agents.length === 0 ? (
          <Empty />
        ) : (
          <div className="space-y-2">
            {agents.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] p-4"
              >
                <div className="flex items-center gap-3">
                  <span className="rounded-lg bg-white/5 p-2 text-white/70">
                    <Icon.Bot size={16} />
                  </span>
                  <div>
                    <div className="text-sm font-medium text-white">{a.name}</div>
                    <div className="text-xs text-white/40">
                      {a.type} · {a.model}
                      {a.plugins.length > 0 ? ` · ${a.plugins.length} plugin(s)` : ""}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 text-xs text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> on-demand
                  </span>
                  <Link to={`/agents/${a.id}`} className="text-xs text-purple-300 hover:underline">
                    Open
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Empty() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center">
      <div className="text-sm text-white">No instances yet</div>
      <Link
        to="/agents"
        className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-medium text-black hover:shadow-lg hover:shadow-white/10"
      >
        <Icon.Bot size={14} /> Create an agent
      </Link>
    </div>
  );
}
