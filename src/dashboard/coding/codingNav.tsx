import type { NavItem } from "@/dashboard/AppShell";
import { CODING_PROVIDERS } from "@/lib/codingProviders";
import { Icon } from "@/ui";

/** Coding dashboard nav — replaces USER_NAV while in the Coding context. */
export const CODING_NAV: NavItem[] = [
  { to: "/coding", label: "Terminal", icon: <Icon.Zap />, end: true },
  { to: "/coding/setup", label: "Setup", icon: <Icon.Settings /> },
  { to: "/coding/draft", label: "Draft lab", icon: <Icon.Bot /> },
  { to: "/coding/saves", label: "Saved work", icon: <Icon.Copy /> },
  ...CODING_PROVIDERS.map((p) => ({
    to: `/coding/${p.id}`,
    label: p.label,
    icon: <Icon.Plug />,
    group: "Agents",
  })),
];

export const CODING_SECTIONS = new Set([
  "setup",
  "draft",
  "saves",
  "terminal",
  ...CODING_PROVIDERS.map((p) => p.id),
]);
