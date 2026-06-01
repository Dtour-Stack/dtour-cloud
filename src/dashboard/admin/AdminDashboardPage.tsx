import type { ReactNode } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Icon } from "@/ui";
import { AppShell, type NavItem } from "../AppShell";
import { AdminAnalytics } from "./AdminAnalytics";
import { AdminBroadcast } from "./AdminBroadcast";
import { AdminConfig } from "./AdminConfig";
import { AdminDebugLog } from "./AdminDebugLog";
import { AdminFlags } from "./AdminFlags";
import { AdminTeam } from "./AdminTeam";
import { AdminTokenomics } from "./AdminTokenomics";
import { AdminUsers } from "./AdminUsers";
import { AdminWaitlist } from "./AdminWaitlist";

const ADMIN_NAV: NavItem[] = [
  { to: "/admin", label: "Overview", icon: <Icon.Activity />, end: true },
  { to: "/admin/users", label: "Users", icon: <Icon.User /> },
  { to: "/admin/team", label: "Team & Access", icon: <Icon.Shield /> },
  { to: "/admin/waitlist", label: "Requests", icon: <Icon.Sparkles /> },
  { to: "/admin/tokenomics", label: "Tokenomics", icon: <Icon.Coins /> },
  { to: "/admin/broadcast", label: "Broadcast", icon: <Icon.Megaphone /> },
  { to: "/admin/settings", label: "Settings", icon: <Icon.Settings /> },
  { to: "/admin/flags", label: "Feature Flags", icon: <Icon.Flag /> },
  { to: "/admin/logs", label: "Activity Log", icon: <Icon.List /> },
];

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <header className="fade-up">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-[13px] text-white/45">{description}</p>
      </header>
      {children}
    </div>
  );
}

const SECTIONS: Record<string, ReactNode> = {
  overview: (
    <Section title="Overview" description="Live metrics across Detour Cloud.">
      <AdminAnalytics />
    </Section>
  ),
  users: (
    <Section
      title="Users"
      description="Every signed-in wallet, their tier, and per-user actions."
    >
      <AdminUsers />
    </Section>
  ),
  // Team manages its own page container + header.
  team: <AdminTeam />,
  // Tokenomics manages its own page container + header.
  tokenomics: <AdminTokenomics />,
  waitlist: (
    <Section
      title="Access Requests"
      description="Early-access signups and tester applications from the login gate."
    >
      <AdminWaitlist />
    </Section>
  ),
  broadcast: (
    <Section
      title="Broadcast"
      description="Send a message to every user's inbox at once."
    >
      <AdminBroadcast />
    </Section>
  ),
  settings: (
    <Section
      title="Settings"
      description="Edit any platform config — branding, access, billing, inference."
    >
      <AdminConfig />
    </Section>
  ),
  flags: (
    <Section
      title="Feature Flags"
      description="Grouped toggles for inference rails, product surfaces, and builders-phase features."
    >
      <AdminFlags />
    </Section>
  ),
  logs: (
    <Section
      title="Activity Log"
      description="Recent admin and system events for auditing."
    >
      <AdminDebugLog />
    </Section>
  ),
};

export default function AdminDashboardPage() {
  const { section } = useParams();
  const key = section ?? "overview";
  const content = SECTIONS[key];

  // Unknown section → bounce to overview rather than render a blank area.
  if (!content) return <Navigate to="/admin" replace />;

  return (
    <AppShell title="Admin" nav={ADMIN_NAV} context="admin">
      {content}
    </AppShell>
  );
}
