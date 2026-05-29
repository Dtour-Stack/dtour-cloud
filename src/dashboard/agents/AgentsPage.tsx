import { useParams } from "react-router-dom";
import { AppShell } from "../AppShell";
import { AgentChat } from "./AgentChat";
import { AgentsHome } from "./AgentsHome";
import { ChatSidebar } from "./ChatSidebar";

export default function AgentsPage() {
  const { agentId } = useParams();
  const sidebar = (o: { collapsed: boolean; closeMobile: () => void }) => (
    <ChatSidebar {...o} />
  );

  if (agentId) {
    return (
      <AppShell title="Agents" bare sidebar={sidebar}>
        <AgentChat agentId={agentId} />
      </AppShell>
    );
  }

  return (
    <AppShell title="Agents" sidebar={sidebar}>
      <AgentsHome />
    </AppShell>
  );
}
