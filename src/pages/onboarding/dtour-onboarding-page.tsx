import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getDtourSessionToken } from "@/lib/session";

/**
 * Post-login onboarding — runs once after the $DTOUR gate passes. The user
 * picks a username and links an email; both are saved to Convex against the
 * gated wallet's session.
 */
export default function DtourOnboardingPage() {
  const navigate = useNavigate();
  const token = getDtourSessionToken();
  const saveProfile = useMutation(anyApi.profiles.save);
  const me = useQuery(anyApi.users.me, token ? { token } : "skip") as
    | { username: string | null }
    | null
    | undefined;
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || me === null) navigate("/login", { replace: true });
    else if (me?.username) navigate("/dashboard", { replace: true });
  }, [token, me, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const token = getDtourSessionToken();
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveProfile({ token, username, email });
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile");
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div
        className="fixed inset-0 -z-10"
        style={{
          background: `
            radial-gradient(ellipse 80% 60% at 20% 30%, rgba(168,85,247,0.15) 0%, transparent 50%),
            radial-gradient(ellipse 60% 80% at 80% 70%, rgba(59,130,246,0.12) 0%, transparent 50%),
            linear-gradient(180deg, #0a0a0a 0%, #111111 100%)
          `,
        }}
      />
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md border border-white/10 bg-black/80 p-8 backdrop-blur-xl">
          <div className="space-y-2 text-center">
            <img
              src="/brand/dtour/logo.svg"
              alt="Dtour"
              className="mx-auto h-12 w-12"
            />
            <h1 className="text-2xl font-semibold">Set up your profile</h1>
            <p className="text-sm text-white/60">
              Pick a username and link an email to finish.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div>
              <label
                htmlFor="username"
                className="mb-1.5 block text-xs uppercase tracking-widest text-white/50"
              >
                Username
              </label>
              <input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="satoshi"
                autoComplete="username"
                required
                className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-purple-400/50 focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-xs uppercase tracking-widest text-white/50"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
                className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-purple-400/50 focus:outline-none"
              />
            </div>

            {error && <p className="text-center text-xs text-red-400/90">{error}</p>}

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:shadow-xl hover:shadow-white/10 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Continue →"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
