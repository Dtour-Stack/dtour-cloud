import { AppShell } from "./AppShell";
import { DashboardHome } from "./home/DashboardHome";

export default function DtourDashboardPage() {
  return (
    <AppShell title="Dashboard">
      <DashboardHome />
    </AppShell>
  );
}
