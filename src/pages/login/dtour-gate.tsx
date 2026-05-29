import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import bs58 from "bs58";
import { useAction, useMutation } from "convex/react";
import { anyApi } from "convex/server";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DTOUR_MINT } from "@/lib/dtour-token";
import { DTOUR_SESSION_KEY } from "@/lib/session";

type GateStatus = "idle" | "checking" | "no-tokens" | "holder" | "unknown";

function buildSiwsMessage(pubkey: string, nonce: string): string {
  const issuedAt = new Date().toISOString();
  return [
    `${window.location.host} wants you to sign in with your Solana account:`,
    pubkey,
    "",
    "Access Dtour Cloud — proves you hold $DTOUR.",
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
  const balanceOf = useAction(anyApi.tokens.balanceOf);
  const joinWaitlist = useMutation(anyApi.waitlist.join);
  const [status, setStatus] = useState<GateStatus>("idle");
  const [balance, setBalance] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    if (!publicKey) {
      setStatus("idle");
      setBalance(null);
      return;
    }
    let cancelled = false;
    setStatus("checking");
    setError(null);
    balanceOf({ pubkey: publicKey.toBase58() })
      .then((amount: number) => {
        if (cancelled) return;
        setBalance(amount);
        setStatus(amount > 0 ? "holder" : "no-tokens");
      })
      .catch(() => {
        if (cancelled) return;
        // RPC unreachable (e.g. public endpoint rate-limit / browser 403).
        // Don't dead-end: let the server decide (whitelist + authoritative read).
        setStatus("unknown");
      });
    return () => {
      cancelled = true;
    };
  }, [publicKey, balanceOf]);

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
      })) as { token: string; balance: number; hasProfile: boolean };
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
      await joinWaitlist({ email, pubkey: publicKey?.toBase58() });
      setJoined(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't join the waitlist");
    } finally {
      setJoining(false);
    }
  }, [email, publicKey, joinWaitlist]);

  // Waitlist sign-up — shown to wallets that don't hold $DTOUR (whitelisted
  // wallets just use "Sign in anyway"; the server lets them through).
  const waitlistBlock = joined ? (
    <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4 text-center">
      <p className="text-sm text-emerald-200/90">
        ✓ You're on the waitlist — we'll be in touch.
      </p>
    </div>
  ) : (
    <div className="space-y-2">
      <p className="text-center text-xs text-white/50">
        Want to try the cloud? Join the waitlist.
      </p>
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
          className="shrink-0 rounded-full bg-white/10 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/15 disabled:opacity-50"
        >
          {joining ? "…" : "Join"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-center [&_.wallet-adapter-button]:!rounded-full [&_.wallet-adapter-button]:!bg-white/10">
        <WalletMultiButton />
      </div>

      {status === "checking" && (
        <p className="text-center text-sm text-white/50">
          Checking $DTOUR balance…
        </p>
      )}

      {status === "holder" && (
        <div className="space-y-3">
          <p className="text-center text-sm text-emerald-300/90">
            ✓ Holding {balance?.toLocaleString()} $DTOUR
          </p>
          <button
            type="button"
            onClick={handleEnter}
            disabled={submitting}
            className="w-full rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:shadow-xl hover:shadow-white/10 disabled:opacity-50"
          >
            {submitting ? "Verifying…" : "Sign in & Enter"}
          </button>
        </div>
      )}

      {status === "no-tokens" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-center">
            <p className="text-sm text-amber-200/90">
              This wallet holds no $DTOUR. Access requires holding the token.
            </p>
            <a
              href={`https://jup.ag/swap/SOL-${DTOUR_MINT}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-xs text-white/60 underline hover:text-white"
            >
              Get $DTOUR →
            </a>
          </div>
          {/* Allowlisted wallets pass without holding — the server decides. */}
          <button
            type="button"
            onClick={handleEnter}
            disabled={submitting}
            className="w-full rounded-full border border-white/20 bg-white/5 px-6 py-3 text-sm font-medium text-white/80 backdrop-blur-sm transition hover:bg-white/10 disabled:opacity-50"
          >
            {submitting ? "Verifying…" : "Sign in anyway"}
          </button>
          <div className="border-t border-white/10 pt-3">{waitlistBlock}</div>
        </div>
      )}

      {status === "unknown" && (
        <div className="space-y-3">
          <p className="text-center text-sm text-white/60">
            Couldn't check your $DTOUR balance right now. If you hold $DTOUR or
            are whitelisted, sign in to continue.
          </p>
          <button
            type="button"
            onClick={handleEnter}
            disabled={submitting}
            className="w-full rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:shadow-xl hover:shadow-white/10 disabled:opacity-50"
          >
            {submitting ? "Verifying…" : "Sign in"}
          </button>
          <div className="border-t border-white/10 pt-3">{waitlistBlock}</div>
        </div>
      )}

      {!connected && (
        <p className="text-center text-xs text-white/40">
          Connect a Solana wallet holding $DTOUR to access the cloud.
        </p>
      )}

      {error && <p className="text-center text-xs text-red-400/90">{error}</p>}
    </div>
  );
}
