import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Single-use SIWS nonces (server-issued, short-lived) for replay protection.
  nonces: defineTable({
    nonce: v.string(),
    expiresAt: v.number(),
    used: v.boolean(),
  }).index("by_nonce", ["nonce"]),

  // Wallet identities that signed in through the Solana wallet gate.
  users: defineTable({
    pubkey: v.string(),
    balance: v.number(),
    lastLoginAt: v.number(),
    // Billing entitlement. "lifetime" = unlimited usage, never billed. Absent = standard.
    plan: v.optional(v.literal("lifetime")),
    creatorRewardsEligible: v.optional(v.boolean()),
  }).index("by_pubkey", ["pubkey"]),

  // Access sessions issued after a successful gate.
  sessions: defineTable({
    token: v.string(),
    pubkey: v.string(),
    expiresAt: v.number(),
  }).index("by_token", ["token"]),

  // Prospective users and tester applicants; deduped by email.
  waitlist: defineTable({
    email: v.string(),
    pubkey: v.optional(v.string()), // wallet they had connected, if any
    kind: v.optional(v.union(v.literal("early_access"), v.literal("dev_tester"))),
    name: v.optional(v.string()),
    reason: v.optional(v.string()),
    at: v.number(),
  }).index("by_email", ["email"]),

  // Elevated wallet roles for beta/admin access.
  whitelist: defineTable({
    pubkey: v.string(),
    role: v.optional(
      v.union(v.literal("super_admin"), v.literal("admin"), v.literal("dev_tester")),
    ),
    note: v.optional(v.string()),
    addedAt: v.number(),
  }).index("by_pubkey", ["pubkey"]),

  // Post-login profile: chosen username + linked email + optional extras.
  profiles: defineTable({
    pubkey: v.string(),
    username: v.string(),
    email: v.string(),
    avatarUrl: v.optional(v.string()),
    // "Swerve" status tags (admin-assigned for now), e.g. ["Founder"].
    swerveTags: v.optional(v.array(v.string())),
    socials: v.optional(
      v.object({
        x: v.optional(v.string()),
        discord: v.optional(v.string()),
        telegram: v.optional(v.string()),
        website: v.optional(v.string()),
        github: v.optional(v.string()),
      }),
    ),
    // Linked agents — stored now, functional linking comes in the builders phase.
    agents: v.optional(
      v.array(
        v.object({
          label: v.string(),
          wallet: v.optional(v.string()),
          x402Url: v.optional(v.string()),
        }),
      ),
    ),
  })
    .index("by_pubkey", ["pubkey"])
    .index("by_username", ["username"]),

  // Editable cloud config (key/value, set by admins, read app-wide).
  config: defineTable({
    key: v.string(),
    value: v.string(), // JSON-encoded
    type: v.string(), // "string" | "number" | "boolean" | "list"
    category: v.string(),
    description: v.optional(v.string()),
    public: v.boolean(), // safe for the app to read without auth
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  // Feature flags (toggled by admins, read app-wide).
  featureFlags: defineTable({
    key: v.string(),
    enabled: v.boolean(),
    description: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  // Lightweight agents — persona + model, no container; inference on-demand
  // while the owner is online. type: "lightweight" | "cloud" | "endpoint".
  agents: defineTable({
    owner: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    systemPrompt: v.string(),
    model: v.string(),
    type: v.string(),
    endpointUrl: v.optional(v.string()),
    createdAt: v.number(),
    // Attached elizaOS plugin ids (e.g. "plugin-discord"). Optional/back-compat.
    plugins: v.optional(v.array(v.string())),
    // "My Apps" monetization — publish an agent at a price.
    published: v.optional(v.boolean()),
    priceUsd: v.optional(v.number()),
  }).index("by_owner", ["owner"]),

  // MCP servers a user has connected (the catalog lives in code).
  mcpConnections: defineTable({
    pubkey: v.string(),
    mcp: v.string(), // catalog id, e.g. "web-search"
    at: v.number(),
  }).index("by_pubkey", ["pubkey"]),

  // Per-agent chat sessions — maps dtour chat id → @convex-dev/agent thread.
  agentChats: defineTable({
    agentId: v.id("agents"),
    owner: v.string(),
    title: v.string(),
    /** Component thread id (`components.agent`). Backfilled on first open. */
    threadId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_agent_owner", ["agentId", "owner"]),

  // Co-work panel traces keyed by durable-agent message id (not dtour chat id).
  agentTurnTraces: defineTable({
    messageId: v.string(),
    trace: v.string(),
  }).index("by_message", ["messageId"]),

  // Vision attachments for user turns (component message id).
  agentMessageExtras: defineTable({
    messageId: v.string(),
    imageUrl: v.optional(v.string()),
  }).index("by_message", ["messageId"]),

  /** @deprecated Legacy chat rows — read-only fallback until threads are backfilled. */
  agentMessages: defineTable({
    agentId: v.id("agents"),
    owner: v.string(),
    chatId: v.optional(v.id("agentChats")),
    role: v.string(),
    content: v.string(),
    imageUrl: v.optional(v.string()),
    trace: v.optional(v.string()),
    at: v.number(),
  })
    .index("by_agent", ["agentId"])
    .index("by_agent_owner", ["agentId", "owner"])
    .index("by_chat", ["chatId"]),

  // User inbox — admin/system messages + push notifications.
  messages: defineTable({
    to: v.string(), // recipient pubkey
    fromRole: v.string(), // "admin" | "system"
    fromPubkey: v.optional(v.string()),
    subject: v.optional(v.string()),
    body: v.string(),
    push: v.boolean(),
    read: v.boolean(),
    at: v.number(),
  })
    .index("by_to", ["to"])
    .index("by_to_read", ["to", "read"]),

  adminAssistantThreads: defineTable({
    owner: v.string(),
    title: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_owner", ["owner"]),

  adminAssistantMessages: defineTable({
    threadId: v.id("adminAssistantThreads"),
    owner: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    workflow: v.optional(v.string()),
    status: v.optional(
      v.union(v.literal("pending"), v.literal("complete"), v.literal("failed")),
    ),
    at: v.number(),
  })
    .index("by_thread", ["threadId"])
    .index("by_owner", ["owner"]),

  testerOutreach: defineTable({
    email: v.string(),
    pubkey: v.optional(v.string()),
    adminPubkey: v.string(),
    subject: v.string(),
    body: v.string(),
    html: v.optional(v.string()),
    status: v.union(
      v.literal("drafted"),
      v.literal("sent"),
      v.literal("failed"),
      v.literal("received"),
      v.literal("scored"),
    ),
    agentmailMessageId: v.optional(v.string()),
    agentmailThreadId: v.optional(v.string()),
    score: v.optional(v.number()),
    recommendation: v.optional(v.string()),
    replyText: v.optional(v.string()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_status", ["status"]),

  agentMailWebhookEvents: defineTable({
    eventId: v.string(),
    eventType: v.string(),
    email: v.optional(v.string()),
    inboxId: v.optional(v.string()),
    messageId: v.optional(v.string()),
    payload: v.string(),
    at: v.number(),
  })
    .index("by_event", ["eventId"])
    .index("by_email", ["email"]),

  // Analytics / admin debug log.
  events: defineTable({
    type: v.string(),
    pubkey: v.optional(v.string()),
    data: v.optional(v.string()),
    at: v.number(),
  })
    .index("by_type", ["type"])
    .index("by_at", ["at"]),

  // Design Studio documents — persisted canvas scenes + workflow graphs.
  // kind: "canvas" | "workflow"; data is the JSON-serialized state.
  designDocs: defineTable({
    owner: v.string(),
    kind: v.string(),
    name: v.string(),
    data: v.string(),
    updatedAt: v.number(),
  })
    .index("by_owner_kind", ["owner", "kind", "name"])
    .index("by_owner", ["owner"]),

  // Workflow execution runs — node-by-node status patched reactively.
  workflowRuns: defineTable({
    owner: v.string(),
    graph: v.string(), // JSON snapshot of the executed graph
    status: v.string(), // "running" | "done" | "error"
    nodes: v.string(), // JSON: Record<nodeId, { status, output?, error? }>
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_owner", ["owner"]),

  // Saved image assets (generated outputs or uploads) — bytes in Convex storage.
  assets: defineTable({
    owner: v.string(),
    storageId: v.id("_storage"),
    name: v.string(),
    contentType: v.string(),
    createdAt: v.number(),
  }).index("by_owner", ["owner"]),

  // User-saved workflow templates (JSON graph snapshots).
  workflowTemplates: defineTable({
    owner: v.string(),
    name: v.string(),
    graph: v.string(),
    createdAt: v.number(),
  }).index("by_owner", ["owner"]),

  // Single-doc tokenomics config (admin-editable). Pubkeys + bps only — NO keys.
  tokenomicsConfig: defineTable({
    splitBps: v.object({
      builder: v.number(),
      holders: v.number(),
      buyback: v.number(),
      treasury: v.number(),
    }),
    wallets: v.object({
      creator: v.string(),
      builder: v.string(),
      treasury: v.string(),
      buyback: v.string(),
    }),
    minBalanceTokens: v.number(), // ignore holders below this $DTOUR balance
    minPayoutSol: v.number(), // dust floor per holder payout
    creatorReserveSol: v.number(), // SOL kept in creator wallet (not split)
    // Owners removed from pro-rata beyond the 4 pool wallets (e.g. the LP pool
    // OWNER). Optional for backward-compat with rows saved before this field;
    // read code defaults it. The 4 pools are ALWAYS excluded in code regardless.
    excludeWallets: v.optional(v.array(v.string())),
    // Hard SOL cap per Execute run (sum of all distribute payouts must be ≤ this).
    // Optional for backward-compat; read code defaults it.
    perRunCapSol: v.optional(v.number()),
    // Branding memo attached to each distribute batch tx ("" = none). Optional
    // for backward-compat; read code defaults it.
    memo: v.optional(v.string()),
    // Inference pricing (admin-tunable). Basis points; read code defaults them
    // (1500 = +15% markup, 1000 = 10% holder discount) when absent. inference._charge
    // reads these directly off this row to price chat/image/speech/video.
    inferenceMarkupBps: v.optional(v.number()),
    inferenceHolderDiscountBps: v.optional(v.number()),
    updatedAt: v.number(),
  }),

  // Idempotency backbone for the holder-distribution Execute flow. Keyed by
  // (epoch, owner): records the attempted tx (sig + blockhash) BEFORE relay and
  // the confirmed result after, so a re-run NEVER double-pays. Mirrors the
  // attempted/paid manifest in scripts/tokenomics/distribute-to-holders.mjs.
  payoutLedger: defineTable({
    epoch: v.string(), // deterministic per-distribution id `${MINT}:${ts}`
    owner: v.string(), // recipient owner pubkey (pro-rata target)
    // STRING not number — Convex numbers are float64; mirror the script's
    // .toString() so u64 lamports never lose precision.
    lamports: v.string(),
    status: v.union(
      v.literal("planned"), // plan frozen at confirm, before any relay
      v.literal("attempted"), // sig recorded BEFORE relay (confirm-timeout safety)
      v.literal("paid"), // landed + confirmed (or reconciled landed)
      v.literal("failed"), // tx failed / blockhash expired → safe to retry
      v.literal("cancelled"), // never relayed; superseded by a newer run (terminal)
    ),
    signature: v.optional(v.string()), // shared across the batch tx
    recentBlockhash: v.optional(v.string()),
    lastValidBlockHeight: v.optional(v.number()), // for expiry "did not land"
    attemptedAt: v.optional(v.number()),
    confirmedAt: v.optional(v.number()),
    reconciled: v.optional(v.boolean()), // promoted to paid by reconcileEpoch
  })
    .index("by_epoch_owner", ["epoch", "owner"]) // idempotent upsert / per-owner
    .index("by_epoch", ["epoch"]) // ledgerForEpoch / plan freeze / resume
    .index("by_signature", ["signature"]) // reconcile a batch by its shared sig
    .index("by_status", ["status"]), // bounded status scans (cancelStalePlanned / incompleteEpochs)

  // USD-credit wallet for paid usage (coding sandboxes etc.). Money stored as
  // INTEGER micro-USD (1 USD = 1e6) — float64 is exact for integers ≪ 2^53, so
  // no precision loss. Topped up via $DTOUR (at top-up rate) or admin grant.
  creditBalances: defineTable({
    pubkey: v.string(),
    balanceMicroUsd: v.number(), // integer micro-USD
    updatedAt: v.number(),
  }).index("by_pubkey", ["pubkey"]),

  // Credit top-ups (idempotent by on-chain signature). Two assets land here:
  //   • $DTOUR — credited at the $DTOUR/USD rate captured AT verification time
  //     (volatility risk taken here); sets dtourAmount + priceUsd.
  //   • USDC   — credited 1:1 (USDC is $1, no oracle); sets usdcAmount.
  // `asset` is "DTOUR" | "USDC" (absent on legacy rows ⇒ read as "DTOUR").
  // dtourAmount/priceUsd are optional so USDC rows validate; usdMicro is the
  // common integer micro-USD credited regardless of asset.
  creditTopUps: defineTable({
    signature: v.string(), // the on-chain transfer tx (globally unique → dedup key)
    pubkey: v.string(), // payer (credited)
    asset: v.optional(v.string()), // "DTOUR" | "USDC" (absent ⇒ DTOUR)
    dtourAmount: v.optional(v.number()), // $DTOUR received by treasury (uiAmount)
    priceUsd: v.optional(v.number()), // $DTOUR/USD at verification
    usdcAmount: v.optional(v.number()), // USDC received by treasury (uiAmount)
    usdMicro: v.number(), // credits granted (integer micro-USD)
    at: v.number(),
  })
    .index("by_signature", ["signature"])
    .index("by_pubkey", ["pubkey"]),

  // Per-session coding-sandbox usage ledger — the accuracy record. Stores the
  // metered E2B cost AND the price charged (cost × markup × holder-discount).
  codingUsage: defineTable({
    pubkey: v.string(),
    sandboxId: v.string(),
    startedAt: v.number(),
    endedAt: v.number(),
    durationSec: v.number(),
    vcpu: v.number(),
    ramGiB: v.number(),
    costMicroUsd: v.number(), // raw E2B cost (what we pay)
    priceMicroUsd: v.number(), // what the user was charged
    holderDiscount: v.boolean(),
    at: v.number(),
  })
    .index("by_pubkey", ["pubkey"])
    .index("by_sandbox", ["sandboxId"]),

  // Saved coding-sandbox workspace archives (tar.gz in Convex storage).
  codingWorkspaces: defineTable({
    pubkey: v.string(),
    name: v.string(),
    sandboxId: v.optional(v.string()),
    storageId: v.id("_storage"),
    sizeBytes: v.number(),
    priceMicroUsd: v.number(),
    at: v.number(),
  })
    .index("by_pubkey", ["pubkey"])
    .index("by_storage", ["storageId"]),

  // Per-call inference usage ledger (chat/media). Keyed by refId for idempotency
  // (one charge per logical call) — mirrors codingUsage. Stores metered gateway
  // cost AND price charged (cost × (1+markup) × holder-discount).
  inferenceUsage: defineTable({
    pubkey: v.string(),
    refId: v.string(), // stable per-call id (e.g. assistant message id) — dedup key
    surface: v.string(), // "chat" | "image" | "video" | "tts" | "workflow"
    model: v.string(),
    promptTokens: v.optional(v.number()),
    completionTokens: v.optional(v.number()),
    costMicroUsd: v.number(), // raw gateway cost (what we pay)
    priceMicroUsd: v.number(), // what the user was charged
    holderDiscount: v.boolean(),
    // freetour: routed to a free OpenRouter model → $0, counts toward the daily cap.
    free: v.optional(v.boolean()),
    serviceTier: v.optional(v.string()),
    servedServiceTier: v.optional(v.string()),
    /** A/B bucket: eliza_first | openrouter_first (paid chat only). */
    routeVariant: v.optional(v.string()),
    /** Winning gateway: elizacloud | openrouter | freetour. */
    gateway: v.optional(v.string()),
    /** True when the primary gateway failed and the secondary succeeded. */
    fallbackUsed: v.optional(v.boolean()),
    at: v.number(),
  })
    .index("by_pubkey", ["pubkey"])
    .index("by_ref", ["refId"]),

  // freetour per-user daily counter — OpenRouter's free-tier caps are account-wide
  // on our single org key, so we meter free usage per user to keep it fair. One row
  // per (pubkey, UTC day); `count` increments per free inference call.
  freetourUsage: defineTable({
    pubkey: v.string(),
    day: v.string(), // UTC yyyy-mm-dd
    count: v.number(),
    updatedAt: v.number(),
  }).index("by_pubkey_day", ["pubkey", "day"]),

  // Cached OpenRouter model price catalog (per-token rates) — refreshed on demand
  // so inference metering doesn't refetch the full list every call. Single row.
  openrouterPrices: defineTable({
    json: v.string(), // JSON: Record<modelId, { prompt: number, completion: number }> (USD/token)
    fetchedAt: v.number(),
  }),

  openrouterKeyStatus: defineTable({
    json: v.string(),
    fetchedAt: v.number(),
  }),

  // Programmatic API keys (for the ElizaCloud proxy + dtour API). Only a HASH of
  // the secret is stored — the plaintext is shown once at creation. `prefix` is
  // the public, non-secret leading segment used to look a key up before hashing.
  apiKeys: defineTable({
    pubkey: v.string(), // owner
    label: v.string(),
    keyHash: v.string(), // hash of the full secret (never the plaintext)
    prefix: v.string(), // public lookup prefix, e.g. "dt_live_AbCd"
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    revoked: v.optional(v.boolean()),
  })
    .index("by_pubkey", ["pubkey"])
    .index("by_prefix", ["prefix"]),

  // Affiliate program: one record per affiliate. `code` is their public referral
  // code; `shareBps` is their revenue-share in basis points (1% = 100 bps).
  affiliates: defineTable({
    pubkey: v.string(), // the affiliate
    code: v.string(), // public referral code
    shareBps: v.number(), // revenue share, basis points
    createdAt: v.number(),
    // $ELIZA payout destination (mirrors ElizaCloud: withdraw to EVM or Solana).
    payoutNetwork: v.optional(v.string()), // "ethereum" | "base" | "solana"
    payoutAddress: v.optional(v.string()),
  })
    .index("by_pubkey", ["pubkey"])
    .index("by_code", ["code"]),

  // Referral attribution: links a referred wallet to the affiliate code (and the
  // referrer who owns it) that brought them in.
  referrals: defineTable({
    referredPubkey: v.string(), // the new/referred wallet
    code: v.string(), // affiliate code used
    referrerPubkey: v.string(), // the affiliate who owns the code
    at: v.number(),
  })
    .index("by_referred", ["referredPubkey"])
    .index("by_referrer", ["referrerPubkey"])
    .index("by_code", ["code"]),

  // Affiliate payout ledger. Money stored as INTEGER micro-USD (1 USD = 1e6) —
  // float64 is exact for integers ≪ 2^53, so no precision loss. `status` is a
  // free-form string (e.g. "pending" | "paid" | "failed").
  affiliatePayouts: defineTable({
    pubkey: v.string(), // affiliate being paid
    amountMicroUsd: v.number(), // integer micro-USD value at request time
    status: v.string(),
    at: v.number(),
    // Paid out as $ELIZA to an EVM/Solana wallet (mirrors ElizaCloud redemption).
    network: v.optional(v.string()),
    address: v.optional(v.string()),
    amountEliza: v.optional(v.number()), // $ELIZA tokens at request-time price
    elizaPriceUsd: v.optional(v.number()),
  }).index("by_pubkey", ["pubkey"]),

  // Per-user API keys for coding agents (OpenRouter / OpenAI Codex / Anthropic / Pi).
  // Ciphertext only — decrypted in Node actions for the E2B relay bootstrap.
  codingProviderSecrets: defineTable({
    pubkey: v.string(),
    provider: v.string(), // openrouter | openai | anthropic
    ciphertext: v.string(),
    iv: v.string(),
    prefix: v.string(), // public hint, e.g. sk-or-v1
    updatedAt: v.number(),
  })
    .index("by_pubkey", ["pubkey"])
    .index("by_pubkey_provider", ["pubkey", "provider"]),
});
