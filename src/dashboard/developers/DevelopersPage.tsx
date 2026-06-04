import { useState } from "react";
import { AppShell } from "@/dashboard/AppShell";
import { SurfaceUnavailable } from "@/dashboard/SurfaceGate";
import ApiExplorerPage from "@/dashboard/api/ApiExplorerPage";
import ApiKeysPage from "@/dashboard/api/ApiKeysPage";
import DocsPage from "@/dashboard/docs/DocsPage";
import { surfaceLabelForRoute } from "@/lib/surfaceFlags";
import { useFlags } from "@/lib/useFlags";
import { Badge, cn } from "@/ui";

const TABS = [
  { key: "explorer", label: "API Explorer", route: "/api-explorer" },
  { key: "keys", label: "API Keys", route: "/api-keys" },
  { key: "docs", label: "Docs", route: "/docs" },
] as const;

export default function DevelopersPage() {
  const flags = useFlags();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("docs");
  const active = TABS.find((t) => t.key === tab) ?? TABS[0];
  const activeLabel = surfaceLabelForRoute(active.route, flags);
  return (
    <AppShell title="Developers">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-4 text-xl font-semibold text-white">Developers</h1>
        <div className="mb-5 flex gap-1 rounded-full border border-white/10 bg-white/[0.02] p-1">
          {TABS.map((t) => {
            const surfaceLabel = surfaceLabelForRoute(t.route, flags);
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-1.5 text-sm transition",
                  tab === t.key ? "bg-white/10 text-white" : "text-white/55 hover:text-white",
                )}
              >
                {t.label}
                {surfaceLabel && (
                  <Badge
                    tone={surfaceLabel === "Coming soon" ? "warning" : "accent"}
                    className="px-1.5 py-0 text-[9px]"
                  >
                    {surfaceLabel}
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
        {activeLabel === "Coming soon" ? (
          <SurfaceUnavailable path={active.route} embedded />
        ) : (
          <>
            {tab === "explorer" && <ApiExplorerPage embedded />}
            {tab === "keys" && <ApiKeysPage embedded />}
            {tab === "docs" && <DocsPage embedded />}
          </>
        )}
      </div>
    </AppShell>
  );
}
