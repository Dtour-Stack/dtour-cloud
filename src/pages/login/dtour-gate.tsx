import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import bs58 from "bs58";
import { useAction, useMutation } from "convex/react";
import { anyApi } from "convex/server";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DTOUR_SESSION_KEY } from "@/lib/session";

function buildSiwsMessage(pubkey: string, nonce: string): string {
  const issuedAt = new Date().toISOString();
  return [
    `${window.location.host} wants you to sign in with your Solana account:`,
    pubkey,
    "",
    "Sign in to Detour Cloud (open beta).",
    "",
    `URI: ${window.location.origin}`,
    "Version: 1",
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

export function DtourGate() {
  const { publicKey, signMessage, connected } = useWallet();
  const navigate = useNavigate();
  const getNonce = useMutation(anyApi.auth.getNonce);
  const verifyGate = useAction(anyApi.gate.verify);
  const applyTester = useMutation(anyApi.waitlist.applyTester);

  const pubkey = publicKey?.toBase58();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testerOpen, setTesterOpen] = useState(false);
  const [testerEmail, setTesterEmail] = useState("");
  const [testerName, setTesterName] = useState("");
  const [testerReason, setTesterReason] = useState("");
  const [testerApplying, setTesterApplying] = useState(false);
  const [testerApplied, setTesterApplied] = useState(false);

  const handleEnter = useCallback(async () => {
    if (!publicKey || !signMessage) return;
    setSubmitting(true);
    setError(null);
    try {
      const nonce = (await getNonce({})) as string;
      const message = buildSiwsMessage(publicKey.toBase58(), nonce);
      const signature = await signMessage(new TextEncoder().encode(message));
      const result = (await verifyGate({
        pubkey: publicKey.toBase58(),
        message,
        signature: bs58.encode(signature),
      })) as { token: string; hasProfile: boolean };
      localStorage.setItem(DTOUR_SESSION_KEY, result.token);
      navigate(result.hasProfile ? "/dashboard" : "/onboarding", {
        replace: true,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setSubmitting(false);
    }
  }, [publicKey, signMessage, navigate, getNonce, verifyGate]);

  const handleApplyTester = useCallback(async () => {
    if (!pubkey) {
      setError("Connect your wallet before applying");
      return;
    }
    setTesterApplying(true);
    setError(null);
    try {
      await applyTester({
        email: testerEmail,
        pubkey,
        name: testerName.trim() || undefined,
        reason: testerReason.trim() || undefined,
      });
      setTesterApplied(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send your application");
    } finally {
      setTesterApplying(false);
    }
  }, [applyTester, pubkey, testerEmail, testerName, testerReason]);

  return (
    <div className="space-y-4">
      <div className="flex justify-center [&_.wallet-adapter-button]:!rounded-full [&_.wallet-adapter-button]:!bg-white/10">
        <WalletMultiButton />
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center">
        <p className="text-sm text-white/80">
          Connect a Solana wallet to verify $DTOUR and unlock holder tier perks.
        </p>
        <p className="mt-1 text-xs text-white/45">
          No $DTOUR? Your account works the same — just without the holder discount.
        </p>
      </div>

      {connected && (
        <button
          type="button"
          onClick={handleEnter}
          disabled={submitting}
          className="w-full rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:shadow-xl hover:shadow-white/10 disabled:opacity-50"
        >
          {submitting ? "Verifying…" : "Sign in with wallet"}
        </button>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        {testerApplied ? (
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3 text-center">
            <p className="text-sm text-emerald-200/90">
              Application sent to the admin panel.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setTesterOpen((v) => !v)}
              className="w-full rounded-full border border-white/25 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Apply to be a tester / early dev
            </button>
            {testerOpen && (
              <div className="space-y-2">
                <input
                  type="email"
                  value={testerEmail}
                  onChange={(e) => setTesterEmail(e.target.value)}
                  placeholder="email"
                  autoComplete="email"
                  className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-purple-400/50 focus:outline-none"
                />
                <input
                  value={testerName}
                  onChange={(e) => setTesterName(e.target.value)}
                  placeholder="name or handle"
                  className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-purple-400/50 focus:outline-none"
                />
                <textarea
                  value={testerReason}
                  onChange={(e) => setTesterReason(e.target.value)}
                  placeholder="what will you test or build?"
                  rows={3}
                  className="w-full resize-none rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-purple-400/50 focus:outline-none"
                />
                {!pubkey && (
                  <p className="text-xs text-amber-200/90">
                    Connect your wallet first so admins can approve the exact address.
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleApplyTester}
                  disabled={testerApplying || !testerEmail.trim() || !pubkey}
                  className="w-full rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:shadow-lg disabled:opacity-50"
                >
                  {testerApplying ? "Sending…" : "Send application"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {!connected && (
        <p className="text-center text-xs text-white/40">
          Wallet is optional — $DTOUR holders get tier perks and discounts.
        </p>
      )}

      {error && <p className="text-center text-xs text-red-400/90">{error}</p>}
    </div>
  );
}
