import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Single-use SIWS nonces (server-issued, short-lived) for replay protection.
  nonces: defineTable({
    nonce: v.string(),
    expiresAt: v.number(),
    used: v.boolean(),
  }).index("by_nonce", ["nonce"]),

  // Wallet identities that passed the $DTOUR gate.
  users: defineTable({
    pubkey: v.string(),
    balance: v.number(),
    lastLoginAt: v.number(),
    // Billing entitlement. "lifetime" = unlimited usage, never billed. Absent = standard.
    plan: v.optional(v.literal("lifetime")),
  }).index("by_pubkey", ["pubkey"]),

  // Access sessions issued after a successful gate.
  sessions: defineTable({
    token: v.string(),
    pubkey: v.string(),
    expiresAt: v.number(),
  }).index("by_token", ["token"]),

  // Prospective users who want in but don't hold $DTOUR / aren't whitelisted.
  // Captured at the gate; deduped by email.
  waitlist: defineTable({
    email: v.string(),
    pubkey: v.optional(v.string()), // wallet they had connected, if any
    at: v.number(),
  }).index("by_email", ["email"]),

  // Wallets that always pass the gate regardless of $DTOUR balance.
  // An optional admin role lives here (admins must be whitelisted).
  whitelist: defineTable({
    pubkey: v.string(),
    role: v.optional(
      v.union(v.literal("super_admin"), v.literal("admin")),
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
  }).index("by_owner", ["owner"]),

  agentMessages: defineTable({
    agentId: v.id("agents"),
    owner: v.string(),
    role: v.string(), // "user" | "assistant"
    content: v.string(),
    at: v.number(),
  }).index("by_agent", ["agentId"]),

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
  }).index("by_owner_kind", ["owner", "kind", "name"]),

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
    updatedAt: v.number(),
  }),
});
