import { AppShell } from "../AppShell";
import { ProfileHome } from "./ProfileHome";

export default function ProfilePage() {
  return (
    <AppShell title="Profile" context="profile">
      <ProfileHome />
    </AppShell>
  );
}
