/**
 * Detour Cloud — Landing page.
 *
 * Focused on the product: what you can do, where you deploy,
 * the Swoosh native app, and Powered by ElizaOS attribution.
 * Design: restrained, dark, glass panels, proper typography.
 */

import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSessionAuth } from "@/lib/hooks/use-session-auth";

export default function DtourLandingPage() {
  const { authenticated } = useSessionAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (authenticated) navigate("/dashboard", { replace: true });
  }, [authenticated, navigate]);

  const font = "'Inter', system-ui, sans-serif";
  const shadow = "0 2px 16px rgba(0,0,0,0.6)";

  return (
    <div className="min-h-screen text-white" style={{ fontFamily: font }}>
      {/* Video bg */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <video autoPlay loop muted playsInline className="h-full w-full object-cover">
          <source src="/brand/dtour/background.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-black/35" />
      </div>

      {/* ─── Nav ─── */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 md:px-12">
        <div className="flex items-center gap-3">
          <img src="/brand/dtour/logo.svg" alt="Dtour" className="h-9 w-9 drop-shadow-lg" />
          <span className="text-base font-semibold tracking-tight drop-shadow-lg">
            Detour Cloud
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/token" className="text-sm text-white/60 hover:text-white transition-colors hidden md:block">
            $DTOUR
          </Link>
          <a href="https://docs.detour.ninja" target="_blank" rel="noopener noreferrer" className="text-sm text-white/60 hover:text-white transition-colors hidden md:block">
            Docs
          </a>
          <Link
            to="/login"
            className="rounded-full bg-white/10 px-5 py-2 text-sm font-medium border border-white/15 backdrop-blur-sm transition-all hover:bg-white/20"
          >
            Launch App
          </Link>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section className="relative z-10 flex min-h-[82vh] flex-col items-center justify-center px-6 text-center">
        <h1
          className="text-5xl font-bold leading-[1.08] tracking-[-0.02em] md:text-7xl lg:text-8xl"
          style={{ textShadow: shadow }}
        >
          Your AI Agents.
          <br />
          <span className="bg-gradient-to-r from-purple-400 via-indigo-400 to-blue-400 bg-clip-text text-transparent" style={{ filter: "drop-shadow(0 2px 8px rgba(139,92,246,0.35))" }}>
            Everywhere.
          </span>
        </h1>
        <p className="mt-5 max-w-md text-base leading-relaxed text-white/70 md:text-lg" style={{ textShadow: "0 1px 8px rgba(0,0,0,0.5)" }}>
          Build and deploy autonomous agents from Mac, iPhone, or the cloud.
        </p>
        <div className="mt-8 flex gap-3">
          <Link to="/login" className="rounded-full bg-white px-7 py-3 text-sm font-semibold text-black transition hover:shadow-xl hover:shadow-white/10">
            Get Started
          </Link>
          <Link to="/token" className="rounded-full border border-white/25 bg-white/5 px-7 py-3 text-sm font-semibold backdrop-blur-sm transition hover:bg-white/10">
            $DTOUR Token
          </Link>
        </div>

        {/* Powered by — real SVGs */}
        <div className="mt-10 flex items-center gap-3 opacity-60">
          <span className="text-[11px] uppercase tracking-widest text-white/50">Powered by</span>
          <img src="/brand/dtour/elizaos-face.png" alt="ElizaOS" className="h-5 w-5 rounded-[4px]" />
          <img src="/brand/dtour/elizaos-text.svg" alt="ElizaOS" className="h-3.5" />
          <span className="text-white/30 mx-1">+</span>
          <img src="/brand/dtour/elizacloud-text.svg" alt="ElizaCloud" className="h-3.5" />
        </div>
      </section>

      {/* ─── Capabilities ─── */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 py-20">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl" style={{ textShadow: shadow }}>
            What You Can Build
          </h2>
          <p className="mt-2 text-sm text-white/50">Full ElizaOS ecosystem. Plugins, tools, and workflows.</p>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-white/10 md:grid-cols-3">
          {[
            { title: "Autonomous Agents", desc: "Create agents for chat, design, and coding workflows while runtime deploy surfaces finish hardening." },
            { title: "Plugins & MCP", desc: "Browse the MCP direction now; live tool execution opens after transport, auth, and metering are verified." },
            { title: "Skills & Workflows", desc: "Build and preview workflow-shaped automations before connecting them to paid production rails." },
            { title: "Multi-Platform Chat", desc: "Gateway connectors are on the roadmap; today the beta focuses on web chat, design, and coding surfaces." },
            { title: "API Keys & Webhooks", desc: "Developer docs and route status are open; programmatic keys stay gated until launch hardening is complete." },
            { title: "Containerized Deploy", desc: "App and instance deployment are planned surfaces, pending verified provisioning and spend controls." },
          ].map((f) => (
            <div key={f.title} className="bg-black/30 p-6 backdrop-blur-md transition-colors hover:bg-black/40">
              <h3 className="text-sm font-semibold text-white">{f.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-white/45">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Deploy Targets ─── */}
      <section className="relative z-10 mx-auto max-w-4xl px-6 pb-20">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl" style={{ textShadow: shadow }}>
            Deploy Anywhere
          </h2>
          <p className="mt-2 text-sm text-white/50">One agent. Multiple surfaces.</p>
        </div>
        <div className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 md:grid-cols-4">
          {[
            { label: "Detour Cloud", sub: "Hosted ElizaCloud infra" },
            { label: "macOS", sub: "Swoosh menu-bar app" },
            { label: "iPhone", sub: "Swoosh iOS companion" },
            { label: "Self-Hosted", sub: "Your own VPS / server" },
            { label: "Discord", sub: "Bot in any server" },
            { label: "Telegram", sub: "Bot in any group" },
            { label: "Twitter / X", sub: "Autonomous posting" },
            { label: "REST API", sub: "Embed anywhere" },
          ].map((d) => (
            <div key={d.label} className="bg-black/30 p-5 text-center backdrop-blur-md transition-colors hover:bg-black/40">
              <div className="text-sm font-semibold text-white">{d.label}</div>
              <div className="mt-1 text-[11px] text-white/40">{d.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Swoosh App ─── */}
      <section className="relative z-10 mx-auto max-w-3xl px-6 pb-20">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl" style={{ textShadow: shadow }}>
            Swoosh — The Native Runtime
          </h2>
          <p className="mt-2 text-sm text-white/50">Mac is the hub. iPhone is the remote. One agent, everywhere.</p>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-white/10 md:grid-cols-3">
          {[
            { title: "Menu Bar Agent", desc: "Always-on AI in your Mac menu bar. Chat, query, automate — never leave your workflow." },
            { title: "iPhone Companion", desc: "Same brain, same memory. Thin HTTP client to your Mac. Full chat + settings on the go." },
            { title: "Local MLX Inference", desc: "Run models on Apple Silicon. Private, fast, zero API costs for local inference." },
          ].map((f) => (
            <div key={f.title} className="bg-black/30 p-6 backdrop-blur-md transition-colors hover:bg-black/40">
              <h3 className="text-sm font-semibold text-white">{f.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-white/45">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="relative z-10 mx-auto max-w-md px-6 pb-24 text-center">
        <h2 className="text-xl font-bold" style={{ textShadow: shadow }}>Ready?</h2>
        <p className="mt-2 text-sm text-white/50">Sign up and launch your first agent in minutes.</p>
        <Link to="/login" className="mt-5 inline-block rounded-full bg-white px-8 py-3 text-sm font-semibold text-black transition hover:shadow-xl hover:shadow-white/10">
          Launch App →
        </Link>
      </section>

      {/* ─── Footer ─── */}
      <footer className="relative z-10 border-t border-white/[0.08] bg-black/40 px-6 py-6 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 md:flex-row md:justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/brand/dtour/logo.svg" alt="" className="h-5 w-5 opacity-50" />
            <span className="text-xs text-white/40">detour.ninja</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-[10px] uppercase tracking-widest text-white/30">Powered by</span>
            <img src="/brand/dtour/elizaos-face.png" alt="" className="h-4 w-4 rounded-[3px] opacity-60" />
            <img src="/brand/dtour/elizaos-text.svg" alt="ElizaOS" className="h-3 opacity-50" />
            <span className="text-white/20">·</span>
            <img src="/brand/dtour/elizacloud-text.svg" alt="ElizaCloud" className="h-3 opacity-50" />
          </div>
          <div className="flex gap-4 text-[11px] text-white/35">
            <Link to="/token" className="hover:text-white/60 transition-colors">$DTOUR</Link>
            <Link to="/terms-of-service" className="hover:text-white/60 transition-colors">Terms</Link>
            <Link to="/privacy-policy" className="hover:text-white/60 transition-colors">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
