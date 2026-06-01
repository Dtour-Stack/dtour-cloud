import { useAction } from "convex/react";
import { anyApi } from "convex/server";
import { useMemo, useState } from "react";
import { getDtourSessionToken } from "@/lib/session";
import { Button, Icon, Panel, cn } from "@/ui";

type GenerateMode = "mockup" | "wireframe" | "component";
type GeneratedPreview = {
  title: string;
  html: string;
  notes: string[];
};

type RunChat = (args: {
  token: string;
  model: string;
  messages: { role: string; content: string }[];
  refId: string;
}) => Promise<{ text: string }>;

const HTML_PREVIEW_SYSTEM = `You are Detour Studio's UI mockup generator. Output ONLY raw JSON:
{"title":"short title","html":"complete HTML document or body snippet","notes":["short implementation note"]}

Rules:
- Generate self-contained HTML, CSS, and lightweight vanilla JS for a sandboxed iframe preview.
- No external URLs, no network calls, no remote fonts, no imports, no storage, no cookies.
- Scripts are allowed only for local UI behavior: tabs, toggles, preview state, fake filters, menu open/close.
- Keep the HTML under 18kb.
- Use Detour styling unless the prompt requests another style: near-black canvas, glass panels, white opacity text, hairline borders, one violet-blue accent, Inter/system font.
- Use real HTML controls and labels. Do not output placeholders like "lorem ipsum" or generic empty boxes.
- The preview must fit well at desktop width and still work when narrowed.`;

const MODE_COPY: Record<GenerateMode, { label: string; hint: string; prompt: string }> = {
  mockup: {
    label: "Mockup",
    hint: "High-fidelity product screen",
    prompt:
      "Generate a Detour admin dashboard screen for reviewing tester applications. Include a left nav, applicant queue, score panel, approve/deny controls, and a chat-style assistant drawer.",
  },
  wireframe: {
    label: "Wireframe",
    hint: "Structure first, low visual weight",
    prompt:
      "Generate a high-fidelity wireframe for an agent email inbox: sidebar, message list, reply composer, status chips, and a preview panel. Keep it grayscale with clear labels.",
  },
  component: {
    label: "Component",
    hint: "Focused reusable UI piece",
    prompt:
      "Generate an interactive pricing/settings component for enabling AgentMail on an AI agent. Include mailbox status, pod selection, routing rules, and a test email button.",
  },
};

