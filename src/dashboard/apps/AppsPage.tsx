import { Link } from "react-router-dom";
import { AppShell } from "@/dashboard/AppShell";
import { Icon } from "@/ui";

export default function AppsPage() {
  return (
    <AppShell title="My Apps">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-white">My Apps</h1>
          <p className="mt-1 text-sm text-white/50">
            Publish and monetize your agents as apps. Set a price, share, and earn — distribution is
            proxied to ElizaCloud's deploy surface.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center">
          <span className="inline-flex rounded-xl bg-white/5 p-3 text-white/60">
            <Icon.LayoutGrid size={20} />
          </span>
          <div className="mt-3 text-sm text-white">No published apps yet</div>
          <p className="mx-auto mt-1 max-w-sm text-xs text-white/45">
            Build an agent, then publish it here to monetize. Publishing + distribution activate with
            the ElizaCloud deploy proxy.
          </p>
          <Link
            to="/agents"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-medium text-black hover:shadow-lg hover:shadow-white/10"
          >
            <Icon.Bot size={14} /> Build an agent
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
