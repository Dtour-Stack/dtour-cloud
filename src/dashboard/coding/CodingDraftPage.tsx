import { getDtourSessionToken } from "@/lib/session";
import { DraftLabSection } from "./DraftLabSection";

export function CodingDraftPage() {
  const token = getDtourSessionToken();
  return (
    <div className="mx-auto max-w-lg px-6 py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Draft lab</h1>
        <p className="mt-1 text-[13px] text-white/45">
          Smoke-test lightweight agent persona, plugins, and prompts (inference credits).
        </p>
      </header>
      <DraftLabSection token={token} showHeading={false} />
    </div>
  );
}
