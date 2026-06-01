# Detour Cloud E2B template — bake agent CLIs for fast cold start.
# Build: see README.md (e2b template build).
# Upstream: https://github.com/e2b-dev/e2b

FROM e2bdev/code-interpreter:latest

RUN npm install -g --ignore-scripts \
  opencode-ai \
  @openai/codex \
  @anthropic-ai/claude-code \
  @earendil-works/pi-coding-agent
