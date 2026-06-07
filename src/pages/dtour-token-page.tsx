/**
 * $DTOUR Token — public-facing token page.
 *
 * Settled utility only: Detour Cloud holder status and supported holder-rate
 * billing paths. No staking/yield/burn/revenue-split promises.
 * Same visual language as the landing page: dark glass, grid panels, Inter.
 */

import { Link } from "react-router-dom";

const DTOUR_MINT = "DijmsEDeTXsWCkCLkhYJNTutKaHf541xZshVrCUbcozy";

export default function DtourTokenPage() {
  const font = "'Inter', system-ui, sans-serif";
  const shadow = "0 2px 16px rgba(0,0,0,0.6)";

  return (
    <div className="min-h-screen text-white" style={{ fontFamily: font }}>
      {/* Video bg */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <video autoPlay loop muted playsInline className="h-full w-full object-cover">
          <source src="/brand/dtour/background.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-black/50" />
      </div>

      {/* ─── Nav ─── */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 md:px-12">
        <Link to="/" className="flex items-center gap-3">
          <img src="/brand/dtour/logo.svg" alt="Detour" className="logo-cloud h-9 w-9 drop-shadow-lg" />
          <span className="text-base font-semibold tracking-tight drop-shadow-lg">Detour</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link to="/" className="text-sm text-white/60 hover:text-white transition-colors hidden md:block">
            Cloud
          </Link>
          <Link
            to="/login"
            className="rounded-full bg-white/10 px-5 py-2 text-sm font-medium border border-white/15 backdrop-blur-sm transition-all hover:bg-white/20"
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
          <span className="bg-gradient-to-r from-purple-400 via-indigo-400 to-blue-400 bg-clip-text text-transparent" style={{ filter: "drop-shadow(0 2px 8px rgba(139,92,246,0.35))" }}>
            $DTOUR
          </span>
        </h1>
        <p className="mt-4 max-w-md text-base text-white/60 md:text-lg" style={{ textShadow: "0 1px 8px rgba(0,0,0,0.5)" }}>
          The Detour Cloud holder token. Public beta is open; large holders get
          the live coding sandbox holder rate where billing supports it.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a
            href={`https://pump.fun/coin/${DTOUR_MINT}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-white px-7 py-3 text-sm font-semibold text-black transition hover:shadow-xl hover:shadow-white/10"
          >
            Buy on Pump.fun
          </a>
          <a
            href={`https://solscan.io/token/${DTOUR_MINT}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-white/25 bg-white/5 px-7 py-3 text-sm font-semibold backdrop-blur-sm transition hover:bg-white/10"
          >
            View on Solscan
          </a>
        </div>
        <div className="mt-5 rounded-lg bg-black/30 px-3 py-1.5 backdrop-blur-sm border border-white/[0.08]">
          <span className="text-[11px] text-white/35 font-mono break-all select-all">{DTOUR_MINT}</span>
        </div>
      </section>

      {/* ─── Token Stats ─── */}
      <section className="relative z-10 mx-auto mt-16 max-w-xl px-6">
        <div className="grid grid-cols-4 gap-px overflow-hidden rounded-2xl border border-white/10">
          {[
            { label: "Chain", value: "Solana" },
            { label: "Supply", value: "1B" },
            { label: "Launch", value: "Pump.fun" },
            { label: "Type", value: "SPL" },
          ].map((s) => (
            <div key={s.label} className="bg-black/30 p-4 text-center backdrop-blur-md">
              <div className="text-[10px] uppercase tracking-wider text-white/35">{s.label}</div>
              <div className="mt-1 text-base font-bold">{s.value}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── What $DTOUR does ─── */}
      <section className="relative z-10 mx-auto mt-20 max-w-3xl px-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl" style={{ textShadow: shadow }}>
            What $DTOUR does
          </h2>
          <p className="mt-2 text-sm text-white/45">Simple utility while the beta rails come online.</p>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-white/10 md:grid-cols-2">
          <div className="bg-black/30 p-6 backdrop-blur-md">
            <h3 className="text-sm font-semibold text-white">Access to the cloud</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-white/45">
              Public beta accounts are open with a Solana wallet signature.
              $DTOUR remains the holder-status token for Detour Cloud.
            </p>
          </div>
          <div className="bg-black/30 p-6 backdrop-blur-md">
            <h3 className="text-sm font-semibold text-white">Holder rate at 0.5%</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-white/45">
              Hold <span className="text-white/70">0.5% of supply (5M $DTOUR)</span> or
              more and get the live holder rate on supported billing paths, starting with
              coding sandboxes.
            </p>
          </div>
        </div>
        <p className="mt-6 text-center text-[12px] leading-relaxed text-white/35">
          That's it for now — no promised yields, no emissions, nothing we can't
          back. $DTOUR's utility stays deliberately simple while we build, and
          grows only as we can stand behind it.
        </p>
      </section>

      {/* ─── CTA ─── */}
      <section className="relative z-10 mx-auto mt-20 max-w-md px-6 pb-24 text-center">
        <h2 className="text-xl font-bold" style={{ textShadow: shadow }}>Get in</h2>
        <p className="mt-2 text-sm text-white/45">Join the beta. Track your holder status.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <a
            href={`https://pump.fun/coin/${DTOUR_MINT}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-white px-7 py-3 text-sm font-semibold text-black transition hover:shadow-xl hover:shadow-white/10"
          >
            Buy $DTOUR
          </a>
          <Link to="/login" className="rounded-full border border-white/25 bg-white/5 px-7 py-3 text-sm font-semibold backdrop-blur-sm transition hover:bg-white/10">
            Open Detour Cloud
          </Link>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="relative z-10 border-t border-white/[0.08] bg-black/40 px-6 py-6 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 md:flex-row md:justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/brand/dtour/logo.svg" alt="" className="h-5 w-5 opacity-50" />
            <span className="text-xs text-white/40">Detour · detour.ninja</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-[10px] uppercase tracking-widest text-white/30">Powered by</span>
            <img src="/brand/dtour/elizaos-face.png" alt="" className="h-4 w-4 rounded-[3px] opacity-60" />
            <img src="/brand/dtour/elizaos-text.svg" alt="ElizaOS" className="h-3 opacity-50" />
            <span className="text-white/20">·</span>
            <img src="/brand/dtour/elizacloud-text.svg" alt="ElizaCloud" className="h-3 opacity-50" />
          </div>
          <div className="flex gap-4 text-[11px] text-white/35">
            <Link to="/" className="hover:text-white/60 transition-colors">Cloud</Link>
            <Link to="/terms-of-service" className="hover:text-white/60 transition-colors">Terms</Link>
            <Link to="/privacy-policy" className="hover:text-white/60 transition-colors">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
