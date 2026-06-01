import { Link } from "react-router-dom";
import { AppShell } from "@/dashboard/AppShell";
import { Icon } from "@/ui";

const TOPICS: { title: string; body: string; to?: string; href?: string }[] = [
  { title: "Getting started", body: "Connect a Solana wallet, hold $DTOUR, and you're in.", to: "/dashboard" },
  { title: "$DTOUR access & discount", body: "Holding ≥0.5% of supply waives the markup (20% off).", to: "/token" },
  { title: "Agents", body: "Create lightweight agents — persona + model, no container.", to: "/agents" },
  { title: "Workflows & Design", body: "Compose generation + agent graphs visually.", to: "/design" },
  { title: "Coding sandboxes", body: "Real coding agents in isolated sandboxes, billed in credits.", to: "/coding" },
  { title: "Affiliates", body: "Earn a share of the platform fee on referrals.", to: "/profile/affiliates" },
  { title: "API", body: "Programmatic access — mint a key, call the Detour API.", to: "/api-keys" },
  { title: "elizaOS docs", body: "The underlying agent runtime documentation.", href: "https://docs.elizaos.ai" },
];

export default function DocsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const body = (
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Docs</h1>
          <p className="mt-1 text-sm text-white/50">Everything you need to build on Detour Cloud.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {TOPICS.map((t) => {
            const inner = (
              <div className="flex h-full items-start justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition hover:border-white/20 hover:bg-white/[0.04]">
                <div>
                  <div className="text-sm font-medium text-white">{t.title}</div>
                  <div className="mt-1 text-xs text-white/50">{t.body}</div>
                </div>
                <Icon.ArrowUpRight size={15} className="shrink-0 text-white/30" />
              </div>
            );
            return t.href ? (
              <a key={t.title} href={t.href} target="_blank" rel="noreferrer">
                {inner}
              </a>
            ) : (
              <Link key={t.title} to={t.to ?? "/dashboard"}>
                {inner}
              </Link>
            );
          })}
        </div>
      </div>
    );
  return embedded ? body : <AppShell title="Docs">{body}</AppShell>;
}
