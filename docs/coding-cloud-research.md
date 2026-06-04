# Detour Cloud — Coding Environment: Current State, Competitive Research & Direction

_Research briefing, 2026-06-03. Source of truth for the "cloud coding / web IDE / connect-to-local-machine" initiative._

---

## 0. TL;DR — the one reframe that changes everything

The founding ask was: _"connect to their local machine via SSH, push code, communicate remotely, even when the machine is locked and screen closed — like Codex."_

**The premise is partly a misconception, and it splits into two genuinely different products:**

| What you might mean | What it actually is | Status today |
| --- | --- | --- |
| "I close my laptop and the work keeps going" | **Cloud** execution. Codex/Cursor achieve this by running in *their* cloud, **not** by reaching into your locked machine. The laptop can close *precisely because nothing runs locally.* | **dtour already ships this** — E2B sandbox persists after you disconnect. Needs IDE chrome + agentic UI on top. |
| "dtour reaches into my *actual* local machine and runs things there" | A **local daemon + outbound tunnel**. This is the only way to truly drive your own hardware. | **Not built.** Buildable, but it's deliberate remote-code-execution on a user's box — handle with care. |

**No reference product (Codex, Cursor, Claude Code, Devin, Replit, Copilot, Jules) actually drives your locked local machine.** That's not a feature gap to match — it's a misunderstanding of where the magic runs. Decide which of the two products above you actually want before designing anything.

### The "even when locked / screen closed" honesty box
- **Screen locked (machine still on, lid open or on external display):** ✅ works. A background agent (macOS LaunchAgent) keeps running — *lock ≠ logout.*
- **Lid physically shut, on battery:** ❌ does **not** work without either (a) a root helper that sets `pmset -a disablesleep 1`, or (b) external power + display (clamshell mode). That's *sleep*, not lock — the OS suspends every process and tears down the network stack. `caffeinate -s` is **AC-power-only**. Codex can't do this either.

---

## 1. What dtour's "coding section" is today

A **white-label E2B reseller with a terminal-only coding surface.** Cleanly separated: React/Convex UI ↔ Bun WebSocket relay ↔ E2B ↔ agent-inference path.

### Frontend (`src/dashboard/coding/`)
| Route | File | Purpose |
| --- | --- | --- |
| `/coding` | `CodingDashboardPage.tsx` | Terminal (wterm) + WebSocket bridge to the relay; credit display |
| `/coding/setup` | `CodingSetupPage.tsx` | Backend picker: **runner** (E2B), **sandbox** (browser WASM bash), **selfhost** (paired desktop via approval link/manual code) |
| `/coding/:agent` | `CodingKeysPage.tsx` | Per-agent encrypted API keys (OpenCode/Codex/Claude/Pi) |
| `/coding/draft` | `CodingDraftPage.tsx` / `DraftLabSection.tsx` | Lightweight agent smoke-test (inference only) |
| `/coding/saves` | `WorkspaceSavesSection.tsx` | tar.gz workspace snapshots → Convex storage ($0.05 flat) |

Terminal tech: `@wterm/react` + `@wterm/just-bash` (WASM bash for the free browser sandbox). **No editor, no file tree, no LSP.**

### Execution backend (`services/coding-relay/`)
Bun WebSocket server in Docker. `/coding-ws?token=…&agent=…` → validates dtour session → **credit gate** (`coding.canStart`, min $0.01) → spins **E2B Sandbox** (2 vCPU / 0.5 GiB, 15-min hard cap) → bootstraps env + decrypts the selected agent's key → pipes PTY I/O ↔ WS → on close, `coding.recordSession` meters + debits.

### Billing (`convex/coding.ts`)
Raw E2B cost (CPU $0.000014/vCPU-s + RAM $0.0000045/GiB-s) × **1.5 markup**, **20% holder rate on coding sandboxes** (≥0.5% of $DTOUR supply), $0.01/session min. ~$0.04–0.05/hr non-holder. Ledgers: `creditBalances`, `codingUsage`, `codingWorkspaces`, `codingProviderSecrets` (AES-256-GCM, keys never sent to browser).

### Agent integration
**Draft Lab** does single-turn agent inference (`draftLab.quickTurn`) — **no code execution**, separate ledger. Agents cannot yet run code in the terminal or spawn subagents/workflows there.

### What's missing (the build surface)
Code editor (Monaco/CodeMirror) · file tree · LSP · agent-in-the-terminal (run code, spawn subagents/workflows) · persistent shared workspace across agent turns · hardened self-host operational UX beyond pairing/relay · any SSH / remote-machine / connect-your-computer path (none).

