/** Global npm packages installed in E2B sandboxes and browser Sandbox mode. */

export const CODING_CLI_PACKAGES = [
  "opencode-ai",
  "@openai/codex",
  "@anthropic-ai/claude-code",
  "@earendil-works/pi-coding-agent",
] as const;

/** Ensure a writable home + workspace before npm global installs (E2B / WASM bash). */
export const CODING_HOME_SETUP = [
  'export HOME="${HOME:-/home/user}"',
  'mkdir -p "$HOME" "$HOME/workspace" "$HOME/.detour" "$HOME/.detour/bin"',
].join("\n");

export const CODING_CLI_NPM_INSTALL = [
  CODING_HOME_SETUP,
  `npm install -g --ignore-scripts ${CODING_CLI_PACKAGES.join(" ")} 2>/dev/null`,
].join("\n");
