import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { spawnAmbientParticles } from "@/lib/ambient-particles";
import { trackKonamiCode, trackSquirrelClick } from "@/lib/easter-eggs";
import { setPageMeta } from "@/lib/pageMeta";
import { SolanaWalletProvider } from "@/providers/SolanaWalletProvider";
import { DtourGate } from "./dtour-gate";
import { PasskeySection } from "./PasskeySection";

export default function DtourLoginPage() {
  const [method, setMethod] = useState<"pick" | "passkey" | "wallet">("pick");
  const bgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPageMeta({
      title: "Sign In — Detour Cloud",
      description: "Sign in to Detour Cloud with your passkey (Face ID, Touch ID) or connect your Solana wallet. Free tier available — no cryptocurrency required.",
    });
  }, []);

  useEffect(() => {
    const el = bgRef.current;
    if (!el) return;
    const cleanup = spawnAmbientParticles(el, 25);
    return cleanup;
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      trackKonamiCode(e.key);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <SolanaWalletProvider>
    <div className="public-page theme-cloud min-h-screen bg-black text-[var(--text)]">
      {/* Mesh gradient background */}
      <div
        ref={bgRef}
        className="fixed inset-0 -z-10"
        style={{
          background: `
            radial-gradient(ellipse 80% 60% at 20% 30%, rgba(168,85,247,0.15) 0%, transparent 50%),
            radial-gradient(ellipse 60% 80% at 80% 70%, rgba(59,130,246,0.12) 0%, transparent 50%),
            radial-gradient(ellipse 50% 50% at 50% 50%, rgba(236,72,153,0.08) 0%, transparent 50%),
            linear-gradient(180deg, #0a0a0a 0%, #111111 100%)
          `,
        }}
      />

      <div className="flex min-h-screen w-full flex-col">
        <div className="relative z-10 flex flex-1 items-center justify-center p-4">
          <div className="w-full max-w-md border border-[var(--border)] bg-[var(--bg-overlay)] p-6 backdrop-blur-xl md:p-8">
            <div className="space-y-6">
              {/* Logo + Title */}
              <div className="space-y-3 text-center">
                <img
                  src="/brand/dtour/logo.svg"
                  alt="Detour Cloud logo"
                  className="logo-cloud mx-auto h-16 w-16"
                />
                <h1 className="font-poppins text-2xl font-semibold text-[var(--text)]">
                  Detour Cloud
                </h1>
                <p className="text-sm text-[var(--text-dim)]">
                  Build autonomous agents on the open elizaOS framework. No infrastructure to manage.
                </p>
              </div>

              {method === "pick" && (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setMethod("passkey")}
                    className="w-full rounded-full bg-[var(--btn-primary-bg)] px-6 py-3 text-sm font-semibold text-[var(--btn-primary-text)] transition hover:shadow-xl hover:shadow-[var(--shadow)]"
                  >
                    Sign in with passkey
                  </button>
                  <button
                    type="button"
                    onClick={() => setMethod("wallet")}
                    className="w-full rounded-full border border-[var(--border-bold)] bg-[var(--btn-glass-bg)] px-6 py-3 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--btn-glass-bg)]"
                  >
                    Connect wallet
                  </button>
                </div>
              )}

              {method === "passkey" && (
                <div>
                  <PasskeySection />
                  <button
                    type="button"
                    onClick={() => setMethod("pick")}
                    className="mt-3 w-full text-center text-xs text-[var(--text-muted)] transition hover:text-[var(--text-dim)]"
                  >
                    Other sign-in options
                  </button>
                </div>
              )}

              {method === "wallet" && (
                <div>
                  <DtourGate />
                  <button
                    type="button"
                    onClick={() => setMethod("pick")}
                    className="mt-3 w-full text-center text-xs text-[var(--text-muted)] transition hover:text-[var(--text-dim)]"
                  >
                    Other sign-in options
                  </button>
                </div>
              )}

              {/* Mascot */}
              <div className="flex justify-center">
                <img
                  src="/brand/dtour/ninja-squirrel.png"
                  alt="Detour Ninja"
                  onClick={trackSquirrelClick}
                  className="h-28 w-28 cursor-pointer object-contain drop-shadow-[0_0_15px_rgba(168,85,247,0.3)] transition-transform hover:scale-105 hover:drop-shadow-[0_0_25px_rgba(168,85,247,0.5)] active:scale-95"
                />
              </div>

              {/* Holder callout */}
              <div className="border-t border-[var(--border)] pt-4 text-center">
                <p className="text-xs text-[var(--text-muted)]">
                  Free tier available. $DTOUR holders unlock tier perks.
                </p>
                <p className="mt-1 text-[10px] text-[var(--text-faint)]">
                  Scout at 1M · Operator at 5M · discounted coding & inference
                </p>
              </div>

              {/* Legal */}
              <p className="border-t border-[var(--border)] pt-4 text-center text-xs text-[var(--text-muted)]">
                By signing in, you agree to the{" "}
                <Link
                  to="/terms-of-service"
                  className="text-[var(--text-dim)] transition-colors hover:text-[var(--text)]"
                >
                  Terms
                </Link>{" "}
                and{" "}
                <Link
                  to="/privacy-policy"
                  className="text-[var(--text-dim)] transition-colors hover:text-[var(--text)]"
                >
                  Privacy Policy
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
    </SolanaWalletProvider>
  );
}
