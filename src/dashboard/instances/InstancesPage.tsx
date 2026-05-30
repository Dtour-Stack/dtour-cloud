import { Link } from "react-router-dom";
import { AppShell } from "@/dashboard/AppShell";
import { Icon } from "@/ui";

export default function InstancesPage() {
  return (
    <AppShell title="Instances">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Instances</h1>
          <p className="mt-1 text-sm text-white/50">
            Running agent processes. Lightweight agents run on-demand while you're online; cloud
            instances run as managed containers (proxied to the ElizaCloud runtime).
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center">
          <span className="inline-flex rounded-xl bg-white/5 p-3 text-white/60">
            <Icon.LayoutGrid size={20} />
          </span>
          <div className="mt-3 text-sm text-white">Manage your agents to run instances</div>
          <p className="mx-auto mt-1 max-w-sm text-xs text-white/45">
            Create and start agents from the Agents surface. Cloud-container instances activate once
            the ElizaCloud container control-plane is wired.
          </p>
          <Link
            to="/agents"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-medium text-black hover:shadow-lg hover:shadow-white/10"
          >
            <Icon.Bot size={14} /> Go to Agents
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
