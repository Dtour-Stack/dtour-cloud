import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/dashboard/AppShell";

const PREF_KEY = "dtour-prefs";

export default function SettingsPage() {
  const [prefs, setPrefs] = useState<{ sounds: boolean; compact: boolean }>({
    sounds: true,
    compact: false,
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREF_KEY);
      if (raw) setPrefs({ sounds: true, compact: false, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
  }, []);

  function toggle(k: "sounds" | "compact") {
    setPrefs((p) => {
      const next = { ...p, [k]: !p[k] };
      try {
        localStorage.setItem(PREF_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <AppShell title="Settings">
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-xl font-semibold text-white">Settings</h1>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02]">
          <Toggle label="Notification sounds" on={prefs.sounds} onClick={() => toggle("sounds")} />
          <Toggle label="Compact UI" on={prefs.compact} onClick={() => toggle("compact")} />
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-white">Profile</div>
              <div className="text-xs text-white/45">Username, email, socials, avatar.</div>
            </div>
            <Link to="/profile" className="text-sm text-purple-300 hover:underline">
              Edit →
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between border-b border-white/5 px-4 py-3 text-left last:border-0 hover:bg-white/[0.02]"
    >
      <span className="text-sm text-white/80">{label}</span>
      <span
        className={`flex h-5 w-9 items-center rounded-full p-0.5 transition ${on ? "bg-purple-500" : "bg-white/15"}`}
      >
        <span className={`h-4 w-4 rounded-full bg-white transition ${on ? "translate-x-4" : ""}`} />
      </span>
    </button>
  );
}
