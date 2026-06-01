/** Build shell export lines for in-browser Sandbox mode (keys from Convex, in-memory only). */

export function shellQuote(v: string): string {
  return `'${v.replace(/'/g, `'\\''`)}'`;
}

export function envExportScript(env: Record<string, string>): string {
  const lines = Object.entries(env)
    .filter(([, v]) => v)
    .map(([k, v]) => `export ${k}=${shellQuote(v)}`);
  return [
    "# Detour — sandbox agent keys (session only)",
    ...lines,
    'export PATH="$HOME/.local/bin:$PATH:/usr/local/bin"',
  ].join("\n");
}
