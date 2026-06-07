import { useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { spawnAmbientParticles } from "@/lib/ambient-particles";
import { useSessionAuth } from "@/lib/hooks/use-session-auth";
import { useScrollReveal } from "@/lib/useScrollReveal";
import { setPageMeta } from "@/lib/pageMeta";

function ScrollSection({
  delay,
  className,
  children,
}: {
  delay: number;
  className?: string;
  children: React.ReactNode;
}) {
  const [ref, visible] = useScrollReveal<HTMLDivElement>(delay);
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        transition: `opacity 0.6s cubic-bezier(0.4,0,0.2,1), transform 0.6s cubic-bezier(0.4,0,0.2,1)`,
      }}
    >
      {children}
    </div>
  );
}

const FAQ_DATA = [
  { q: "What is Detour Cloud?", a: "A white-label cloud platform for building, deploying, and running autonomous AI agents powered by elizaOS. Custom dashboard with passkey login (Face ID, Touch ID) and optional Solana wallet for $DTOUR holder perks." },
  { q: "Do I need $DTOUR to use it?", a: "No. A free tier with capped monthly compute credits is available. $DTOUR is optional — holding 1M+ unlocks Scout tier perks like discounted coding sandboxes." },
  { q: "How does auth work?", a: "Primary: WebAuthn passkeys (Face ID, Touch ID, device PIN). Secondary: Solana wallet SIWS for $DTOUR holders. No crypto wallet needed for the free tier." },
  { q: "What can I build?", a: "Autonomous AI agents for chat, design, and coding workflows — with the full elizaOS ecosystem: plugins, MCP tools, skills, and containerized deployments." },
  { q: "Where is my data stored?", a: "Self-hosted Convex (PostgreSQL) on DigitalOcean in Ashburn, Virginia, USA. Encrypted in transit and at rest." },
  { q: "Is there a desktop app?", a: "Yes — Swoosh, the native macOS runtime with a menu bar agent, iPhone companion, and local MLX inference on Apple Silicon." },
];