---

## 2. Competitive landscape (2025–2026)

| Product | Browser IDE? | Execution model | Async/parallel + PRs | Local ↔ cloud link | Signature UI |
| --- | --- | --- | --- | --- | --- |
| **OpenAI Codex** | Web task UI + IDE ext | Sandboxed cloud containers; local bubblewrap/Docker; net off by default | Yes + PRs + auto PR review | **Bidirectional state-preserving handoff** (best in class) | Diff preview, parallel local+cloud agents |
| **Cursor 3** | Desktop + Web + mobile PWA | Cloud VMs w/ **desktop + browser**; self-host option | Many parallel + PRs | Launch-anywhere (Slack/GitHub/Linear), review in IDE | **Browser-use video demos** of the agent's work |
| **Claude Code** | Web + CLI + Desktop + VS Code + JetBrains + Mobile | Isolated cloud sandbox; **git-proxy, creds never inside**; push restricted to working branch | Async/parallel + PRs | Web → **"Open in CLI"** (one-way pull-down) | Checkpoint undo, IDE diff review |
| **Devin 2.0** (+Windsurf) | Cloud agent-native IDE | Isolated VMs, parallel Devins | Highly autonomous + PRs | **Native local IDE via Windsurf** (acquired Dec 2025) | Editable plan, **live arch diagrams + self-wiki** |
| **Replit Agent 3** | Yes (full cloud IDE) | Containers + Postgres + integrated hosting; ~200-min autonomy | Self-test loop + 1-click deploy | **SSH "Launch VS Code"** (remote-into-cloud) | Live browser preview w/ agent cursor |
| **GitHub Copilot agent** | No (trigger from GitHub/VS Code) | **GitHub Actions** ephemeral env | Async + **draft PR as workspace** | GitHub-native PR pull | Draft-PR timeline = the workspace |
| **Google Jules** | No (web/API/CLI) | Fresh **Google Cloud VM** per task | Async/parallel + PRs | **Jules Tools CLI + API** (control-plane) | Plan + diff approve |

**Build-vs-buy infra:** WebContainers (instant, browser-only, JS) · **E2B / Firecracker microVMs** (strong isolation, any language — the agent de-facto standard; *what dtour already uses*) · Daytona/Coder containers (~90ms, cheaper, weaker isolation) · **code-server / Eclipse Theia** (self-host a VS Code-compatible web editor).

### Table stakes (expected of any credible cloud coding agent)
1. Isolated cloud sandbox per task, repo auto-cloned, ephemeral.
2. Async / background + **parallel** agents (close the tab, many at once).
3. GitHub-native loop — branch → **open a PR**; trigger via issue/PR mention.
4. Agentic self-correct loop (run → read errors → fix → re-run).
5. **Plan + diff review UI** before anything merges.
6. Multi-surface trigger (web + IDE + CLI; increasingly Slack/mobile).
7. Credential hardening (sandboxed exec, default-off network, scoped/proxied git creds).
8. Browser/app **self-verification** (agent drives a preview to prove it works).

### Still-rare differentiators (where to compete)
1. **True bidirectional, state-preserving local↔cloud handoff** (only Codex does it well). _The axis a white-label product could own._
2. Cloud agent with a real **desktop + browser that records video demos** (Cursor 3) — verifiable proof-of-work.
3. **Live architecture diagrams + self-maintained project wiki** persisted across runs (Devin).
4. Agents that **build other agents / cross-app automations** + integrated one-click hosting (Replit).

**Strategic read:** "Can it open a PR" is commoditized. The contested frontier is **how fluidly state moves between local and cloud**, and **how convincingly the agent proves its work ran.** dtour's differentiation budget is best spent there + on the custom agentic UI — not on re-implementing the async-PR loop.

---

## 3. Connecting to a user's LOCAL machine — architecture (if we build it)

**Connectivity:** custom **outbound WSS (443)** from a small dtour agent → our relay. NAT traversal is free and identical across all options (VS Code Remote Tunnels, Tailscale, cloudflared, ngrok) — the only real differences are auth model, admin requirement, and white-label fit. A custom outbound-WS relay (the same shape as the existing `coding-relay`) is the best productization fit: no third-party identity, white-label, full control of protocol + per-command approvals.

