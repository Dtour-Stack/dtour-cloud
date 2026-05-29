import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import bs58 from "bs58";
import { useAction, useMutation, useQuery } from "convex/react";
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
    "Sign in to Dtour Cloud (early access).",
    "",
    `URI: ${window.location.origin}`,
    "Version: 1",
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

/**
 * Early-access gate. Connect a wallet → if it's allowlisted, sign in (SIWS).
 * Every other wallet is asked for an email and added to the waitlist.
 */
export function DtourGate() {
  const { publicKey, signMessage, connected } = useWallet();
  const navigate = useNavigate();
  const getNonce = useMutation(anyApi.auth.getNonce);
  const verifyGate = useAction(anyApi.gate.verify);
  const joinWaitlist = useMutation(anyApi.waitlist.join);

  const pubkey = publicKey?.toBase58();
  // undefined = loading, false = not allowlisted, true = allowlisted.
  const allowed = useQuery(
    anyApi.whitelist.check,
    pubkey ? { pubkey } : "skip",
  ) as boolean | undefined;

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);

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

  const handleJoinWaitlist = useCallback(async () => {
    setJoining(true);
    setError(null);
    try {
      await joinWaitlist({ email, pubkey });
      setJoined(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't join the waitlist");
    } finally {
      setJoining(false);
    }
  }, [email, pubkey, joinWaitlist]);

  return (
    <div className="space-y-4">
      <div className="flex justify-center [&_.wallet-adapter-button]:!rounded-full [&_.wallet-adapter-button]:!bg-white/10">
        <WalletMultiButton />
      </div>

      {connected && allowed === undefined && (
        <p className="text-center text-sm text-white/50">Checking access…</p>
      )}

      {/* Allowlisted → sign in. */}
      {connected && allowed === true && (
        <button
          type="button"
          onClick={handleEnter}
          disabled={submitting}
          className="w-full rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:shadow-xl hover:shadow-white/10 disabled:opacity-50"
        >
          {submitting ? "Verifying…" : "Sign in & Enter"}
        </button>
      )}

      {/* Not allowlisted → mandatory email → waitlist. */}
      {connected &&
        allowed === false &&
        (joined ? (
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4 text-center">
            <p className="text-sm text-emerald-200/90">
              ✓ You're on the early-access list — we'll email you when your spot
              opens.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center">
              <p className="text-sm text-white/70">
                Dtour Cloud is in early access. Drop your email to join the
                waitlist.
              </p>
            </div>
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                autoComplete="email"
                className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleJoinWaitlist}
                disabled={joining || !email.trim()}
                className="shrink-0 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:shadow-lg disabled:opacity-50"
              >
                {joining ? "…" : "Join"}
              </button>
            </div>
          </div>
        ))}

      {!connected && (
        <p className="text-center text-xs text-white/40">
          Early access — connect your wallet. Approved wallets sign in; everyone
          else joins the waitlist.
        </p>
      )}

      {error && <p className="text-center text-xs text-red-400/90">{error}</p>}
    </div>
  );
}
