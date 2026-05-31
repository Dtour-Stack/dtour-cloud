import { useState } from "react";
import { AppShell } from "@/dashboard/AppShell";
import ApiExplorerPage from "@/dashboard/api/ApiExplorerPage";
import ApiKeysPage from "@/dashboard/api/ApiKeysPage";
import DocsPage from "@/dashboard/docs/DocsPage";
import { cn } from "@/ui";

const TABS = [
  { key: "explorer", label: "API Explorer" },
  { key: "keys", label: "API Keys" },
  { key: "docs", label: "Docs" },
] as const;

export default function DevelopersPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("explorer");
  return (
    <AppShell title="Developers">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-4 text-xl font-semibold text-white">Developers</h1>
        <div className="mb-5 flex gap-1 rounded-full border border-white/10 bg-white/[0.02] p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "flex-1 rounded-full px-3 py-1.5 text-sm transition",
                tab === t.key ? "bg-white/10 text-white" : "text-white/55 hover:text-white",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === "explorer" && <ApiExplorerPage embedded />}
        {tab === "keys" && <ApiKeysPage embedded />}
        {tab === "docs" && <DocsPage embedded />}
      </div>
    </AppShell>
  );
}