export default function DtourLandingPage() {
  const { authenticated } = useSessionAuth();
  const navigate = useNavigate();
  const bgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPageMeta({
      title: "Detour Cloud — Your AI Agents. Everywhere.",
      description: "Build, deploy, and run autonomous AI agents powered by elizaOS. Passkey login (Face ID, Touch ID), free tier, and $DTOUR holder perks. Zero infrastructure management.",
      ogTitle: "Detour Cloud — AI Agent Platform with Passkey Login",
      ogDescription: "Build and deploy autonomous AI agents from your browser, Mac, or iPhone. Passkey auth, free tier, $DTOUR holder discounts.",
    });
  }, []);

  useEffect(() => {
    if (authenticated) navigate("/dashboard", { replace: true });
  }, [authenticated, navigate]);

  useEffect(() => {
    const el = bgRef.current;
    if (!el) return;
    const cleanup = spawnAmbientParticles(el, 30);
    return cleanup;
  }, []);

  const font = "'Inter', system-ui, sans-serif";
  const shadow = "0 2px 16px rgba(0,0,0,0.6)";

  return (
    <div className="min-h-screen text-white" style={{ fontFamily: font }}>
      {/* Video bg */}
      <div ref={bgRef} className="fixed inset-0 -z-10 overflow-hidden">
        <video autoPlay loop muted playsInline className="h-full w-full object-cover">
          <source src="/brand/dtour/background.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-black/35" />
      </div>

      {/* ─── Nav ─── */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 md:px-12">
        <div className="flex items-center gap-3">
          <img src="/brand/dtour/logo.svg" alt="Detour Cloud logo" className="logo-cloud h-9 w-9 drop-shadow-lg" />
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
        <p className="mt-5 max-w-lg text-base leading-relaxed text-white/70 md:text-lg" style={{ textShadow: "0 1px 8px rgba(0,0,0,0.5)" }}>
          Deploy production AI agents from your browser, Mac, or iPhone. No
          infrastructure to manage. Passkey-secured. Token-gated perks.
        </p>
        <div className="mt-8 flex gap-3">
          <Link to="/login" className="rounded-full bg-white px-7 py-3 text-sm font-semibold text-black transition hover:shadow-xl hover:shadow-white/10 active:scale-[0.97]">
            Get Started
          </Link>
          <Link to="/token" className="rounded-full border border-white/25 bg-white/5 px-7 py-3 text-sm font-semibold backdrop-blur-sm transition hover:bg-white/10 active:scale-[0.97]">
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
      <ScrollSection delay={100}>
      <section className="relative z-10 mx-auto max-w-5xl px-6 py-20">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl" style={{ textShadow: shadow }}>
            What You Can Build
          </h2>
          <p className="mt-2 text-sm text-white/50">Full elizaOS ecosystem. Plugins, MCP, and containerized runtimes.</p>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-white/10 md:grid-cols-3">
          {[
            { title: "Autonomous Agents", desc: "Create and deploy agents for chat, design, and coding workflows. Full elizaOS runtime with memory, plugins, and tool execution." },
            { title: "Plugins & MCP", desc: "Extend agents with 100+ plugins — blockchain, social, media, data. Model Context Protocol support for custom toolchains." },
            { title: "Skills & Workflows", desc: "Build multi-step automations with branching, state, and conditionals. Compose agents into production pipelines." },
            { title: "Multi-Platform", desc: "Web dashboard, macOS menu bar (Swoosh), iPhone companion. Same agent, same memory, everywhere." },
            { title: "API Keys & Webhooks", desc: "Programmatic access to agent runtimes. Webhook triggers, REST endpoints, and event-driven execution flows." },
            { title: "Containerized Deploy", desc: "Package agents as containers with auto-scaling, health checks, and monitoring. Deploy to ElizaCloud infrastructure." },
          ].map((f) => (
            <div key={f.title} className="bg-black/30 p-6 backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-black/40">
              <h3 className="text-sm font-semibold text-white">{f.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-white/45">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
      </ScrollSection>

      {/* ─── Platforms ─── */}
      <ScrollSection delay={200}>
      <section className="relative z-10 mx-auto max-w-4xl px-6 pb-20">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl" style={{ textShadow: shadow }}>
            Everywhere You Need It
          </h2>
          <p className="mt-2 text-sm text-white/50">Web, desktop, mobile, and API — one agent runtime across surfaces.</p>
        </div>
        <div className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 md:grid-cols-4">
          {[
            { label: "Detour Cloud", sub: "Web dashboard" },
            { label: "macOS", sub: "Swoosh native app" },
            { label: "iPhone", sub: "Companion app" },
            { label: "Self-Hosted", sub: "Pairing mode" },
            { label: "Discord", sub: "Bot connector" },
            { label: "Telegram", sub: "Bot connector" },
            { label: "Twitter / X", sub: "Social connector" },
            { label: "REST API", sub: "Programmatic access" },
          ].map((d) => (
            <div key={d.label} className="bg-black/30 p-5 text-center backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-black/40">
              <div className="text-sm font-semibold text-white">{d.label}</div>
              <div className="mt-1 text-[11px] text-white/40">{d.sub}</div>
            </div>
          ))}
        </div>
      </section>
      </ScrollSection>

      {/* ─── Swoosh App ─── */}
      <ScrollSection delay={150}>
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
            <div key={f.title} className="bg-black/30 p-6 backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-black/40">
              <h3 className="text-sm font-semibold text-white">{f.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-white/45">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
      </ScrollSection>

      {/* ─── FAQ ─── */}
      <ScrollSection delay={100}>
      <section className="relative z-10 mx-auto max-w-3xl px-6 pb-20">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl" style={{ textShadow: shadow }}>
            Frequently Asked Questions
          </h2>
          <p className="mt-2 text-sm text-white/50">Everything you need to know about Detour Cloud.</p>
        </div>
        <div className="mt-10 space-y-px overflow-hidden rounded-2xl border border-white/10">
          {FAQ_DATA.map((faq) => (
            <details key={faq.q} className="group bg-black/30 backdrop-blur-md transition-all hover:bg-black/40">
              <summary className="flex cursor-pointer items-center justify-between px-6 py-4 text-sm font-semibold text-white transition-colors hover:text-purple-300 [&::-webkit-details-marker]:hidden">
                {faq.q}
                <svg className="ml-2 h-4 w-4 shrink-0 text-white/40 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="border-t border-white/[0.06] px-6 py-4 text-[13px] leading-relaxed text-white/50">
                {faq.a}
              </div>
            </details>
          ))}
        </div>
      </section>
      </ScrollSection>

      {/* ─── CTA ─── */}
      <ScrollSection delay={100}>
      <section className="relative z-10 mx-auto max-w-md px-6 pb-24 text-center">
        <h2 className="text-xl font-bold" style={{ textShadow: shadow }}>Ready?</h2>
        <p className="mt-2 text-sm text-white/50">Sign up and launch your first agent in minutes.</p>
        <Link to="/login" className="mt-5 inline-block rounded-full bg-white px-8 py-3 text-sm font-semibold text-black transition hover:shadow-xl hover:shadow-white/10 active:scale-[0.97]">
          Launch App →
        </Link>
      </section>
      </ScrollSection>

      {/* ─── Footer ─── */}
      <footer className="relative z-10 border-t border-white/[0.08] bg-black/40 px-6 py-6 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 md:flex-row md:justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/brand/dtour/logo.svg" alt="Detour Cloud" className="logo-cloud h-5 w-5 opacity-50" />
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
