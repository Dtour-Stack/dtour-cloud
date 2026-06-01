import type { CodingProviderId } from "./codingProviders";
import { npmInstallCommand, providerById } from "./codingProviders";

/** @deprecated Use providerById(id).npmPackage — kept for docs/templates listing all packages. */
export const CODING_CLI_PACKAGES = [
  "opencode-ai",
  "@openai/codex",
  "@anthropic-ai/claude-code",
  "@earendil-works/pi-coding-agent",
] as const;

export function cliInstallCommandForProvider(id: CodingProviderId): string | null {
  const pkg = providerById(id).npmPackage;
  if (!pkg) return null;
  return npmInstallCommand(pkg);
}
