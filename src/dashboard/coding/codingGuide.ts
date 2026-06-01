import type { TourStep } from "@/dashboard/design/GuidedTour";

export const CODING_TOUR: TourStep[] = [
  {
    title: "Coding sandboxes",
    body: "Run OpenCode, Codex, Claude Code, and Pi in isolation. Detour Cloud uses E2B Firecracker VMs (open-source infra at github.com/e2b-dev/e2b). Sandbox mode runs the same CLIs in your browser.",
    anchor: "coding-terminal",
  },
  {
    title: "Agent tabs (left rail)",
    body: "Pick OpenCode, Codex, Claude, Pi, or OpenRouter from the vertical tabs. A green dot means you saved a key for that agent.",
    anchor: "coding-providers",
  },
  {
    title: "Choose a backend",
    body: "Detour Cloud (E2B) = server microVM, billed in credits. Sandbox = WASM bash in-browser with npm-installed CLIs. Self-host is coming later.",
    anchor: "coding-backends",
  },
  {
    title: "Save keys & go",
    body: "Paste each provider API key once — encrypted server-side, injected into your session. Then click Run opencode / codex / claude / pi in the terminal.",
    anchor: "coding-launch",
  },
  {
    title: "Operator: E2B API key",
    body: "The platform E2B_API_KEY lives in deploy/.env (not in the browser). Users only add model keys. Build a custom template via services/coding-relay/e2b-template for faster starts.",
    anchor: "coding-setup",
  },
];
