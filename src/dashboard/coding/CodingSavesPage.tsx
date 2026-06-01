import { getDtourSessionToken } from "@/lib/session";
import { useCodingSession } from "./CodingSessionContext";
import { WorkspaceSavesSection } from "./WorkspaceSavesSection";

export function CodingSavesPage() {
  const token = getDtourSessionToken();
  const { backend, runnerConnected, onSaveWorkspace } = useCodingSession();

  return (
    <div className="mx-auto max-w-lg px-6 py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Saved work</h1>
        <p className="mt-1 text-[13px] text-white/45">
          Persist your sandbox workspace while a Detour Cloud session is connected.
        </p>
      </header>
      <WorkspaceSavesSection
        token={token}
        onSaveInTerminal={onSaveWorkspace}
        runnerActive={backend === "runner" && runnerConnected}
        showHeading={false}
      />
    </div>
  );
}
