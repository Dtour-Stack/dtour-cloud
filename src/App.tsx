import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { RequireRole } from "@/dashboard/RequireRole";
import { RequireSession } from "@/dashboard/RequireSession";
import { SurfaceGate } from "@/dashboard/SurfaceGate";
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
const ProfileDashboardPage = lazy(
  () => import("@/dashboard/profile/ProfileDashboardPage"),
);
const AgentsPage = lazy(() => import("@/dashboard/agents/AgentsPage"));
const CloudBuilderPage = lazy(() => import("@/dashboard/cloud/CloudBuilderPage"));

// New dashboard surfaces (one file per surface, owned by sibling agents). Each
// is lazy so its deps stay off the landing/token render path, and each is gated
// behind RequireSession (these are $DTOUR-holder user surfaces).
const ApiExplorerPage = lazy(() => import("@/dashboard/api/ApiExplorerPage"));
const ApiKeysPage = lazy(() => import("@/dashboard/api/ApiKeysPage"));
const DocumentsPage = lazy(() => import("@/dashboard/documents/DocumentsPage"));
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
const DevelopersPage = lazy(() => import("@/dashboard/developers/DevelopersPage"));
const AccountHubPage = lazy(() => import("@/dashboard/account/AccountHubPage"));
const GalleryPage = lazy(() => import("@/dashboard/gallery/GalleryPage"));
const CustomDashboardPage = lazy(() => import("@/dashboard/custom/CustomDashboardPage"));

