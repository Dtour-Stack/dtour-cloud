import type { TourStep } from "@/dashboard/design/GuidedTour";

export const CODING_TOUR: TourStep[] = [
  {
    title: "Coding sandboxes",
    body: "Run OpenCode, Codex, Claude Code, and Pi in isolation. Detour Cloud uses E2B Firecracker VMs (open-source infra at github.com/e2b-dev/e2b). Sandbox mode runs the same CLIs in your browser.",
    anchor: "coding-terminal",
  },
  {
    title: "Coding sidebar",
    body: "Terminal, Setup, Draft lab, and Saved work replace the normal dashboard nav. Each agent (OpenCode, Codex, Claude, Pi) has its own page for API keys.",
    anchor: "coding-setup",
  },
  {
    title: "Choose a backend",
    body: "Setup → Detour Cloud (E2B) or in-browser Sandbox. Pick an agent in the sidebar; each session mkdir ~/workspace and installs only that CLI.",
    anchor: "coding-backends",
  },
  {
    title: "Save keys & run",
    body: "Under Agents in the sidebar, paste each provider key once. Use Open terminal to launch opencode, codex, claude, or pi.",
    anchor: "coding-launch",
  },
  {
    title: "Draft agent lab",
    body: "Pick one of your lightweight Agents and send a test turn — same inference path as Agents chat (persona, plugins, model). Use E2B for plugin/workflow hacking; use Draft lab to validate prompts.",
    anchor: "coding-draft-lab",
  },
  {
    title: "Save your work",
    body: "While connected to Detour Cloud, save ~/workspace as a tarball for a small flat fee (~$0.05). Downloads appear in the list below.",
    anchor: "coding-workspace-save",
  },
  {
    title: "Operator: E2B API key",
    body: "The platform E2B_API_KEY lives in deploy/.env (not in the browser). Users only add model keys. Build a custom template via services/coding-relay/e2b-template for faster starts.",
    anchor: "coding-setup",
  },
];
