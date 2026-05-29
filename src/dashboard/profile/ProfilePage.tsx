import { AppShell } from "../AppShell";
import { ProfileHome } from "./ProfileHome";

export default function ProfilePage() {
  return (
    <AppShell title="Profile">
      <ProfileHome />
    </AppShell>
  );
}
