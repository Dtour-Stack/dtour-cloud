import { Link } from "react-router-dom";

export default function NinjaPage() {
  const facts = [
    "Squirrels plant thousands of trees every year by forgetting where they buried their acorns.",
    "A squirrel's front teeth never stop growing — they stay sharp by gnawing.",
    "The ninja squirrel of Detour Cloud has been spotted in 3 different timezones.",
    "Detour Cloud runs on code, caffeine, and misplaced acorns.",
    "The 'scenic route' is always worth it — even in production.",
  ];

  return (
      <div className="public-page flex min-h-screen flex-col items-center justify-center bg-black px-6 text-center">
      <div
        className="fixed inset-0 -z-10"
        style={{
          background: `
            radial-gradient(ellipse 80% 60% at 20% 30%, rgba(168,85,247,0.12) 0%, transparent 50%),
            radial-gradient(ellipse 60% 80% at 80% 70%, rgba(236,72,153,0.10) 0%, transparent 50%),
            linear-gradient(180deg, #0a0a0a 0%, #000000 100%)
          `,
        }}
      />
      <div className="relative">
        {[...Array(3)].map((_, i) => (
          <img
            key={i}
            src="/brand/dtour/ninja-squirrel.png"
            alt=""
            className="squirrel-parade absolute left-1/2 h-16 w-16 -translate-x-1/2 object-contain"
            style={{
              animationDelay: `${i * 0.15}s`,
              top: `${i * -56}px`,
              opacity: 0,
              animation: `squirrel-parade 0.5s ${i * 0.15}s cubic-bezier(0.34,1.56,0.64,1) forwards`,
            }}
          />
        ))}
        <img
          src="/brand/dtour/ninja-squirrel.png"
          alt="Ninja squirrel mascot — Detour Cloud"
          className="mx-auto h-28 w-28 object-contain drop-shadow-[0_0_25px_rgba(168,85,247,0.35)]" />
      </div>
      <h1 className="mt-8 text-3xl font-bold tracking-tight text-[var(--text)]">
        You found the squirrel!
      </h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--text-muted)]">
        Deep in the Detour Cloud canopy, a lone squirrel ninja watches over the
        infrastructure. Nobody knows how it got there. Some say it was the first
        deploy.
      </p>
      <div className="mt-6 space-y-2 rounded-xl border border-purple-400/10 bg-purple-400/5 px-5 py-4">
        {facts.map((fact, i) => (
          <p key={i} className="text-xs leading-relaxed text-purple-200/70">
            🐿️ {fact}
          </p>
        ))}
      </div>
      <Link
        to="/"
        className="mt-8 rounded-full bg-[var(--btn-primary-bg)] px-6 py-3 text-sm font-semibold text-[var(--btn-primary-text)] transition hover:shadow-xl hover:shadow-[var(--shadow)]"
      >
        Back to the cloud
      </Link>
    </div>
  );
}