**Persistence (run in the *user's* context, not root — it needs their SSH keys / git / keychain):**
- **macOS:** per-user **LaunchAgent** (`~/Library/LaunchAgents/ninja.detour.agent.plist`, `RunAtLoad`+`KeepAlive`, `Aqua` session). Runs as the user, **survives screen lock**, launchd supervises. No admin for the agent itself.
- **Linux:** `systemctl --user` service + `loginctl enable-linger`.
- **Windows:** Scheduled Task as the user ("whether logged on or not"), restart-on-failure.

**Staying awake:** during an active job take an idle-sleep assertion (`caffeinate -i -w <pid>` or IOKit) — covers **locked** + lid-open-idle, **no root**. **Lid-shut-on-battery** is the hard limit: needs a small **privileged helper** toggling `pmset -a disablesleep` (one-time admin consent, opt-in, honest battery/thermal caveat) or clamshell (external power + display).

**Execution safety (copy Codex's model):** default **workspace-write** — auto read/edit/run inside the chosen workspace; **require approval** for out-of-workspace paths, network egress, destructive ops, and **`git push`**. Enforce with an OS sandbox (`sandbox-exec`/Seatbelt on macOS, `bwrap`+seccomp on Linux) so scope is *physically* enforced. `.git` internals read-only.

**Security:** device **pairing/enrollment** at install (mint a per-device identity, don't reuse the raw session token) · **short-lived rotating scoped tokens** on the wire · per-command permission prompts surfaced in the dtour web UI · **tamper-evident append-only audit log** (every command/edit/network/push/approval) · treat all repo content as untrusted (prompt-injection is the Gemini-CLI-class attack). This is, by construction, RCE you are deliberately building — least privilege, sandbox, audit.

---

## 4. Proposed decomposition (each is its own spec → plan → build)

The original ask is **~4 independent subsystems**, not one project. Recommended order is by value × (1 / risk), **not** by enthusiasm:

- **A. Web IDE on the existing E2B sandbox** — Monaco editor + file tree + the existing terminal, wired to E2B's filesystem API. _("Set up a folder structure for them" folds in here — it's not its own subsystem.)_ **Highest value, lowest risk, most table-stakes. Recommended first.**
- **B. Custom agentic UI** — agents running *inside* the workspace (run code, open diffs, spawn subagents/workflows), plan view, diff review, parallel agents, proof-of-work. The real differentiator.
- **C. Cloud continuity & GitHub loop** — async/background sessions that persist when you close the tab, branch → PR, multi-surface triggers. (Partly already true of E2B; needs UI + git proxy.)
- **D. Connect-to-local-machine daemon** — the dtour agent + tunnel from §3. **Highest risk (RCE), rests on the reframed premise. Last, and only if the founder genuinely wants to drive their own hardware (not just "close my laptop").**

**Open question blocking sequencing:** does the founder want _cloud continuity_ (A+B+C, no daemon) or _drive-my-real-machine_ (adds D), or both? And does "screen closed" mean *locked* (easy) or *lid physically shut* (needs root helper)? — resolve before designing.

---

## Sources
Codex [IDE](https://developers.openai.com/codex/ide) · [Cloud](https://developers.openai.com/codex/cloud) · [approvals/sandbox](https://developers.openai.com/codex/agent-approvals-security) · Cursor [Cloud Agents](https://cursor.com/docs/cloud-agent) · [Cursor 3](https://cursor.com/changelog/2-0) · Claude Code [on the web](https://code.claude.com/docs/en/claude-code-on-the-web) · [sandboxing](https://www.anthropic.com/engineering/claude-code-sandboxing) · [Devin 2.0](https://cognition.ai/blog/devin-2) · [+Windsurf](https://cognition.ai/blog/windsurf) · [Replit Agent 3](https://blog.replit.com/introducing-agent-3-our-most-autonomous-agent-yet) · [Copilot agent](https://docs.github.com/copilot/concepts/agents/coding-agent/about-coding-agent) · [Jules](https://jules.google/) · VS Code [Remote Tunnels](https://code.visualstudio.com/docs/remote/tunnels) · [Tailscale NAT](https://tailscale.com/blog/how-nat-traversal-works) · macOS [LaunchAgent vs Daemon](https://eclecticlight.co/2018/05/22/running-at-startup-when-to-use-a-login-item-or-a-launchagent-launchdaemon/) · [caffeinate](https://ss64.com/mac/caffeinate.html) · [pmset](https://www.dssw.co.uk/reference/pmset/) · [OWASP Agentic Top 10](https://goteleport.com/blog/owasp-top-10-agentic-applications/)
