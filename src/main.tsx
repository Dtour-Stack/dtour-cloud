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

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root element not found");

createRoot(rootEl).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <BrowserRouter>
        <StewardProvider>
          <App />
        </StewardProvider>
      </BrowserRouter>
    </ConvexProvider>
  </StrictMode>,
);
