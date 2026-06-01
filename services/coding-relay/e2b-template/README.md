# Detour E2B sandbox template

Pre-bakes coding-agent CLIs so sandboxes start faster than runtime `npm install -g`.

Based on [E2B sandbox templates](https://e2b.dev/docs/sandbox-template) ([open-source E2B](https://github.com/e2b-dev/e2b)).

## Prerequisites

1. [E2B account](https://e2b.dev) and API key → set `E2B_API_KEY` in `deploy/.env`
2. E2B CLI: `npm i -g @e2b/cli` then `e2b login`

## Build

```bash
cd services/coding-relay/e2b-template
e2b template init   # once, if no e2b.Dockerfile yet
```

Use this `e2b.Dockerfile`:

```dockerfile
FROM e2bdev/code-interpreter:latest

RUN npm install -g --ignore-scripts \
  opencode-ai \
  @openai/codex \
  @anthropic-ai/claude-code \
  @earendil-works/pi-coding-agent
```

```bash
e2b template build -c "/root/.jupyter/start-up.sh"
```

Copy the printed **template ID** into `deploy/.env`:

```bash
E2B_TEMPLATE=your-template-id
```

Redeploy (`bash deploy/deploy.sh`). User API keys are still injected at session start from the Coding sidebar — the template only ships binaries.
