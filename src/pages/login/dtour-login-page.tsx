import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { trackKonamiCode, trackSquirrelClick } from "@/lib/easter-eggs";
import { SolanaWalletProvider } from "@/providers/SolanaWalletProvider";
import { DtourGate } from "./dtour-gate";
import { PasskeySection } from "./PasskeySection";

export default function DtourLoginPage() {
  const [method, setMethod] = useState<"pick" | "passkey" | "wallet">("pick");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      trackKonamiCode(e.key);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <SolanaWalletProvider>
    <div className="theme-cloud min-h-screen bg-black text-white">
      {/* Mesh gradient background */}
      <div
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
          <div className="w-full max-w-md border border-white/10 bg-black/80 p-6 backdrop-blur-xl md:p-8">
            <div className="space-y-6">
              {/* Logo + Title */}
              <div className="space-y-3 text-center">
                <img
                  src="/brand/dtour/logo.svg"
                  alt="Dtour"
                  className="logo-cloud mx-auto h-16 w-16"
                />
                <h1 className="font-poppins text-2xl font-semibold text-white">
                  Detour Cloud
                </h1>
                <p className="text-sm text-white/60">
                  Deploy agents. Build. Ship.
                </p>
              </div>

              {method === "pick" && (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setMethod("passkey")}
                    className="w-full rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:shadow-xl hover:shadow-white/10"
                  >
                    Sign in with passkey
                  </button>
                  <button
                    type="button"
                    onClick={() => setMethod("wallet")}
                    className="w-full rounded-full border border-white/25 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
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
                    className="mt-3 w-full text-center text-xs text-white/40 transition hover:text-white/60"
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
                    className="mt-3 w-full text-center text-xs text-white/40 transition hover:text-white/60"
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
              <div className="border-t border-white/10 pt-4 text-center">
                <p className="text-xs text-white/50">
                  Free tier available. $DTOUR holders unlock tier perks.
                </p>
                <p className="mt-1 text-[10px] text-white/30">
                  Scout at 1M · Operator at 5M · discounted coding & inference
                </p>
              </div>

              {/* Legal */}
              <p className="border-t border-white/10 pt-4 text-center text-xs text-white/40">
                By signing in, you agree to the{" "}
                <Link
                  to="/terms-of-service"
                  className="text-white/60 transition-colors hover:text-white"
                >
                  Terms
                </Link>{" "}
                and{" "}
                <Link
                  to="/privacy-policy"
                  className="text-white/60 transition-colors hover:text-white"
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
