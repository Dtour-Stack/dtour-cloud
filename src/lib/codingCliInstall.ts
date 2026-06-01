/** Global npm packages installed in E2B sandboxes and browser Sandbox mode. */

export const CODING_CLI_PACKAGES = [
  "opencode-ai",
  "@openai/codex",
  "@anthropic-ai/claude-code",
  "@earendil-works/pi-coding-agent",
] as const;

export const CODING_CLI_NPM_INSTALL = `npm install -g --ignore-scripts ${CODING_CLI_PACKAGES.join(" ")} 2>/dev/null`;
