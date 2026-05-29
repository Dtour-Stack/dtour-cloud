import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { RequireRole } from "@/dashboard/RequireRole";
import { RequireSession } from "@/dashboard/RequireSession";
import DtourLandingPage from "@/pages/dtour-landing-page";
import DtourTokenPage from "@/pages/dtour-token-page";

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
const ProfilePage = lazy(() => import("@/dashboard/profile/ProfilePage"));
const AgentsPage = lazy(() => import("@/dashboard/agents/AgentsPage"));

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
        <Route
          path="/admin"
          element={
            <RequireRole min="admin">
              <AdminDashboardPage />
            </RequireRole>
          }
        />
        <Route
          path="/admin/:section"
          element={
            <RequireRole min="admin">
              <AdminDashboardPage />
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
      </Routes>
    </Suspense>
  );
}
