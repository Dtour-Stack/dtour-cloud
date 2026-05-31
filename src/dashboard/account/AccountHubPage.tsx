import { useState } from "react";
import { AppShell } from "@/dashboard/AppShell";
import AccountPage from "@/dashboard/account/AccountPage";
import SecurityPage from "@/dashboard/security/SecurityPage";
import SettingsPage from "@/dashboard/settings/SettingsPage";
import { cn } from "@/ui";

const TABS = [
  { key: "account", label: "Account" },
  { key: "security", label: "Security" },
  { key: "settings", label: "Settings" },
] as const;

export default function AccountHubPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("account");
  return (
    <AppShell title="Account">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-4 text-xl font-semibold text-white">Account</h1>
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
        {tab === "account" && <AccountPage embedded />}
        {tab === "security" && <SecurityPage embedded />}
        {tab === "settings" && <SettingsPage embedded />}
      </div>
    </AppShell>
  );
}
