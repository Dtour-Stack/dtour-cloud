import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { spawnAmbientParticles } from "@/lib/ambient-particles";
import { useCountUp } from "@/lib/useCountUp";
import { setPageMeta } from "@/lib/pageMeta";

const DTOUR_MINT = "DijmsEDeTXsWCkCLkhYJNTutKaHf541xZshVrCUbcozy";

export default function DtourTokenPage() {
  const font = "'Inter', system-ui, sans-serif";
  const shadow = "0 2px 16px rgba(0,0,0,0.6)";
  const supplyCount = useCountUp(1_000_000_000, 1500);
  const bgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPageMeta({
      title: "$DTOUR Token — Detour Cloud Holder Token on Solana",
      description: "$DTOUR (DijmsEDeTXsWCkCLkhYJNTutKaHf541xZshVrCUbcozy) is the Detour Cloud Solana SPL holder token. 1B supply, Pump.fun launch. Hold 1M+ for Scout tier perks and discounted coding sandbox rates.",
      ogTitle: "$DTOUR — Solana SPL Holder Token for Detour Cloud",
      ogDescription: "The $DTOUR token unlocks holder tier perks on Detour Cloud. Solana SPL, 1B supply, Scout at 1M, Operator at 5M.",
    });
  }, []);

  useEffect(() => {
    const el = bgRef.current;
    if (!el) return;
    const cleanup = spawnAmbientParticles(el, 20);
    return cleanup;
  }, []);

  return (
    <div className="public-page min-h-screen text-[var(--text)]" style={{ fontFamily: font }}>
      {/* Video bg */}
      <div ref={bgRef} className="fixed inset-0 -z-10 overflow-hidden">
        <video autoPlay loop muted playsInline className="h-full w-full object-cover">
          <source src="/brand/dtour/background.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-[var(--bg-overlay)]" />
      </div>

      {/* ─── Nav ─── */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 md:px-12">
        <Link to="/" className="flex items-center gap-3">
          <img src="/brand/dtour/logo.svg" alt="Detour Cloud logo" className="logo-cloud h-9 w-9 drop-shadow-lg" />
          <span className="text-base font-semibold tracking-tight drop-shadow-lg">Detour</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link to="/" className="text-sm text-[var(--text-dim)] hover:text-[var(--text)] transition-colors hidden md:block">
            Cloud
          </Link>
          <Link
            to="/login"
            className="rounded-full bg-[var(--btn-glass-bg)] px-5 py-2 text-sm font-medium border border-[var(--border)] backdrop-blur-sm transition-all hover:bg-[var(--btn-glass-bg)]"
          >
            Launch App
          </Link>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section className="relative z-10 flex flex-col items-center px-6 pt-16 text-center md:pt-20">
        <div className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-widest text-purple-300 backdrop-blur-sm">
          Holder token
        </div>
        <h1
          className="mt-6 text-5xl font-bold tracking-[-0.02em] md:text-7xl"
          style={{ textShadow: shadow }}
        >
          <span className="bg-gradient-to-r from-purple-400 via-indigo-400 to-blue-400 bg-clip-text text-transparent count-glow" style={{ filter: "drop-shadow(0 2px 8px rgba(139,92,246,0.35))" }}>
            $DTOUR
          </span>
        </h1>
        <p className="mt-4 max-w-md text-base text-[var(--text-dim)] md:text-lg" style={{ textShadow: "0 1px 8px rgba(0,0,0,0.5)" }}>
          The Detour Cloud perks token. Hold $DTOUR to unlock discounted
          coding sandbox rates and holder-tier benefits across the platform.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a
            href={`https://pump.fun/coin/${DTOUR_MINT}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-[var(--btn-primary-bg)] px-7 py-3 text-sm font-semibold text-[var(--btn-primary-text)] transition hover:shadow-xl hover:shadow-[var(--shadow)] active:scale-[0.97]"
          >
            Buy on Pump.fun
          </a>
          <a
            href={`https://solscan.io/token/${DTOUR_MINT}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-[var(--border-bold)] bg-[var(--btn-glass-bg)] px-7 py-3 text-sm font-semibold backdrop-blur-sm transition hover:bg-[var(--btn-glass-bg)] active:scale-[0.97]"
          >
            View on Solscan
          </a>
        </div>
        <div className="mt-5 rounded-lg bg-[var(--bg-glass)] px-3 py-1.5 backdrop-blur-sm border border-[var(--border)]">
          <span className="text-[11px] text-[var(--text-faint)] font-mono break-all select-all">{DTOUR_MINT}</span>
        </div>
      </section>

      {/* ─── Token Stats ─── */}
      <section className="relative z-10 mx-auto mt-16 max-w-xl px-6">
        <div className="grid grid-cols-4 gap-px overflow-hidden rounded-2xl border border-[var(--border)]">
          {[
            { label: "Chain", value: "Solana" },
            { label: "Supply", value: supplyCount.toLocaleString() },
            { label: "Launch", value: "Pump.fun" },
            { label: "Type", value: "SPL" },
          ].map((s) => (
            <div key={s.label} className="bg-[var(--bg-glass)] p-4 text-center backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-[var(--bg-alt)]">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-faint)]">{s.label}</div>
              <div className="mt-1 text-base font-bold">{s.value}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── What $DTOUR does ─── */}
      <section className="relative z-10 mx-auto mt-20 max-w-3xl px-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl" style={{ textShadow: shadow }}>
            How $DTOUR works
          </h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">Hold $DTOUR, unlock perks. It's that simple.</p>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-[var(--border)] md:grid-cols-2">
          <div className="bg-[var(--bg-glass)] p-6 backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-[var(--bg-alt)]">
            <h3 className="text-sm font-semibold text-[var(--text)]">Free tier — no token needed</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-muted)]">
              Anyone can sign up with a passkey and use the platform. Free tier
              accounts get monthly compute credits for building and testing
              agents. No crypto wallet required.
            </p>
          </div>
          <div className="bg-[var(--bg-glass)] p-6 backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-[var(--bg-alt)]">
            <h3 className="text-sm font-semibold text-[var(--text)]">Holder perks — token optional</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-muted)]">
              1M+ $DTOUR unlocks Scout tier with discounted coding sandbox
              rates. 5M+ unlocks Operator tier with deeper discounts on coding
              and inference. Connect your wallet, verify your balance, done.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Tier Comparison ─── */}
      <section className="relative z-10 mx-auto mt-20 max-w-2xl px-6">
        <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
          <div className="grid grid-cols-3 gap-px bg-[var(--btn-glass-bg)]">
            <div className="bg-[var(--bg-overlay)] p-4 text-center">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-faint)]">Free</div>
              <div className="mt-1 text-sm font-bold text-[var(--text-dim)]">$0</div>
            </div>
            <div className="bg-[var(--bg-overlay)] p-4 text-center">
              <div className="text-[10px] uppercase tracking-wider text-purple-300">Scout</div>
              <div className="mt-1 text-sm font-bold text-[var(--text)]">1M $DTOUR</div>
            </div>
            <div className="bg-[var(--bg-overlay)] p-4 text-center">
              <div className="text-[10px] uppercase tracking-wider text-blue-300">Operator</div>
              <div className="mt-1 text-sm font-bold text-[var(--text)]">5M $DTOUR</div>
            </div>
          </div>
          <div className="divide-y divide-white/[0.06]">
            {[
              { label: "Passkey login", values: ["✓", "✓", "✓"] },
              { label: "Monthly free credits", values: ["✓ capped", "✓ capped", "✓ capped"] },
              { label: "Web dashboard", values: ["✓", "✓", "✓"] },
              { label: "Swoosh (Mac + iPhone)", values: ["✓", "✓", "✓"] },
              { label: "Coding sandbox discount", values: ["—", "Holder rate", "Best rate"] },
              { label: "Inference discount", values: ["—", "—", "Best rate"] },
            ].map((row) => (
              <div key={row.label} className="grid grid-cols-3 gap-px">
                <div className="bg-[var(--bg-glass)] p-3.5 text-[12px] text-[var(--text-dim)]">{row.label}</div>
                {row.values.map((v, i) => (
                  <div key={i} className={`bg-[var(--bg-glass)] p-3.5 text-center text-[12px] ${
                    v === "—" ? "text-[var(--text-faint)]" :
                    v === "Best rate" ? "font-semibold text-blue-300" :
                    v === "Holder rate" ? "font-semibold text-purple-300" :
                    "text-[var(--text-dim)]"
                  }`}>{v}</div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="relative z-10 mx-auto mt-20 max-w-md px-6 pb-24 text-center">
        <h2 className="text-xl font-bold" style={{ textShadow: shadow }}>Hold $DTOUR?</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">Connect your wallet and your perks activate instantly.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <a
            href={`https://pump.fun/coin/${DTOUR_MINT}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-[var(--btn-primary-bg)] px-7 py-3 text-sm font-semibold text-[var(--btn-primary-text)] transition hover:shadow-xl hover:shadow-[var(--shadow)] active:scale-[0.97]"
          >
            Buy $DTOUR
          </a>
          <Link to="/login" className="rounded-full border border-[var(--border-bold)] bg-[var(--btn-glass-bg)] px-7 py-3 text-sm font-semibold backdrop-blur-sm transition hover:bg-[var(--btn-glass-bg)] active:scale-[0.97]">
            Sign in free
          </Link>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="relative z-10 border-t border-[var(--border)] bg-[var(--bg-alt)] px-6 py-6 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 md:flex-row md:justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/brand/dtour/logo.svg" alt="" className="logo-cloud h-5 w-5 opacity-50" />
            <span className="text-xs text-[var(--text-muted)]">Detour · detour.ninja</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-[10px] uppercase tracking-widest text-[var(--text-faint)]">Powered by</span>
            <img src="/brand/dtour/elizaos-face.png" alt="" className="h-4 w-4 rounded-[3px] opacity-60" />
            <img src="/brand/dtour/elizaos-text.svg" alt="ElizaOS" className="h-3 opacity-50" />
            <span className="text-[var(--text-faint)]">·</span>
            <img src="/brand/dtour/elizacloud-text.svg" alt="ElizaCloud" className="h-3 opacity-50" />
          </div>
          <div className="flex gap-4 text-[11px] text-[var(--text-faint)]">
            <Link to="/" className="hover:text-[var(--text-dim)] transition-colors">Cloud</Link>
            <Link to="/terms-of-service" className="hover:text-[var(--text-dim)] transition-colors">Terms</Link>
            <Link to="/privacy-policy" className="hover:text-[var(--text-dim)] transition-colors">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
