import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { type FormEvent, useEffect, useState } from "react";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import { getDtourSessionToken } from "@/lib/session";
import {
  Badge,
  Button,
  EmptyState,
  Icon,
  IconButton,
  Panel,
  Skeleton,
} from "@/ui";

type User = {
  pubkey: string;
  balance: number;
  lastLoginAt: number | null;
  username: string | null;
  email: string | null;
  avatarUrl: string | null;
  role: Role;
  swerveTags: string[];
  customTags: string[];
};

const field =
  "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-purple-400/50 focus:outline-none";

function truncate(a: string) {
  return a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}

export function AdminUsers() {
  const token = getDtourSessionToken();
  const users = useQuery(
    anyApi.admin.users,
    token ? { token } : "skip",
  ) as User[] | undefined;
  const [selected, setSelected] = useState<User | null>(null);

  return (
    <Panel className="fade-up p-6" style={{ animationDelay: "150ms" }}>
      {users === undefined ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : users.length === 0 ? (
        <EmptyState icon={<Icon.User size={20} />} title="No users yet" />
      ) : (
        <ul className="divide-y divide-white/5">
          {users.map((u) => (
            <li key={u.pubkey} className="flex items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 items-center gap-3">
                {u.avatarUrl ? (
                  <img src={u.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full border border-white/10 object-cover" />
                ) : (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-xs text-white/40">
                    {u.username?.[0]?.toUpperCase() ?? "•"}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-white/90">
                      {u.username ? `@${u.username}` : truncate(u.pubkey)}
                    </span>
                    <Badge tone={u.role === "super_admin" || u.role === "admin" ? "accent" : "neutral"}>
                      {ROLE_LABEL[u.role]}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-white/35">
                    <span className="font-mono">{truncate(u.pubkey)}</span>
                    <span>·</span>
                    <span>{u.balance.toLocaleString()} $DTOUR</span>
                  </div>
                </div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setSelected(u)}>
                Manage
              </Button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <UserModal user={selected} onClose={() => setSelected(null)} />
      )}
    </Panel>
  );
}

function UserModal({ user, onClose }: { user: User; onClose: () => void }) {
  const token = getDtourSessionToken();
  const editProfile = useMutation(anyApi.admin.editProfile);
  const sendMessage = useMutation(anyApi.messages.send);

  const [username, setUsername] = useState(user.username ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? "");
  const [tags, setTags] = useState(user.customTags.join(", "));
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [push, setPush] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setStatus(null);
    try {
      await editProfile({
        token,
        pubkey: user.pubkey,
        username: username.trim() || undefined,
        email: email.trim() || undefined,
        avatarUrl,
        swerveTags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      setStatus("Profile saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!token || !body.trim()) return;
    setError(null);
    setStatus(null);
    try {
      await sendMessage({ token, to: user.pubkey, subject: subject || undefined, body, push });
      setSubject("");
      setBody("");
      setPush(false);
      setStatus(push ? "Message sent + pushed" : "Message sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d0d] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">
              {user.username ? `@${user.username}` : truncate(user.pubkey)}
            </span>
            <Badge tone="accent">{ROLE_LABEL[user.role]}</Badge>
          </div>
          <IconButton label="Close" onClick={onClose}>
            <Icon.X />
          </IconButton>
        </div>

        <div className="max-h-[70vh] space-y-6 overflow-auto p-5">
          <form onSubmit={saveProfile} className="space-y-3">
            <p className="text-xs uppercase tracking-widest text-white/50">Edit profile</p>
            <div className="grid grid-cols-2 gap-3">
              <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" className={field} />
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" className={field} />
            </div>
            <input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="avatar URL" className={field} />
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="swerve tags (comma-separated)" className={field} />
            <Button type="submit" size="sm" variant="secondary">Save profile</Button>
          </form>

          <form onSubmit={send} className="space-y-3 border-t border-white/10 pt-5">
            <p className="text-xs uppercase tracking-widest text-white/50">Send message</p>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="subject (optional)" className={field} />
            <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="message…" rows={3} className={field} required />
            <label className="flex items-center gap-2 text-xs text-white/60">
              <input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} className="accent-purple-500" />
              Send as push notification
            </label>
            <Button type="submit" size="sm">Send</Button>
          </form>

          {status && <p className="text-xs text-emerald-300/90">{status}</p>}
          {error && <p className="text-xs text-red-400/90">{error}</p>}
        </div>
      </div>
    </div>
  );
}
