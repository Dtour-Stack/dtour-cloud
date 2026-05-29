import { useMutation } from "convex/react";
import { anyApi } from "convex/server";
import { type FormEvent, useState } from "react";
import { getDtourSessionToken } from "@/lib/session";
import { Button, Panel } from "@/ui";

const field =
  "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-purple-400/50 focus:outline-none";

export function AdminBroadcast() {
  const token = getDtourSessionToken();
  const broadcast = useMutation(anyApi.messages.broadcast);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [push, setPush] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!token || !body.trim()) return;
    setBusy(true);
    setStatus(null);
    try {
      const r = (await broadcast({ token, subject: subject || undefined, body, push })) as {
        count: number;
      };
      setStatus(`Sent to ${r.count} user${r.count === 1 ? "" : "s"}`);
      setSubject("");
      setBody("");
      setPush(false);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Broadcast failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="fade-up p-6" style={{ animationDelay: "160ms" }}>
      <form onSubmit={send} className="space-y-3">
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="subject (optional)" className={field} />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="message to all users…" rows={3} className={field} required />
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={busy}>{busy ? "Sending…" : "Broadcast"}</Button>
          <label className="flex items-center gap-2 text-xs text-white/60">
            <input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} className="accent-purple-500" />
            Send as push
          </label>
          {status && <span className="text-xs text-emerald-300/90">{status}</span>}
        </div>
      </form>
    </Panel>
  );
}
