import { useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { Link, useParams } from "react-router-dom";
import { AppShell } from "@/dashboard/AppShell";
import { withDashboardPreviewPolicy, type CustomDashboardData } from "@/dashboard/custom/dashboardPreview";
import { getDtourSessionToken } from "@/lib/session";
import { buttonClasses, Icon } from "@/ui";

export default function CustomDashboardPage() {
  const { dashboardId } = useParams();
  const token = getDtourSessionToken();
  const name = dashboardId ? decodeURIComponent(dashboardId) : "";
  const dashboard = useQuery(
    anyApi.design.getDashboard,
    token && name ? { token, name } : "skip",
  ) as CustomDashboardData | null | undefined;

  return (
    <AppShell title={name || "Custom dashboard"} context="custom" bare>
      {dashboard === undefined ? (
        <div className="flex h-full items-center justify-center text-sm text-white/45">
          Loading dashboard...
        </div>
      ) : dashboard === null ? (
        <div className="flex h-full items-center justify-center bg-[#0a0a0a] p-6">
          <div className="max-w-md text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/60">
              <Icon.LayoutGrid size={18} />
            </div>
            <h1 className="mt-4 text-xl font-semibold tracking-tight text-white">Dashboard not found</h1>
            <p className="mt-2 text-sm leading-relaxed text-white/50">
              Generate and save a custom dashboard from Design Studio, then it will appear in the dashboard switcher.
            </p>
            <Link to="/design/generate" className={buttonClasses("primary", "sm", "mt-5")}>
              <Icon.Wand size={14} /> Generate dashboard
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col bg-black">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 bg-[#0d0d0d]/95 px-4">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white">{dashboard.title}</div>
              <div className="text-[11px] text-white/35">Custom Detour dashboard</div>
            </div>
            <Link to="/design/generate" className={buttonClasses("secondary", "sm")}>
              <Icon.Wand size={14} /> Generate another
            </Link>
          </div>
          <div className="min-h-0 flex-1 p-3">
            <iframe
              title={dashboard.title}
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
              srcDoc={withDashboardPreviewPolicy(dashboard.html)}
              className="h-full w-full rounded-2xl border border-white/12 bg-white"
            />
          </div>
        </div>
      )}
    </AppShell>
  );
}
