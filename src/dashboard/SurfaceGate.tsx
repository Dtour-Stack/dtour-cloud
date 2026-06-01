import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  isRouteEnabled,
  surfaceMetaForRoute,
} from "@/lib/surfaceFlags";
import { useFlags } from "@/lib/useFlags";
import { Badge, buttonClasses, EmptyState, Icon, Panel } from "@/ui";
import { AppShell } from "./AppShell";

export function SurfaceGate({
  path,
  children,
}: {
  path: string;
  children: ReactNode;
}) {
  const flags = useFlags();
  if (isRouteEnabled(path, flags)) return <>{children}</>;
  const meta = surfaceMetaForRoute(path);

  return (
    <AppShell title={meta?.title ?? "Coming soon"}>
      <SurfaceUnavailable path={path} />
    </AppShell>
  );
}

export function SurfaceUnavailable({
  path,
  embedded = false,
}: {
  path: string;
  embedded?: boolean;
}) {
  const meta = surfaceMetaForRoute(path);
  const body = (
    <Panel className="mx-auto max-w-xl p-8">
      <div className="mb-5 flex justify-center">
        <Badge tone="warning">Coming soon</Badge>
      </div>
      <EmptyState
        icon={<Icon.Zap size={20} />}
        title={meta?.title ?? "Coming soon"}
        description={
          meta?.description ??
          "This area is not open yet. It will stay behind a launch gate until the integration is complete."
        }
        action={
          embedded ? null : (
            <Link to="/dashboard" className={buttonClasses("secondary", "sm")}>
              Back to dashboard
            </Link>
          )
        }
      />
    </Panel>
  );

  return embedded ? body : <div className="px-6 py-12">{body}</div>;
}