const STARTER_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; background: #0a0a0a; color: white; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      .shell { min-height: 100vh; display: grid; grid-template-columns: 220px 1fr; }
      nav { border-right: 1px solid rgb(255 255 255 / 0.1); background: rgb(0 0 0 / 0.35); padding: 18px; }
      main { padding: 28px; }
      .logo { display: flex; align-items: center; gap: 10px; font-weight: 700; letter-spacing: -0.01em; }
      .mark { width: 28px; height: 28px; border-radius: 999px; background: linear-gradient(90deg,#c084fc,#818cf8,#60a5fa); }
      .nav-item { margin-top: 14px; color: rgb(255 255 255 / 0.58); font-size: 13px; }
      .hero { border: 1px solid rgb(255 255 255 / 0.1); border-radius: 22px; background: rgb(255 255 255 / 0.035); padding: 24px; }
      h1 { margin: 0; max-width: 720px; font-size: clamp(30px, 5vw, 58px); line-height: 1.03; letter-spacing: -0.035em; }
      p { color: rgb(255 255 255 / 0.6); line-height: 1.6; }
      .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 18px; }
      .card { min-height: 130px; border: 1px solid rgb(255 255 255 / 0.1); border-radius: 16px; background: rgb(0 0 0 / 0.28); padding: 16px; }
      .label { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: rgb(255 255 255 / 0.4); }
      .value { margin-top: 14px; font-size: 26px; font-weight: 700; }
      button { border: 0; border-radius: 999px; background: white; color: black; padding: 10px 15px; font-weight: 700; cursor: pointer; }
      .secondary { border: 1px solid rgb(255 255 255 / 0.16); background: rgb(255 255 255 / 0.06); color: white; }
      .actions { display: flex; gap: 10px; margin-top: 22px; }
      .card[data-active="true"] { border-color: rgb(168 85 247 / 0.45); background: rgb(168 85 247 / 0.12); }
      @media (max-width: 760px) { .shell { grid-template-columns: 1fr; } nav { display: none; } .grid { grid-template-columns: 1fr; } main { padding: 16px; } }
    </style>
  </head>
  <body>
    <div class="shell">
      <nav>
        <div class="logo"><span class="mark"></span>Detour</div>
        <div class="nav-item">Generate</div>
        <div class="nav-item">Studio</div>
        <div class="nav-item">Workflows</div>
      </nav>
      <main>
        <section class="hero">
          <h1>Preview agent-native UI before it touches production.</h1>
          <p>Sandboxed HTML, local state, and a clean Detour surface for fast product decisions.</p>
          <div class="actions">
            <button id="toggle">Toggle state</button>
            <button class="secondary">Open in Studio</button>
          </div>
          <div class="grid">
            <div class="card" data-active="true"><div class="label">Status</div><div class="value">Ready</div></div>
            <div class="card"><div class="label">Preview</div><div class="value">HTML</div></div>
            <div class="card"><div class="label">Runtime</div><div class="value">JS</div></div>
          </div>
        </section>
      </main>
    </div>
    <script>
      const cards = Array.from(document.querySelectorAll('.card'));
      document.getElementById('toggle').addEventListener('click', () => {
        cards.forEach((card, index) => card.dataset.active = String(index === 1));
      });
    </script>
  </body>
</html>`;

function stripCodeFence(raw: string): string {
  return raw.trim().replace(/^```(?:json|html)?/i, "").replace(/```$/i, "").trim();
}

function extractJsonObject(raw: string): unknown {
  const text = stripCodeFence(raw);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("The model did not return a JSON object.");
  return JSON.parse(text.slice(start, end + 1));
}

function parsePreview(raw: string): GeneratedPreview {
  const obj = extractJsonObject(raw) as { title?: unknown; html?: unknown; notes?: unknown };
  if (typeof obj.html !== "string" || !obj.html.trim()) throw new Error("The model did not return HTML.");
  const notes = Array.isArray(obj.notes)
    ? obj.notes.filter((note): note is string => typeof note === "string").slice(0, 4)
    : [];
  return {
    title: typeof obj.title === "string" && obj.title.trim() ? obj.title.trim() : "Generated preview",
    html: obj.html.trim(),
    notes,
  };
}

function withPreviewPolicy(html: string): string {
  const csp =
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'">`;
  if (/<html[\s>]/i.test(html)) {
    if (/<head[\s>]/i.test(html)) return html.replace(/<head([^>]*)>/i, `<head$1>${csp}`);
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${csp}</head>`);
  }
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${csp}</head><body>${html}</body></html>`;
}

async function generateHtmlPreview(
  runChat: RunChat,
  token: string,
  mode: GenerateMode,
  prompt: string,
): Promise<GeneratedPreview> {
  const refId = `design-html-${mode}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const { text } = await runChat({
    token,
    model: "anthropic/claude-sonnet-4.5",
    refId,
    messages: [
      { role: "system", content: HTML_PREVIEW_SYSTEM },
      {
        role: "user",
        content: `Mode: ${mode}\n\nPrompt:\n${prompt}`,
      },
    ],
  });
  return parsePreview(text);
}

export function GeneratePanel() {
  const token = getDtourSessionToken();
  const runChat = useAction(anyApi.inference.runChat);
  const [mode, setMode] = useState<GenerateMode>("mockup");
  const [prompt, setPrompt] = useState(MODE_COPY.mockup.prompt);
  const [preview, setPreview] = useState<GeneratedPreview>({
    title: "Detour preview",
    html: STARTER_HTML,
    notes: ["Sandboxed iframe", "Inline CSS", "Vanilla JS toggle"],
  });
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const srcDoc = useMemo(() => withPreviewPolicy(preview.html), [preview.html]);

  function applyMode(nextMode: GenerateMode) {
    setMode(nextMode);
    setPrompt(MODE_COPY[nextMode].prompt);
  }

  async function generate() {
    if (!token || busy || !prompt.trim()) return;
    setBusy(true);
    setCopied(false);
    setError(null);
    try {
      setPreview(await generateHtmlPreview(runChat, token, mode, prompt.trim()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function copyHtml() {
    setCopied(false);
    setError(null);
    try {
      await navigator.clipboard.writeText(preview.html);
      setCopied(true);
    } catch {
      setError("Clipboard access is blocked in this browser.");
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
      <Panel className="fade-up flex min-h-[620px] flex-col p-5">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(MODE_COPY) as GenerateMode[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => applyMode(id)}
              aria-pressed={mode === id}
              className={cn(
                "min-h-10 rounded-full px-4 text-[12px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60",
                mode === id
                  ? "bg-white text-black"
                  : "border border-white/15 bg-white/[0.03] text-white/65 hover:bg-white/10 hover:text-white",
              )}
            >
              {MODE_COPY[id].label}
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4">
          <div className="text-[10px] uppercase tracking-widest text-white/35">Mode</div>
          <div className="mt-1 text-sm font-medium text-white">{MODE_COPY[mode].hint}</div>
        </div>

        <label htmlFor="design-generate-prompt" className="mt-5 block text-[11px] uppercase tracking-widest text-white/50">
          Prompt
        </label>
        <textarea
          id="design-generate-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={12}
          placeholder="Describe the screen, component, or wireframe..."
          className="mt-2 min-h-64 w-full flex-1 resize-none rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-3 text-[13px] leading-relaxed text-white placeholder:text-white/30 focus:border-purple-400/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
        />

        {error && (
          <div className="mt-3 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-[12px] leading-relaxed text-red-100/90">
            {error}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button onClick={() => void generate()} disabled={!token || busy || !prompt.trim()}>
            <Icon.Wand size={14} /> {busy ? "Generating" : "Generate preview"}
          </Button>
          <Button variant="secondary" onClick={() => void copyHtml()} disabled={!preview.html}>
            <Icon.Copy size={14} /> {copied ? "Copied" : "Copy HTML"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setPreview({ title: "Detour preview", html: STARTER_HTML, notes: ["Sandboxed iframe", "Inline CSS", "Vanilla JS toggle"] });
              setCopied(false);
              setError(null);
            }}
          >
            Reset
          </Button>
        </div>
      </Panel>

      <Panel className="fade-up min-h-[620px] overflow-hidden p-0">
        <div className="flex h-12 items-center justify-between border-b border-white/10 bg-black/40 px-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-white">{preview.title}</div>
            <div className="text-[11px] text-white/35">Sandboxed web viewer</div>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] text-white/45">
            <span className={cn("h-1.5 w-1.5 rounded-full", busy ? "bg-amber-300 motion-safe:animate-pulse" : "bg-emerald-300")} />
            {busy ? "Generating" : "Ready"}
          </div>
        </div>
        <div className="grid min-h-[568px] gap-px bg-white/10 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="bg-black p-3">
            <iframe
              key={srcDoc}
              title="Generated design preview"
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
              srcDoc={srcDoc}
              className="h-[544px] w-full rounded-2xl border border-white/10 bg-white"
            />
          </div>
          <aside className="bg-[#0d0d0d] p-4">
            <div className="text-[10px] uppercase tracking-widest text-white/35">Preview notes</div>
            <div className="mt-3 space-y-2">
              {preview.notes.length === 0 ? (
                <p className="text-[12px] leading-relaxed text-white/45">No notes returned with this preview.</p>
              ) : (
                preview.notes.map((note) => (
                  <div key={note} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-[12px] leading-relaxed text-white/55">
                    {note}
                  </div>
                ))
              )}
            </div>
            <details className="mt-4 rounded-xl border border-white/10 bg-black/25 p-3">
              <summary className="cursor-pointer text-[12px] font-medium text-white/75">Source</summary>
              <textarea
                readOnly
                value={preview.html}
                className="mt-3 h-64 w-full resize-none rounded-lg border border-white/10 bg-black/60 p-3 font-mono text-[10px] leading-relaxed text-white/50 focus:outline-none"
              />
            </details>
          </aside>
        </div>
      </Panel>
    </div>
  );
}
