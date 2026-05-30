import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { RequireRole } from "@/dashboard/RequireRole";
import { RequireSession } from "@/dashboard/RequireSession";
import DtourLandingPage from "@/pages/dtour-landing-page";
import DtourTokenPage from "@/pages/dtour-token-page";
import { SolanaWalletProvider } from "@/providers/SolanaWalletProvider";

// Login + dashboard are lazy: their wallet/Convex deps stay out of the
// landing/token render path.
const DtourLoginPage = lazy(() => import("@/pages/login/dtour-login-page"));
const DtourOnboardingPage = lazy(
  () => import("@/pages/onboarding/dtour-onboarding-page"),
);
const DtourDashboardPage = lazy(
  () => import("@/dashboard/dtour-dashboard-page"),
);
const AdminDashboardPage = lazy(
  () => import("@/dashboard/admin/AdminDashboardPage"),
);
const DesignDashboardPage = lazy(
  () => import("@/dashboard/design/DesignDashboardPage"),
);
const CodingDashboardPage = lazy(
  () => import("@/dashboard/coding/CodingDashboardPage"),
);
const ProfilePage = lazy(() => import("@/dashboard/profile/ProfilePage"));
const AgentsPage = lazy(() => import("@/dashboard/agents/AgentsPage"));

// New dashboard surfaces (one file per surface, owned by sibling agents). Each
// is lazy so its deps stay off the landing/token render path, and each is gated
// behind RequireSession (these are $DTOUR-holder user surfaces).
const ApiExplorerPage = lazy(() => import("@/dashboard/api/ApiExplorerPage"));
const ApiKeysPage = lazy(() => import("@/dashboard/api/ApiKeysPage"));
const DocsPage = lazy(() => import("@/dashboard/docs/DocsPage"));
const InstancesPage = lazy(() => import("@/dashboard/instances/InstancesPage"));
const McpsPage = lazy(() => import("@/dashboard/mcps/McpsPage"));
const SettingsPage = lazy(() => import("@/dashboard/settings/SettingsPage"));
const AccountPage = lazy(() => import("@/dashboard/account/AccountPage"));
const SecurityPage = lazy(() => import("@/dashboard/security/SecurityPage"));
const AppsPage = lazy(() => import("@/dashboard/apps/AppsPage"));
const EarningsPage = lazy(() => import("@/dashboard/earnings/EarningsPage"));
const AffiliatesPage = lazy(() => import("@/dashboard/affiliates/AffiliatesPage"));
const BillingPage = lazy(() => import("@/dashboard/billing/BillingPage"));
const AnalyticsPage = lazy(() => import("@/dashboard/analytics/AnalyticsPage"));

export default function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<DtourLandingPage />} />
        <Route path="/token" element={<DtourTokenPage />} />
        <Route path="/login" element={<DtourLoginPage />} />
        <Route path="/onboarding" element={<DtourOnboardingPage />} />
        <Route
          path="/dashboard"
          element={
            <RequireSession>
              <DtourDashboardPage />
            </RequireSession>
          }
        />
        <Route
          path="/profile"
          element={
            <RequireSession>
              <ProfilePage />
            </RequireSession>
          }
        />
        <Route
          path="/agents"
          element={
            <RequireSession>
              <AgentsPage />
            </RequireSession>
          }
        />
        <Route
          path="/agents/:agentId"
          element={
            <RequireSession>
              <AgentsPage />
            </RequireSession>
          }
        />

        {/* New dashboard surfaces — all RequireSession-gated user surfaces. */}
        <Route
          path="/api-explorer"
          element={
            <RequireSession>
              <ApiExplorerPage />
            </RequireSession>
          }
        />
        <Route
          path="/api-keys"
          element={
            <RequireSession>
              <ApiKeysPage />
            </RequireSession>
          }
        />
        <Route
          path="/docs"
          element={
            <RequireSession>
              <DocsPage />
            </RequireSession>
          }
        />
        <Route
          path="/instances"
          element={
            <RequireSession>
              <InstancesPage />
            </RequireSession>
          }
        />
        <Route
          path="/mcps"
          element={
            <RequireSession>
              <McpsPage />
            </RequireSession>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireSession>
              <SettingsPage />
            </RequireSession>
          }
        />
        <Route
          path="/account"
          element={
            <RequireSession>
              <AccountPage />
            </RequireSession>
          }
        />
        <Route
          path="/security"
          element={
            <RequireSession>
              <SecurityPage />
            </RequireSession>
          }
        />
        <Route
          path="/apps"
          element={
            <RequireSession>
              <AppsPage />
            </RequireSession>
          }
        />
        <Route
          path="/earnings"
          element={
            <RequireSession>
              <EarningsPage />
            </RequireSession>
          }
        />
        <Route
          path="/affiliates"
          element={
            <RequireSession>
              <AffiliatesPage />
            </RequireSession>
          }
        />
        {/* Billing nests the Solana wallet adapter so the Top-up modal can sign
            with the connected wallet — same pattern as the admin/coding routes. */}
        <Route
          path="/billing"
          element={
            <RequireSession>
              <SolanaWalletProvider>
                <BillingPage />
              </SolanaWalletProvider>
            </RequireSession>
          }
        />
        <Route
          path="/analytics"
          element={
            <RequireSession>
              <AnalyticsPage />
            </RequireSession>
          }
        />

        {/* Admin routes mount the Solana wallet adapter so the Tokenomics
            Execute panel can sign with the connected creator wallet. The
            ConnectionProvider endpoint is the PUBLIC client SOLANA_RPC_URL
            (non-key-bearing) — used only for wallet connect; all RPC goes
            through the admin-gated Convex actions. */}
        <Route
          path="/admin"
          element={
            <RequireRole min="admin">
              <SolanaWalletProvider>
                <AdminDashboardPage />
              </SolanaWalletProvider>
            </RequireRole>
          }
        />
        <Route
          path="/admin/:section"
          element={
            <RequireRole min="admin">
              <SolanaWalletProvider>
                <AdminDashboardPage />
              </SolanaWalletProvider>
            </RequireRole>
          }
        />
        <Route
          path="/design"
          element={
            <RequireRole min="pro_user">
              <DesignDashboardPage />
            </RequireRole>
          }
        />
        <Route
          path="/design/:section"
          element={
            <RequireRole min="pro_user">
              <DesignDashboardPage />
            </RequireRole>
          }
        />
        <Route
          path="/coding"
          element={
            <RequireRole min="pro_user">
              <SolanaWalletProvider>
                <CodingDashboardPage />
              </SolanaWalletProvider>
            </RequireRole>
          }
        />
        <Route
          path="/coding/:section"
          element={
            <RequireRole min="pro_user">
              <SolanaWalletProvider>
                <CodingDashboardPage />
              </SolanaWalletProvider>
            </RequireRole>
          }
        />
      </Routes>
    </Suspense>
  );
}
