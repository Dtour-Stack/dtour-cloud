# Portable Coding Sessions — local ↔ cloud (Design Spec)

_2026-06-03. Approved direction (founder). Companion to `docs/coding-cloud-research.md`._
_This spec defines the whole initiative's architecture. Each milestone (M0–M4) gets its own implementation plan; the build order is finalized in writing-plans, not here._

---

## 1. Goal & decision

Turn dtour's terminal-only coding surface into a **portable coding session** platform: a session is bound to a *project*, not to *where it runs*. The user can run a session **on their own Mac** (a dtour agent) or **in a cloud sandbox** (E2B), **dispatch a prompt to a freshly-provisioned cloud agent from the desktop** seeded from the exact project they're in, and **move a live session between local and cloud mid-conversation** and keep prompting.

Decisions locked in brainstorming:
- **Full fluid local↔cloud** is the destination (research's rare "state-preserving handoff" moat), built in milestones — not all at once.
- **Agent-prompt-first**, editor-available. Primary interaction is prompting an agent and reviewing its work (Codex/Devin-shaped); Monaco + file tree exist to watch/tweak, not to hand-code from scratch. → lighter LSP investment.
- **Honesty boundaries are first-class** (see §4): "seamless" covers code + conversation, not the running environment; "always-on while away" means *locked & awake*, not *lid-shut asleep*.

Non-goals (v-this-initiative): driving a fully-asleep/lid-shut machine (needs root `pmset disablesleep`; deferred, opt-in later), a from-scratch hand-coding IDE with full multi-language LSP, mobile-native apps.

---

## 2. Core architecture — the Session is the source of truth

One idea carries the system: **a Session lives in Convex, not on any machine. Backends *attach* to it.**

A Session record (Convex) holds:
- `sessionId`, `ownerPubkey`, `project` (repo identity: origin URL + a local-path fingerprint), `title`.
- **Conversation**: the thread of prompts, agent turns, tool calls, plans, diffs (reuses the existing dtour thread/workflow model).
- **Code pointer**: `branch` (the session's working branch, e.g. `dtour/session-<id>`), `baseRef` (HEAD or a designated branch it forked from), and a `workingChanges` reference (a patch/bundle of uncommitted changes — see §6).
- **Environment spec**: detected/declared per-repo tooling (devcontainer, `.dtour/setup.sh`, install commands) — *describes how to re-warm*, not the warm state itself.
- `activeBackend`: `local:<deviceId>` | `cloud:<sandboxId>` | `detached`.
- `snapshotPointer` (optional): a warm-environment snapshot handle (workspace tar.gz or E2B pause handle) — a *speed* optimization, not a correctness requirement (§5).
- timestamps, status (`live` | `idle` | `archived`).

The **local agent** and the **cloud sandbox** are then **two symmetric backends** that attach to a session. Neither owns the session. This is what turns handoff into a *backend swap* instead of a *migration*.

```
                 ┌──────────────── Convex ────────────────┐
                 │  Session (source of truth)             │
                 │  chat · branch · workingChanges ·      │
                 │  env spec · activeBackend · snapshot   │
                 └───────────▲───────────────▲────────────┘
                  attach      │               │   attach
              ┌───────────────┘               └───────────────┐
       ┌──────┴───────┐                               ┌────────┴────────┐
       │ LOCAL backend │                               │  CLOUD backend  │
       │ dtour-agent   │  ── code via git ──▶◀── code via git ──         │
       │ on user's Mac │                               │  E2B sandbox    │
       └───────────────┘                               └─────────────────┘
```

---

## 3. The two backends (symmetric)

**Cloud backend** — extends the existing `services/coding-relay` + E2B path:
- Provisions an E2B sandbox, clones the session branch, builds the file tree, runs the repo's tooling (§6), runs the agent against the prompt, streams PTY + structured events back.
- Re-attachable: a destroyed sandbox is reprovisioned from the session (branch + workingChanges + env spec) with **zero history loss** (history lives in git + Convex, §5).
- Billed through the existing `convex/coding.ts` ledger (E2B cost × markup, coding holder rate where supported).

**Local backend** — a new small **dtour-agent** in the user's macOS session:
- Runs as a **LaunchAgent** (user context → has the user's `~/.ssh`, git config, keychain; survives screen lock), `RunAtLoad` + `KeepAlive`.
- **Dials out over WSS (443)** to the dtour relay (same shape as coding-relay) — no inbound ports, no NAT config.
- Attaches a session to a **real git worktree on disk**, runs the agent/commands there, `git push` with the user's own creds.
- Holds an **idle-sleep power assertion** (`caffeinate -i -w <pid>` / IOKit `PreventUserIdleSystemSleep`) **only while a job is queued/active + a short keep-alive window** → stays ready while locked & awake, battery-friendly otherwise. No root.
- Enforces a **workspace scope** via an OS sandbox (`sandbox-exec`/Seatbelt) so writes outside the chosen workspace are *physically* impossible; `.git` internals read-only.

Both backends render into the **same web shell** (terminal + file tree + editor + chat/plan), so the surface is identical regardless of where execution happens.

---

## 4. What travels in a handoff (honest "seamless")

Handoff moves three kinds of state; they are **not** equally instant. Naming this is a hard requirement of the design.

| State | Lives in | On a cross-backend move | Speed |
| --- | --- | --- | --- |
| **Code** (files, git history, uncommitted diff) | git (+ a working-changes patch) | branch fetched/applied on target | fast, lossless ✅ |
| **Conversation / plan / agent context** | **Convex** (visible to both backends) | nothing to move — target reads the same thread | instant ✅ |
| **Running environment** (deps, build artifacts, env vars, live dev server) | neither git nor Convex | target **re-warms** (re-runs repo tooling) | seconds–minutes ⚠️ |

**Therefore: code + conversation are seamless; the environment warms up on arrival.** The UI must show a clear "re-warming on <backend>…" state, not pretend it's instant.

**In-RAM agent state assumption:** our agents reconstruct context from the Convex thread each turn rather than hiding state in a long-lived process. If a CLI agent (e.g. a local Claude/Codex process) is mid-task with in-memory state, handoff **checkpoints first** (commit/stash working tree, flush the turn to Convex) before swapping `activeBackend`. We never silently drop in-flight work.

---

## 5. Persistence model (the cheap 90% vs the expensive 10%)

"Keep sandboxes with all git history and chat history" decomposes into two very different costs:

- **History persistence = effectively free and always-on.** Git history is in the repo; chat history is in Convex. A sandbox can be destroyed and reprovisioned and **lose no history**. This is the default and requires no sandbox persistence at all.
- **Warm-environment persistence = the only expensive part, and optional.** Keeping installed deps / build artifacts / a running server hot across disconnects is a *speed* feature, implemented via E2B pause/resume or a workspace snapshot keyed to the session. **To verify before promising any resume speed:** exactly what E2B pause/resume persists (filesystem only? memory?) and its cost/latency. If it's cheap → default-on; if not → opt-in "keep warm" toggle with an idle TTL.

This split shrinks the build: we ship correct, history-preserving sessions immediately; warm-resume is a later optimization.

---

## 6. Desktop → cloud dispatch (worktree seeding + per-repo tooling)

From the desktop, "send this prompt to a cloud agent against my current project":

1. dtour-agent detects the **current project** (git root of the user's cwd / a project picker).
2. It creates a **fresh worktree/branch** from `HEAD` (or a designated branch): `git worktree add … -b dtour/session-<id> <baseRef>`.
3. It captures **uncommitted working changes** as a patch (`git diff` incl. staged + untracked snapshot) so the cloud starts from *exactly* what's on disk, not just the last commit.
4. Code is transported to the cloud sandbox via git: push the branch + apply the working-changes patch. Transport options to decide in the plan: (a) push to the user's `origin`, (b) push to a **dtour-hosted internal git remote**, or (c) `git bundle` streamed over the WS channel. *(Recommendation: dtour-hosted remote or bundle, to avoid polluting the user's origin with session branches.)*
5. The cloud backend clones, builds the file tree, and **runs the repo's tooling**: detect a devcontainer / `.dtour/setup.sh` / language manifests (package.json, pyproject, Cargo, …) and run the appropriate install/setup. The resulting env spec is saved to the Session for later re-warms.
6. The agent runs against the prompt; events stream to the web shell; a Session is created/linked in Convex.

The reverse (cloud → local seeding) is symmetric: fetch the branch + apply working-changes into a local worktree, run local tooling.

---

## 7. UI model (agent-prompt-first, editor available)

Shared web shell (same for both backends):
- **Chat/plan pane** (primary): prompt the agent, watch its plan, turns, and tool calls; **proof-of-work** stream (commands run, files touched, tests). This is the main surface.
- **Diff/review pane**: review the agent's changes before commit/push; approve/reject.
- **File tree + Monaco editor**: open/tweak files (read-mostly; light editing). LSP optional/per-language, deferred.
- **Terminal**: the existing wterm PTY, now backed by whichever backend is active.
- **Backend indicator + handoff controls**: a clear "Running on: Local / Cloud" badge with **"Work locally"** (→ local) and **"Transfer to local" / "Send to cloud"** buttons. During a move: an explicit **"re-warming on <target>…"** state.

---

## 8. Security model (this is deliberate RCE — treat it as such)

The local agent runs commands and `git push` on a user's machine, reachable from the cloud. Mandatory:
- **Device pairing/enrollment** at install: user is signed into dtour (`dtour-session`) → pairing handshake mints a **per-device identity** (id + keypair). The raw session token is **not** the long-lived wire credential.
- **Short-lived, rotating, workspace-scoped tokens** on the WSS connection.
- **Approval tiers (copy Codex):** auto read/edit/run **inside the chosen workspace**; **require explicit approval** (surfaced in the dtour web UI) for actions outside the workspace, **network egress**, destructive ops, and **`git push`/credential use**. Default-deny outside the workspace envelope.
- **OS-sandbox enforcement** (`sandbox-exec`/Seatbelt on macOS; `bwrap`+seccomp if/when Linux) — scope is physically enforced, not just policy-checked.
- **Tamper-evident, append-only audit log** of every command, edit, network call, push, and approval (device id + token id + timestamp) shipped to the backend.
- **Treat all repo/file content as untrusted** (prompt-injection: a malicious repo telling the agent to exfiltrate keys is the live threat). Never auto-approve network egress.
- **Cloud-side trust note:** seeding a private repo into a third-party E2B sandbox means the user's private code lands on E2B — same trust posture as any cloud IDE, but surface it in consent at first cloud dispatch.

---

## 9. Fit with the existing codebase

This **extends**, not replaces:
- `services/coding-relay` — add session-attach, the local-agent connection class, and the dispatch/worktree-seed protocol alongside the existing E2B PTY path.
- `/coding/setup` — the stubbed **"self-host" backend** becomes the real **"Local (your machine)"** backend.
- `convex/coding.ts` ledger + `creditBalances` — reused for cloud metering; local execution is the user's own compute (no E2B charge) but still session-tracked.
- `convex/codingProviders*` — encrypted provider keys already exist; local agent uses the user's own keys/CLI auth, cloud uses the biller model.
- Existing **threads/workflows** model — the Session conversation reuses it; agentic subagents/workflows (M4) plug into the same workflow engine.
- New: `convex/sessions.ts` (Session model), a `services/relay` extension or sibling for local-agent connections, and a distributable **dtour-agent** (macOS first; Linux/Windows later).

---

## 10. Milestone decomposition (order finalized in the plan)

- **M0 — Portable Session model (Convex):** schema, thread linkage, backend pointer, env spec, snapshot pointer. Foundation for everything.
- **M1 — Local agent backend:** dtour-agent daemon (LaunchAgent, pairing, outbound WSS, keep-awake, workspace-scoped exec + OS sandbox, git push), wired as the "Local" backend. Riskiest/slowest (also: code-signing/notarization for distribution).
- **M2 — Session-attached cloud sandboxes + desktop→cloud dispatch:** worktree seeding, per-repo tooling, reprovision-from-history. Mostly on existing infra → fastest visible proof of the vision.
- **M3 — Handoff:** "Work locally"/"Transfer to local"/"Send to cloud" with checkpoint-and-reconstruct (git) + Convex thread continuity + re-warm UX.
- **M4 — Agentic UI:** subagents/workflows running in the active backend, plan/diff/approval, proof-of-work, parallel sessions.
- **Shared shell** (Monaco + file tree + chat/plan) built incrementally alongside M1/M2.

**Sequencing lean (to confirm in writing-plans):** M0 first (spine, prerequisite for all). Then strong case for **M2 before M1** — it demos the founder's vision soonest on existing E2B infra and de-risks the Session model before the hard daemon work, while the local agent (M1) lands right after. The founder led with "local," so M1 is a fast-follow, not a deferral.

---

## 11. Error handling & edge cases

- **Local agent offline / Mac asleep:** session falls back to `detached`; dispatch offers cloud instead; clear "your machine is unreachable" state.
- **Handoff mid-job:** checkpoint (commit/stash + flush turn) before swap; if checkpoint fails, block the swap and surface why (never lose work).
- **Merge/branch drift:** session branch diverges from base → surface a rebase/merge prompt rather than silently overwriting.
- **Working-changes patch conflicts** on the target backend → present the conflict, don't auto-resolve.
- **Credit exhaustion (cloud):** existing `canStart` gate; mid-session debit failure handled idempotently (existing `recordSession` pattern).
- **Token expiry on the wire:** rotate transparently; on hard auth failure, drop to `detached` and require re-pair.

## 12. Testing strategy

- **Session model:** unit tests for state transitions (`detached`↔`local`↔`cloud`), invariant "history never lost on reprovision."
- **Handoff:** equivalence tests — after a round-trip handoff, working tree + chat thread are identical; in-flight checkpoint is preserved.
- **Local agent:** sandbox-scope tests (writes outside workspace are denied at the OS layer, not just policy); pairing/token-rotation tests; keep-awake assertion taken/released around jobs.
- **Security:** approval-tier tests (push/network/out-of-scope require approval); audit-log completeness.
- **Worktree seeding:** patch capture/apply fidelity incl. untracked files.
- Note: repo currently has no test runner wired (per CLAUDE.md) — standing up a minimal one is part of M0's plan.

## 13. Open questions / to verify before/in the plan

1. **E2B pause/resume** — what it persists (fs vs memory), latency, cost → decides §5 warm-resume design and any speed promise.
2. **Git transport for seeding** — dtour-hosted internal remote vs `git bundle`-over-WS vs user origin (§6.4).
3. **Agent in-RAM state** — confirm our agent turns are Convex-reconstructable; define the checkpoint contract for any long-running CLI agent.
4. **dtour-agent distribution** — macOS code-signing + notarization + an install flow that sets up the LaunchAgent without scaring Gatekeeper.
5. **Private-code-to-E2B consent** — exact first-dispatch consent copy.
