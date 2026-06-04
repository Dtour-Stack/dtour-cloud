# Self-hosting multi-tenant agent containers on DigitalOcean — architecture & cost/effort spec

**Status:** decision aid (NOT a committed build). Default remains: **proxy ElizaCloud's
API** (Detour's white-label model). This spec is the "break-glass" plan for if/when you
want a **sovereign / premium tier** that runs agent containers on your own infra.

**What you'd be replicating:** ElizaCloud's §17 stack — `container-control-plane`,
`operator`, `headscale` (mesh), `tunnel-proxy`, `vast-pyworker` (GPU). That is a real
multi-tenant container platform. This is the DigitalOcean equivalent.

---

## 1. The hard constraint that shapes everything: untrusted tenant code

A user's agent runs **their** character + **their** plugins = untrusted code on your
hosts. Soft (namespace) isolation is not enough; you need a **sandboxed container
runtime**. On DigitalOcean specifically:

| Runtime | Isolation | Works on DOKS? |
|---|---|---|
| `containerd` (default) | namespace only (soft) | ✅ default — **insufficient for untrusted code** |
| **gVisor** (`runsc`) | userspace kernel, syscall intercept; no nested-virt needed | ⚠️ **not native** (open feature request) — **self-install** via DaemonSet + `RuntimeClass` |
| Kata / Firecracker | microVM (hardware) | ❌ needs nested virt / bare-metal KVM — **DO droplets don't expose it** |

**Verdict: gVisor is the only viable sandbox on DOKS, and you self-manage it.** This is
the single biggest technical risk and it's load-bearing — design it in from day one, not
as a hardening pass.

---

## 2. Component architecture (DOKS)

```
 Detour dashboard ──"deploy agent"──▶ Detour control-plane (Convex action or small svc)
        │  ($DTOUR entitlement gate)            │  kube client / operator
        ▼                                       ▼
   per-agent subdomain                   K8s: Namespace(tenant) + Deployment(agent)
   agent-<id>.detour.ninja                 ├─ RuntimeClass: gvisor   (sandbox)
        │                                   ├─ ResourceQuota / LimitRange
   DO LB + ingress-nginx ──────────────▶    ├─ NetworkPolicy (deny x-tenant + egress allowlist)
                                            ├─ Secret (agent keys, per-tenant)
                                            ├─ PVC (DO block storage) — agent memory
                                            └─ image: DOCR/eliza-runtime:<ver>
 inference: serverless (DO Gradient / providers / ElizaCloud) — NOT self-run GPU by default
 metering: Prometheus → Convex → $DTOUR billing (holder rate only after the path supports it)
```

| # | Component | DO building block | Notes |
|---|---|---|---|
| 1 | Cluster | **DOKS** (free control plane) | general node pool + optional GPU pool (tainted) |
| 2 | Agent image | **DOCR** (registry) | one `@elizaos/core` (bun) image, parameterized per agent (character + plugins + env) |
| 3 | Control plane | Convex action **or** small Go/TS `detour-agent-operator` | on "deploy": create ns/Deployment/Service/quota/netpol/secret |
| 4 | **Sandbox** | **gVisor** `RuntimeClass` via DaemonSet | **mandatory** for untrusted plugins; `runsc` handler |
| 5 | Tenant isolation | Namespace-per-tenant + NetworkPolicy + ResourceQuota + RBAC | add **vCluster** if you need stronger logical isolation per customer |
| 6 | Reachability | DO LB + **ingress-nginx**, per-agent subdomain | inbound webhooks (Discord/X) via a gateway svc; optional Tailscale/headscale mesh for admin/agent-to-agent |
| 7 | Idle cost control | **KEDA / Knative scale-to-zero** | critical — don't pay for idle agent pods; cold-start tradeoff |
| 8 | Inference | **serverless** (DO Gradient serverless inference / OpenAI/Anthropic/ElizaCloud, BYO keys) | **avoid running idle GPUs**; only add a GPU pool for self-hosted open models |
| 9 | State | DO Block Storage (PVC) + Convex/Postgres + DO Spaces (artifacts) | per-agent memory + assets |
| 10 | Secrets | external-secrets / sealed-secrets + KMS | per-tenant; never bake into images |
| 11 | Metering/billing | Prometheus (CPU/mem/GPU-sec/req) → Convex → $DTOUR | mirrors ElizaCloud `cron/container-billing`; apply holder rates only after the charge path enforces them |
| 12 | Observability | Prometheus + Grafana + Loki + traces | per-tenant dashboards |
| 13 | Security | Pod Security "restricted", egress allowlist, image scanning, signed images | gVisor is the backstop, not the only layer |

---

## 3. Cost estimate (monthly, illustrative, 2026 DO pricing)

**No-GPU baseline (inference stays serverless) — the recommended shape:**

| Item | Spec | ~Cost/mo |
|---|---|---|
| DOKS worker nodes | 3× `s-4vcpu-8gb` (~$48/node) | **~$144** |
| Load balancer (ingress) | 1 regional | **~$15** |
| Container registry (DOCR) | paid tier (>500 MiB free) | **~$5–20** |
| Block storage | per-agent PVCs, $0.10/GiB-mo | scales w/ agents |
| Bandwidth | $0.01/GiB overage (2 TB/node free) | usually negligible |
| **Infra baseline** | | **~$170–250/mo**, scales with node count |

**If you self-host model inference (GPU) — usually DON'T:**

| GPU | DO price | Always-on/mo |
|---|---|---|
| L40S | $1.57/GPU-hr | **~$1,130** |
| H100 | $3.39/GPU-hr (≈$3.00 single-card config) | **~$2,440** |

→ A single always-on GPU dwarfs the entire CPU platform. **Keep inference serverless**
unless you have a concrete open-model reason; even then, batch/scale-to-zero the GPU pool.

**The real cost is engineering, not infra.**

---

## 4. Effort estimate

| Phase | Scope | Effort (1–2 strong platform/devops eng) |
|---|---|---|
| **0 — Spike** | DOKS up, 1 eliza agent container, **gVisor RuntimeClass POC**, ingress, one subdomain | **1–2 weeks** |
| **1 — MVP multi-tenant** | operator/control-plane, ns-per-tenant, quotas, NetworkPolicy, per-tenant secrets, per-agent ingress, basic metering, scale-to-zero | **4–8 weeks** |
| **2 — Harden & scale** | autoscaling, gateways (Discord/webhook), observability, **$DTOUR billing integration**, security hardening, optional GPU pool, SLOs/on-call | **8–12 weeks** |
| **Total to ElizaCloud-core parity** | | **~3–6 months** + ongoing ops/on-call |

You also take on **security liability** for running untrusted code, and **24/7 ops** for
a system people's paid agents depend on.

---

## 5. Build vs. proxy — the decision

**Proxy ElizaCloud (status quo, recommended) when:** focus is product / distribution /
the $DTOUR economy; small team; you want zero infra liability and zero ops. You pay
ElizaCloud usage and keep your discount mechanism. **This is Detour today.**

**Self-host on DOKS when ALL of these hold:** (a) agent **volume** is high enough that the
ElizaCloud margin you'd save > (infra + 3–6 eng-months + ongoing ops); (b) you have
**platform-eng capacity** to own gVisor, autoscaling, billing, and on-call; (c) there's a
**differentiator** ElizaCloud can't give — sovereignty, data residency, a sovereign/TEE
tier (cf. the iExec × elizaOS confidential-compute PoC).

**If you build it:** make it a **separate premium/sovereign tier**, not a replacement for
the proxy. Two non-negotiables: **gVisor sandboxing** (untrusted code) and **serverless
inference** (no idle GPUs). Reuse what you already have — your Convex **"lightweight
agents" (persona+model, no container)** cover the simple cases for free; reserve real
containers (proxied **or** self-hosted) for agents that genuinely need a running process.

### Break-even intuition
Self-hosting wins only past a volume where `agents × hrs × ElizaCloud_margin_per_hr`
clears `~$200/mo infra + amortized 3–6 eng-months + ops`. Below that, proxying is
strictly cheaper and lower-risk. Model your expected agent-hours before committing.

---

## Sources
- DOKS / pricing: digitalocean.com/products/kubernetes · /pricing/kubernetes · App Platform vs DOKS vs Droplets (DO community)
- GPU Droplets: digitalocean.com/pricing/gpu-droplets (H100 ~$3.39/GPU-hr, L40S ~$1.57/GPU-hr)
- Registry / LB / bandwidth: /pricing/container-registry · /products/networking/load-balancers (regional LB $15/mo) · bandwidth $0.01/GiB
- Sandboxing: DOKS "Support for custom sandbox runtimes (gVisor)" idea (not native); gVisor needs no nested virt, Kata/Firecracker do
- DO Gradient AI Platform (Python ADK, serverless inference) — their own agent product, NOT a drop-in for elizaOS TS containers
- elizaOS deploy targets (local / Docker / Eliza Cloud / own infra); iExec × elizaOS TEE PoC
