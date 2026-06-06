export type DashboardSource = {
  kind: string;
  label: string;
  ref: string;
  endpoint?: string;
};

export type CustomDashboardData = {
  name: string;
  title: string;
  html: string;
  notes: string[];
  sources: DashboardSource[];
  updatedAt: number;
};

export function withDashboardPreviewPolicy(html: string, sources: DashboardSource[] = []): string {
  const csp =
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'">`;
  const sourceScript = `<script>window.DETOUR_DASHBOARD_SOURCES=${JSON.stringify(sources).replace(/</g, "\\u003c")};</script>`;
  if (/<html[\s>]/i.test(html)) {
    if (/<head[\s>]/i.test(html)) return html.replace(/<head([^>]*)>/i, `<head$1>${csp}${sourceScript}`);
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${csp}${sourceScript}</head>`);
  }
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${csp}${sourceScript}</head><body>${html}</body></html>`;
}
