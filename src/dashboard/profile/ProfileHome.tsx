import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { type FormEvent, useEffect, useState } from "react";
import { getDtourSessionToken } from "@/lib/session";
import { useFlag } from "@/lib/useFlags";
import { Badge, Button, EmptyState, Icon, Panel, SectionHeading } from "@/ui";

type Socials = {
  x?: string;
  discord?: string;
  telegram?: string;
  website?: string;
  github?: string;
};
type Profile =
  | { username: string; avatarUrl: string | null; socials: Socials }
  | null
  | undefined;
type Me =
  | { pubkey: string; username: string | null; swerveTags: string[] }
  | null
  | undefined;

const field =
  "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-purple-400/50 focus:outline-none";

const SOCIAL_FIELDS: { key: keyof Socials; label: string; placeholder: string }[] = [
  { key: "x", label: "X / Twitter", placeholder: "@handle" },
  { key: "github", label: "GitHub", placeholder: "github.com/you" },
  { key: "discord", label: "Discord", placeholder: "you#0001" },
  { key: "telegram", label: "Telegram", placeholder: "@you" },
  { key: "website", label: "Website", placeholder: "https://…" },
];

function truncate(a: string) {
  return a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}

export function ProfileHome() {
  const token = getDtourSessionToken();
  const me = useQuery(anyApi.users.me, token ? { token } : "skip") as Me;
  const profile = useQuery(
    anyApi.profiles.getByToken,
    token ? { token } : "skip",
  ) as Profile;
  const update = useMutation(anyApi.profiles.update);
  const canUpload = useFlag("profile_avatar_upload");
  const agentLinking = useFlag("agent_linking");
  const githubLinking = useFlag("github_linking");
  const socialFields = SOCIAL_FIELDS.filter(
    (f) => f.key !== "github" || githubLinking,
  );

  const [avatarUrl, setAvatarUrl] = useState("");
  const [socials, setSocials] = useState<Socials>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setAvatarUrl(profile.avatarUrl ?? "");
      setSocials(profile.socials ?? {});
    }
  }, [profile]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await update({ token, avatarUrl, socials });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      {/* Identity */}
      <Panel className="fade-up flex items-center gap-4 p-6">
        <Avatar url={avatarUrl} username={me?.username} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">
              {me?.username ? `@${me.username}` : "Your profile"}
            </h1>
            {me?.swerveTags?.map((t) => (
              <Badge key={t} tone="accent">
                {t}
              </Badge>
            ))}
          </div>
          <p className="mt-1 flex items-center gap-1.5 font-mono text-[13px] text-white/45">
            <Icon.Wallet size={13} />
            {me ? truncate(me.pubkey) : ""}
          </p>
        </div>
      </Panel>

      {/* Edit */}
      <Panel className="fade-up p-6" style={{ animationDelay: "60ms" }}>
        <SectionHeading title="Edit profile" description="Avatar and social links." />
        <form onSubmit={save} className="mt-4 space-y-4">
          <div>
            <label htmlFor="avatar" className="mb-1.5 block text-xs uppercase tracking-widest text-white/50">
              Avatar URL
            </label>
            <input
              id="avatar"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://…/image.png"
              className={field}
            />
            {!canUpload && (
              <p className="mt-1 text-[11px] text-white/30">Image upload coming soon — paste a URL for now.</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {socialFields.map((f) => (
              <div key={f.key}>
                <label htmlFor={`s-${f.key}`} className="mb-1.5 block text-xs uppercase tracking-widest text-white/50">
                  {f.label}
                </label>
                <input
                  id={`s-${f.key}`}
                  value={socials[f.key] ?? ""}
                  onChange={(e) => setSocials((s) => ({ ...s, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className={field}
                />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save profile"}
            </Button>
            {saved && <span className="text-xs text-emerald-300/90">Saved ✓</span>}
            {error && <span className="text-xs text-red-400/90">{error}</span>}
          </div>
        </form>
      </Panel>

      {/* Linked agents — builders phase */}
      <Panel className="fade-up p-6" style={{ animationDelay: "120ms" }}>
        <SectionHeading
          title="Linked agents"
          description="Connect agents you already run — wallet and/or x402 endpoint."
        />
        {agentLinking ? (
          <EmptyState icon={<Icon.Bot size={20} />} title="No agents linked" description="Add an agent below." />
        ) : (
          <EmptyState
            icon={<Icon.Plug size={20} />}
            title="Agent linking — coming soon"
            description="Linking agents (wallet / x402) and GitHub arrives with the builders phase."
          />
        )}
      </Panel>
    </div>
  );
}

function Avatar({ url, username }: { url?: string; username?: string | null }) {
  const initial = username?.[0]?.toUpperCase() ?? "";
  return url ? (
    <img
      src={url}
      alt=""
      className="h-16 w-16 shrink-0 rounded-full border border-white/10 object-cover"
    />
  ) : (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-xl font-semibold text-white/40">
      {initial || <Icon.Wallet size={22} />}
    </div>
  );
}
