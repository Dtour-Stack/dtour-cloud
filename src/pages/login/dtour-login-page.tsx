/**
 * Detour Cloud — Login page override.
 *
 * Replaces the Eliza Cloud login page with Detour branding, tier info,
 * and $DTOUR-specific onboarding copy. Same auth flow (SIWS/SIWE via
 * Steward), just different skin.
 *
 * To use: set CLOUD_TENANT=dtour and alias this over the default login page
 * in App.tsx routing, or use the brand context to conditionally render.
 */

import { Link } from "react-router-dom";
import { SolanaWalletProvider } from "@/providers/SolanaWalletProvider";
import { DtourGate } from "./dtour-gate";

/**
 * Detour Cloud login — $DTOUR token gate. Connect a Solana wallet; if it holds
 * $DTOUR, sign in (SIWS) and the server verifies ownership + balance.
 */
export default function DtourLoginPage() {
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
                  className="mx-auto h-16 w-16"
                />
                <h1 className="font-poppins text-2xl font-semibold text-white">
                  Detour Cloud
                </h1>
                <p className="text-sm text-white/60">
                  Deploy agents. Build. Ship.
                </p>
              </div>

              {/* $DTOUR token gate — connect wallet, prove holding, enter */}
              <DtourGate />

              {/* Mascot */}
              <div className="flex justify-center">
                <img
                  src="/brand/dtour/ninja-squirrel.png"
                  alt="Detour Ninja"
                  className="h-28 w-28 object-contain drop-shadow-[0_0_15px_rgba(168,85,247,0.3)]"
                />
              </div>

              {/* Holder callout */}
              <div className="border-t border-white/10 pt-4 text-center">
                <p className="text-xs text-white/50">
                  $DTOUR is your access to the cloud
                </p>
                <p className="mt-1 text-[10px] text-white/30">
                  Hold 0.5% of supply or more for 20% off usage
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
