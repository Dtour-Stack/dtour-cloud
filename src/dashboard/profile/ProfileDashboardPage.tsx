import type { ReactNode } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Icon } from "@/ui";
import { AffiliatesHome } from "../affiliates/AffiliatesPage";
import { BillingHome } from "../billing/BillingPage";
import { AppShell, type NavItem } from "../AppShell";
import { ProfileHome } from "./ProfileHome";

const PROFILE_NAV: NavItem[] = [
  { to: "/profile", label: "Profile", icon: <Icon.User />, end: true },
  { to: "/profile/billing", label: "Billing", icon: <Icon.Wallet /> },
  { to: "/profile/affiliates", label: "Affiliates", icon: <Icon.Flag /> },
];

const SECTIONS: Record<string, ReactNode> = {
  overview: <ProfileHome />,
  billing: <BillingHome />,
  affiliates: <AffiliatesHome />,
};

export default function ProfileDashboardPage() {
  const { section } = useParams();
  const key = section ?? "overview";

  const content = SECTIONS[key];
  if (!content) return <Navigate to="/profile" replace />;

  return (
    <AppShell title="Profile" nav={PROFILE_NAV} context="profile">
      {content}
    </AppShell>
  );
}
