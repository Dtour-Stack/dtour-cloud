import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Custom Dtour dashboard host. The @elizaos packages are deliberately NOT
// aliased here — the few cloud-frontend helpers we reuse are copied into src/
// (browser-safe), so Vite never bundles node-leaning monorepo source.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Solana wallet adapters expect a Node-ish `global`/`Buffer`. `global` is
  // defined here; `Buffer` is shimmed at runtime in src/polyfills.ts.
  // (vite-plugin-node-polyfills is incompatible with Vite 8 / rolldown.)
  define: { global: "globalThis" },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // The symlinked monorepo (packages/, plugins/) lives inside this repo for the
  // backend's tsconfig resolution. Stop Vite's dep scanner from crawling it —
  // only scan our own entry.
  optimizeDeps: { entries: ["index.html"], include: ["@excalidraw/excalidraw"] },
  server: { port: 5174, fs: { strict: false } },
});