export default function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<DtourLandingPage />} />
        <Route path="/token" element={<DtourTokenPage />} />
        <Route path="/login" element={<DtourLoginPage />} />
        <Route path="/onboarding" element={<DtourOnboardingPage />} />
        <Route
          path="/dashboard/custom/:dashboardId"
          element={
            <RequireSession>
              <CustomDashboardPage />
            </RequireSession>
          }
        />
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
              <SurfaceGate path="/profile">
                <SolanaWalletProvider>
                  <ProfileDashboardPage />
                </SolanaWalletProvider>
              </SurfaceGate>
            </RequireSession>
          }
        />
        <Route
          path="/profile/:section"
          element={
            <RequireSession>
              <SurfaceGate path="/profile">
                <SolanaWalletProvider>
                  <ProfileDashboardPage />
                </SolanaWalletProvider>
              </SurfaceGate>
            </RequireSession>
          }
        />
        <Route
          path="/agents"
          element={
            <RequireSession>
              <SurfaceGate path="/agents">
                <AgentsPage />
              </SurfaceGate>
            </RequireSession>
          }
        />
        <Route
          path="/cloud-builder"
          element={
            <RequireSession>
              <CloudBuilderPage />
            </RequireSession>
          }
        />
        <Route
          path="/agents/:agentId"
          element={
            <RequireSession>
              <SurfaceGate path="/agents">
                <AgentsPage />
              </SurfaceGate>
            </RequireSession>
          }
        />

        {/* New dashboard surfaces — all RequireSession-gated user surfaces. */}
        <Route
          path="/api-explorer"
          element={
            <RequireSession>
              <SurfaceGate path="/api-explorer">
                <ApiExplorerPage />
              </SurfaceGate>
            </RequireSession>
          }
        />
        <Route
          path="/api-keys"
          element={
            <RequireSession>
              <SurfaceGate path="/api-keys">
                <ApiKeysPage />
              </SurfaceGate>
            </RequireSession>
          }
        />
        <Route
          path="/docs"
          element={
            <RequireSession>
              <SurfaceGate path="/docs">
                <DocsPage />
              </SurfaceGate>
            </RequireSession>
          }
        />
        <Route
          path="/instances"
          element={
            <RequireSession>
              <SurfaceGate path="/instances">
                <InstancesPage />
              </SurfaceGate>
            </RequireSession>
          }
        />
        <Route
          path="/mcps"
          element={
            <RequireSession>
              <SurfaceGate path="/mcps">
                <McpsPage />
              </SurfaceGate>
            </RequireSession>
          }
        />
        <Route
          path="/documents"
          element={
            <RequireSession>
              <SurfaceGate path="/documents">
                <DocumentsPage />
              </SurfaceGate>
            </RequireSession>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireSession>
              <SurfaceGate path="/settings">
                <SettingsPage />
              </SurfaceGate>
            </RequireSession>
          }
        />
        <Route
          path="/account"
          element={
            <RequireSession>
              <SurfaceGate path="/account">
                <AccountPage />
              </SurfaceGate>
            </RequireSession>
          }
        />
        <Route
          path="/security"
          element={
            <RequireSession>
              <SurfaceGate path="/security">
                <SecurityPage />
              </SurfaceGate>
            </RequireSession>
          }
        />
        <Route
          path="/apps"
          element={
            <RequireSession>
              <SurfaceGate path="/apps">
                <AppsPage />
              </SurfaceGate>
            </RequireSession>
          }
        />
        <Route
          path="/earnings"
          element={
            <RequireSession>
              <SurfaceGate path="/earnings">
                <EarningsPage />
              </SurfaceGate>
            </RequireSession>
          }
        />
        <Route
          path="/affiliates"
          element={
            <RequireSession>
              <SurfaceGate path="/affiliates">
                <AffiliatesPage />
              </SurfaceGate>
            </RequireSession>
          }
        />
        <Route
          path="/billing"
          element={
            <RequireSession>
              <SurfaceGate path="/billing">
                <BillingPage />
              </SurfaceGate>
            </RequireSession>
          }
        />
        <Route
          path="/analytics"
          element={
            <RequireSession>
              <SurfaceGate path="/analytics">
                <AnalyticsPage />
              </SurfaceGate>
            </RequireSession>
          }
        />
        <Route
          path="/developers"
          element={
            <RequireSession>
              <SurfaceGate path="/developers">
                <DevelopersPage />
              </SurfaceGate>
            </RequireSession>
          }
        />
        <Route
          path="/account-hub"
          element={
            <RequireSession>
              <SurfaceGate path="/account-hub">
                <AccountHubPage />
              </SurfaceGate>
            </RequireSession>
          }
        />
        <Route
          path="/gallery"
          element={
            <RequireSession>
              <SurfaceGate path="/gallery">
                <GalleryPage />
              </SurfaceGate>
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
          path="/design/projects/:projectId"
          element={
            <RequireSession>
              <SurfaceGate path="/design">
                <DesignDashboardPage />
              </SurfaceGate>
            </RequireSession>
          }
        />
        <Route
          path="/design/projects"
          element={
            <RequireSession>
              <SurfaceGate path="/design">
                <DesignDashboardPage />
              </SurfaceGate>
            </RequireSession>
          }
        />
        <Route
          path="/design"
          element={
            <RequireSession>
              <SurfaceGate path="/design">
                <DesignDashboardPage />
              </SurfaceGate>
            </RequireSession>
          }
        />
        <Route
          path="/design/:section"
          element={
            <RequireSession>
              <SurfaceGate path="/design">
                <DesignDashboardPage />
              </SurfaceGate>
            </RequireSession>
          }
        />
        <Route
          path="/coding"
          element={
            <RequireSession>
              <SurfaceGate path="/coding">
                <SolanaWalletProvider>
                  <CodingDashboardPage />
                </SolanaWalletProvider>
              </SurfaceGate>
            </RequireSession>
          }
        />
        <Route
          path="/coding/:section"
          element={
            <RequireSession>
              <SurfaceGate path="/coding">
                <SolanaWalletProvider>
                  <CodingDashboardPage />
                </SolanaWalletProvider>
              </SurfaceGate>
            </RequireSession>
          }
        />
      </Routes>
    </Suspense>
  );
}
