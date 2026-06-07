import { useEffect, useRef, useState } from "react";
import { nextScenicMsg } from "@/lib/scenic-msgs";
import { spawnAmbientParticles } from "@/lib/ambient-particles";

export function SplashScreen() {
  const [msg, setMsg] = useState(nextScenicMsg);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const cleanup = spawnAmbientParticles(el, 12);
    return cleanup;
  }, []);

  useEffect(() => {
    const t = setInterval(() => setMsg(nextScenicMsg()), 2800);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0a0a0a]"
    >
      <div className="flex flex-col items-center gap-3">
        <img
          src="/brand/dtour/logo.svg"
          alt="Dtour"
          className="splash-pulse h-12 w-12"
        />
        <p className="min-h-[1.2em] text-sm text-white/30 transition-opacity duration-500">
          {msg}
        </p>
      </div>
    </div>
  );
}
