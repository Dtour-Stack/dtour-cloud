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
  { q: "What is Detour Cloud?", a: "A cross-platform AI agent runtime. Build autonomous agents on the open elizaOS framework, deploy them to web, macOS (Swoosh), and iPhone, and access them from anywhere. No infrastructure to manage." },
  { q: "What kind of agents can I build?", a: "Chat and support agents, coding and dev assistants, design and creative agents, workflow automation pipelines, blockchain and social media bots, and custom toolchains via MCP plugins. Anything you can compose with the elizaOS ecosystem of 100+ plugins." },
  { q: "Do I need $DTOUR to use it?", a: "No. A free tier with monthly compute credits is available — no crypto wallet required. $DTOUR is optional: holding 1M+ unlocks Scout tier perks like discounted coding sandbox rates." },
  { q: "How does authentication work?", a: "Primary: WebAuthn passkeys (Face ID, Touch ID, device PIN). Secondary: Solana wallet SIWS for $DTOUR holders. No passwords to remember, no crypto needed for the free tier." },
  { q: "Where is my data stored?", a: "Self-hosted Convex (PostgreSQL) on DigitalOcean in Ashburn, Virginia, USA. Encrypted in transit (TLS) and at rest. We never train on or share your agent data." },
  { q: "What platforms are supported?", a: "Web dashboard (any browser), macOS native app (Swoosh — menu bar agent + local MLX inference), iPhone companion app, self-hosted pairing mode, and programmatic access via REST API. Discord, Telegram, and Twitter/X connectors." },
  { q: "Is there a desktop app?", a: "Yes — Swoosh, the native macOS runtime. Always-on AI in your menu bar, full agent chat and control, plus local MLX inference on Apple Silicon for private, zero-cost on-device inference." },
  { q: "How does pricing work?", a: "Free tier with monthly capped compute credits — no credit card needed. $DTOUR holders get discounted rates on coding sandboxes and inference. Billing is usage-based via a credit system. No surprise bills." },
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
    <div className="landing-page min-h-screen text-[var(--text)]" style={{ fontFamily: font }}>
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
          <Link to="/token" className="text-sm text-[var(--text-dim)] hover:text-[var(--text)] transition-colors hidden md:block">
            $DTOUR
          </Link>
          <a href="https://docs.detour.ninja" target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--text-dim)] hover:text-[var(--text)] transition-colors hidden md:block">
            Docs
          </a>
          <Link
            to="/login"
            className="rounded-full bg-[var(--btn-glass-bg)] px-5 py-2 text-sm font-medium border border-[var(--border)] backdrop-blur-sm transition-all hover:bg-[var(--btn-glass-bg)]"
          >
            Launch App
          </Link>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section className="relative z-10 flex min-h-[82vh] flex-col items-center justify-center px-6 text-center">
        <div className="rounded-full border-[var(--accent)]/30 bg-[var(--accent-soft)] px-4 py-1 text-[11px] font-medium uppercase tracking-widest text-[var(--accent)] backdrop-blur-sm">
          Agent platform · Powered by elizaOS
        </div>
        <h1
          className="mt-6 text-5xl font-bold leading-[1.08] tracking-[-0.02em] md:text-7xl lg:text-8xl"
          style={{ textShadow: shadow }}
        >
          Your AI Agents.
          <br />
          <span className="bg-gradient-to-r from-purple-400 via-indigo-400 to-blue-400 bg-clip-text text-transparent" style={{ filter: "drop-shadow(0 2px 8px rgba(139,92,246,0.35))" }}>
            Everywhere.
          </span>
        </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-[var(--text)] md:text-lg" style={{ textShadow: "0 1px 8px rgba(0,0,0,0.5)" }}>
          Detour Cloud is the cross-platform agent runtime. Build autonomous AI
          agents on the open elizaOS framework, deploy them to any surface, and
          access them from anywhere — no infrastructure to manage.
        </p>
        <div className="mt-8 flex gap-3">
          <Link to="/login" className="rounded-full bg-[var(--btn-primary-bg)] px-7 py-3 text-sm font-semibold text-[var(--btn-primary-text)] transition hover:shadow-xl hover:shadow-[var(--shadow)] active:scale-[0.97]">
            Get Started
          </Link>
          <Link to="/token" className="rounded-full border-[var(--border-bold)] bg-[var(--btn-glass-bg)] px-7 py-3 text-sm font-semibold backdrop-blur-sm transition hover:bg-[var(--btn-glass-bg)] active:scale-[0.97]">
            $DTOUR Token
          </Link>
        </div>

        {/* Powered by — real SVGs */}
        <div className="mt-10 flex items-center gap-3 opacity-60">
          <span className="text-[11px] uppercase tracking-widest text-[var(--text-muted)]">Powered by</span>
          <img src="/brand/dtour/elizaos-face.png" alt="ElizaOS" className="h-5 w-5 rounded-[4px]" />
          <img src="/brand/dtour/elizaos-text.svg" alt="ElizaOS" className="h-3.5" />
          <span className="text-[var(--text-faint)] mx-1">+</span>
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
          <p className="mt-2 text-sm text-[var(--text-muted)]">Autonomous agents for every workflow — deploy once, run anywhere.</p>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-[var(--border)] md:grid-cols-3">
          {[
            { title: "Chat & Support Agents", desc: "Build conversational AI agents for customer support, community moderation, and personal assistance. Multi-platform, full memory, 100+ plugins." },
            { title: "Coding & Dev Agents", desc: "Deploy agents that write code, review PRs, run tests, debug issues, and automate CI/CD tasks. Integrated with git repos and cloud sandboxes." },
            { title: "Design & Creative Agents", desc: "Generate images, analyze visual content, create design assets, and automate creative pipelines. Agent-powered multimedia workflows." },
            { title: "Cross-Platform Runtime", desc: "The same agent runs on the web dashboard, macOS menu bar (Swoosh), and iPhone companion. Consistent memory, context, and tools across devices." },
            { title: "Workflow Automation", desc: "Compose agents into multi-step pipelines with branching, state management, conditionals, error handling, and human-in-the-loop checks." },
            { title: "Plugins & Custom MCP", desc: "100+ built-in plugins for blockchain, social media, data analysis, media generation, and code execution. Add custom tools via Model Context Protocol." },
          ].map((f) => (
            <div key={f.title} className="bg-[var(--bg-glass)] p-6 backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-[var(--bg-glass)]">
              <h3 className="text-sm font-semibold text-[var(--text)]">{f.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-muted)]">{f.desc}</p>
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
          <p className="mt-2 text-sm text-[var(--text-muted)]">Web, desktop, mobile, and API — one agent runtime across surfaces.</p>
        </div>
        <div className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[var(--border)] md:grid-cols-4">
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
            <div key={d.label} className="bg-[var(--bg-glass)] p-5 text-center backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-[var(--bg-glass)]">
              <div className="text-sm font-semibold text-[var(--text)]">{d.label}</div>
              <div className="mt-1 text-[11px] text-[var(--text-muted)]">{d.sub}</div>
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
          <p className="mt-2 text-sm text-[var(--text-muted)]">Mac is the hub. iPhone is the remote. One agent, everywhere.</p>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-[var(--border)] md:grid-cols-3">
          {[
            { title: "Menu Bar Agent", desc: "Always-on AI in your Mac menu bar. Chat, query, automate — never leave your workflow." },
            { title: "iPhone Companion", desc: "Same brain, same memory. Thin HTTP client to your Mac. Full chat + settings on the go." },
            { title: "Local MLX Inference", desc: "Run models on Apple Silicon. Private, fast, zero API costs for local inference." },
          ].map((f) => (
            <div key={f.title} className="bg-[var(--bg-glass)] p-6 backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-[var(--bg-glass)]">
              <h3 className="text-sm font-semibold text-[var(--text)]">{f.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-muted)]">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
      </ScrollSection>

      {/* ─── Why Detour ─── */}
      <ScrollSection delay={100}>
      <section className="relative z-10 mx-auto max-w-5xl px-6 pb-20">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl" style={{ textShadow: shadow }}>
            Why Detour Cloud
          </h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">Built differently so you can build freely.</p>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-[var(--border)] md:grid-cols-4">
          {[
            { title: "Passkey-First Auth", desc: "Sign in with Face ID, Touch ID, or device PIN. No passwords. No crypto wallet required for the free tier." },
            { title: "Free to Start", desc: "Free tier with monthly compute credits. No credit card. Upgrade when you're ready, or stay free forever." },
            { title: "Open Ecosystem", desc: "Built on elizaOS — the leading open-source agent framework. 100+ plugins. MCP toolchains. No lock-in." },
            { title: "Your Data Stays Yours", desc: "Self-hosted infrastructure on DigitalOcean in Ashburn, VA. Encrypted at rest and in transit. Never trained on." },
          ].map((f) => (
            <div key={f.title} className="bg-[var(--bg-glass)] p-6 backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-[var(--bg-glass)]">
              <h3 className="text-sm font-semibold text-[var(--text)]">{f.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-muted)]">{f.desc}</p>
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
          <p className="mt-2 text-sm text-[var(--text-muted)]">Everything you need to know about Detour Cloud.</p>
        </div>
        <div className="mt-10 space-y-px overflow-hidden rounded-2xl border border-[var(--border)]">
          {FAQ_DATA.map((faq) => (
            <details key={faq.q} className="group bg-[var(--bg-glass)] backdrop-blur-md transition-all hover:bg-[var(--bg-glass)]">
              <summary className="flex cursor-pointer items-center justify-between px-6 py-4 text-sm font-semibold text-[var(--text)] transition-colors hover:text-[var(--accent)] [&::-webkit-details-marker]:hidden">
                {faq.q}
                <svg className="ml-2 h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="border-t border-[var(--border)] px-6 py-4 text-[13px] leading-relaxed text-[var(--text-muted)]">
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
        <p className="mt-2 text-sm text-[var(--text-muted)]">Sign up and launch your first agent in minutes.</p>
        <Link to="/login" className="mt-5 inline-block rounded-full bg-[var(--btn-primary-bg)] px-8 py-3 text-sm font-semibold text-[var(--btn-primary-text)] transition hover:shadow-xl hover:shadow-[var(--shadow)] active:scale-[0.97]">
          Launch App →
        </Link>
      </section>
      </ScrollSection>

      {/* ─── Footer ─── */}
      <footer className="relative z-10 border-t border-[var(--border)] bg-[var(--bg-alt)] px-6 py-6 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 md:flex-row md:justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/brand/dtour/logo.svg" alt="Detour Cloud" className="logo-cloud h-5 w-5 opacity-50" />
            <span className="text-xs text-[var(--text-muted)]">detour.ninja</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-[10px] uppercase tracking-widest text-[var(--text-faint)]">Powered by</span>
            <img src="/brand/dtour/elizaos-face.png" alt="" className="h-4 w-4 rounded-[3px] opacity-60" />
            <img src="/brand/dtour/elizaos-text.svg" alt="ElizaOS" className="h-3 opacity-50" />
            <span className="text-[var(--text-faint)]">·</span>
            <img src="/brand/dtour/elizacloud-text.svg" alt="ElizaCloud" className="h-3 opacity-50" />
          </div>
          <div className="flex gap-4 text-[11px] text-[var(--text-faint)]">
            <Link to="/token" className="hover:text-[var(--text-dim)] transition-colors">$DTOUR</Link>
            <Link to="/terms-of-service" className="hover:text-[var(--text-dim)] transition-colors">Terms</Link>
            <Link to="/privacy-policy" className="hover:text-[var(--text-dim)] transition-colors">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
