import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black px-6 text-center">
      <div
        className="fixed inset-0 -z-10"
        style={{
          background: `
            radial-gradient(ellipse 80% 60% at 20% 30%, rgba(168,85,247,0.10) 0%, transparent 50%),
            radial-gradient(ellipse 60% 80% at 80% 70%, rgba(59,130,246,0.08) 0%, transparent 50%),
            linear-gradient(180deg, #0a0a0a 0%, #000000 100%)
          `,
        }}
      />
      <img
        src="/brand/dtour/ninja-squirrel.png"
        alt=""
        className="mb-6 h-32 w-32 object-contain opacity-70 drop-shadow-[0_0_20px_rgba(168,85,247,0.2)]"
      />
      <h1 className="text-5xl font-bold tracking-tight text-white">404</h1>
      <p className="mt-3 text-lg text-white/60">
        This squirrel got lost in the woods.
      </p>
      <p className="mt-1 text-sm text-white/40">
        The page you're looking for doesn't exist — or took a detour.
      </p>
      <Link
        to="/"
        className="mt-8 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:shadow-xl hover:shadow-white/10"
      >
        Back to safety
      </Link>
    </div>
  );
}
