import "@/polyfills";
import "@/globals.css";
import "streamdown/styles.css";
import { ConvexProvider } from "convex/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "@/App";
import { convex } from "@/lib/convex";
import { StewardProvider } from "@/providers/StewardProvider";
import { ThemeProvider } from "@/providers/ThemeProvider";
import "@/lib/easter-eggs";
import { trackKonamiCode, trackScenicChord } from "@/lib/easter-eggs";

// Capture an affiliate referral code (detour.ninja/?ref=CODE) at first load;
// AppShell attributes it once the user has a session.
try {
  const ref = new URLSearchParams(window.location.search).get("ref");
  if (ref && !localStorage.getItem("dtour-ref")) localStorage.setItem("dtour-ref", ref);
} catch {
  /* ignore */
}

// Global secret keyboard listeners
window.addEventListener("keydown", (e) => {
  trackKonamiCode(e.key);
  trackScenicChord(e.key);
});

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root element not found");

createRoot(rootEl).render(
  <StrictMode>
    <ThemeProvider>
      <ConvexProvider client={convex}>
        <BrowserRouter>
          <StewardProvider>
            <App />
          </StewardProvider>
        </BrowserRouter>
      </ConvexProvider>
    </ThemeProvider>
  </StrictMode>,
);
