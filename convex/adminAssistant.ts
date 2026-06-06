import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { buildAdminHealthPacket, type AdminHealthPacket } from "./adminHealth";
import { logEvent } from "./events";
import { requireRole } from "./rbac";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AGENTMAIL_BASE_URL = "https://api.agentmail.to/v0";

const WORKFLOWS = [
  {
    id: "tester_triage",
    label: "Tester triage",
    prompt:
      "Review the pending tester applications. Call out who needs a follow-up, who looks promising, and who is too vague.",
  },
  {
    id: "admin_data",
    label: "Admin data Q&A",
    prompt:
      "Summarize the current admin data snapshot and identify the highest-priority operational issues.",
  },
  {
    id: "convex_backend",
    label: "Convex backend map",
    prompt:
      "Explain the current Convex backend, auth gate, roles, admin functions, and where applicant data flows.",
  },
  {
    id: "login_chat_triage",
    label: "Login/chat triage",
    prompt:
      "Triage the most likely login, token gate, chat, and inference issues using the current backend and recent events.",
  },
  {
    id: "admin_health_packet",
    label: "Health packet",
    prompt:
      "Review the admin health packet. Report platform health, user behavior, common failures, billing correctness, risky flags, and recommended admin actions.",
  },
] as const;

const BACKEND_KNOWLEDGE = [
  {
    area: "auth gate",
    detail:
      "/login calls auth.getNonce, signs SIWS, then gate.verify checks $DTOUR or whitelist and issues dtour-session.",
  },
  {
    area: "roles",
    detail:
      "whitelist.role controls super_admin, admin, and dev_tester. Admin surfaces require requireRole(ctx, token, 'admin').",
  },
  {
    area: "tester access",
    detail:
      "waitlist.applyTester stores dev_tester applications; waitlist.approveTester grants dev_tester and creator rewards eligibility.",
  },
  {
    area: "admin data",
    detail:
      "admin.users, admin.members, events.recent, flags, config, tokenomics, and waitlist.list are the primary admin read surfaces.",
  },
  {
    area: "chat",
    detail:
      "user agent chat stores threads in @convex-dev/agent; Admin Detour stores its own adminAssistantThreads and adminAssistantMessages.",
  },
  {
    area: "inference",
    detail:
      "inference.runChat routes through OpenRouter/ElizaCloud with usage ledger rows keyed by refId.",
  },
  {
    area: "admin health packet",
    detail:
      "adminHealth.packet exports recent events, usage ledgers, table/anomaly counts, tester/waitlist rows, and provider/fallback health without secrets.",
  },
  {
    area: "AgentMail",
    detail:
      "AgentMail follow-ups send from AGENTMAIL_INBOX_ID with AGENTMAIL_API_KEY; inbound replies arrive at /agentmail/webhook.",
  },
] as const;

function cleanEmail(email: string): string {
  const clean = email.trim().toLowerCase();
  if (!EMAIL_RE.test(clean)) throw new Error("Enter a valid email address");
  return clean;
}

function htmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function bodyToHtml(body: string): string {
  return `<div>${htmlEscape(body).replaceAll("\n", "<br />")}</div>`;
}

function preview(value: string, max = 180): string {
  const flat = value.trim().replace(/\s+/g, " ");
  return flat.length > max ? `${flat.slice(0, max)}...` : flat;
}

function parseDraft(text: string) {
  const subject = text.match(/SUBJECT:\s*(.+)/i)?.[1]?.trim();
  const bodyMatch = text.match(/BODY:\s*([\s\S]+)/i);
  const body = bodyMatch?.[1]?.trim();
  if (!subject || !body) throw new Error("Draft response was missing SUBJECT/BODY");
  return { subject, body };
}

function parseScore(text: string) {
  const scoreRaw = text.match(/SCORE:\s*(\d{1,3})/i)?.[1];
  if (!scoreRaw) throw new Error("Score response was missing SCORE");
  const score = Math.max(0, Math.min(100, Number(scoreRaw)));
  const recommendation =
    text.match(/RECOMMENDATION:\s*(approve|deny|hold)/i)?.[1]?.toLowerCase() ??
    "hold";
  return { score, recommendation };
}

function compactHealthPacket(packet: AdminHealthPacket) {
  return {
    generatedAt: packet.generatedAt,
    eventExports: {
      last24hCount: packet.eventExports.last24h.length,
      last7dCount: packet.eventExports.last7d.length,
      last7dTruncated: packet.eventExports.last7dTruncated,
      byType24h: packet.eventExports.byType24h,
      byType7d: packet.eventExports.byType7d,
      recent24h: packet.eventExports.last24h.slice(0, 60),
      recent7d: packet.eventExports.last7d.slice(0, 60),
    },
    convexFunctionLogs: packet.convexFunctionLogs,
    usageLedgerAggregates: packet.usageLedgerAggregates,
    tableCounts: packet.tableCounts,
    anomalyCounts: packet.anomalyCounts,
    testerWaitlistRows: packet.testerWaitlistRows,
    providerHealth: packet.providerHealth,
  };
}

function buildSystemPrompt(context: unknown): string {
  return [
    "You are Admin Detour, the Detour Cloud admin assistant.",
    "You help admins inspect admin data, tester applications, admin workflows, and Convex backend behavior.",
    "Be picky with tester applicants. Reward concrete build/test plans, useful technical taste, fast feedback loops, and alignment with creator rewards. Penalize vague, entitled, or low-effort answers.",
    "You can recommend and draft actions, but do not claim an approval, denial, config change, email send, deploy, or payment happened unless a tool result in the conversation says it happened.",
    "Do not reveal secrets, raw tokens, private keys, API keys, or signing secrets. Discuss environment readiness only as configured/missing.",
    "Use terse Detour voice: technical, direct, a little scenic, no corporate filler.",
    `Current admin context:\n${JSON.stringify(context, null, 2)}`,
  ].join("\n\n");
}

export const overview = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const context = await requireAdminContext(ctx, token);
    return {
      workflows: WORKFLOWS,
      backendKnowledge: BACKEND_KNOWLEDGE,
      counts: context.counts,
      testerApplications: context.testerApplications,
      latestOutreach: context.latestOutreach,
      recentEvents: context.recentEvents,
    };
  },
});

export const threads = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const caller = await requireRole(ctx, token, "admin");
    const rows = await ctx.db
      .query("adminAssistantThreads")
      .withIndex("by_owner", (q) => q.eq("owner", caller.pubkey))
      .collect();
    return rows
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((row) => ({
        id: row._id,
        title: row.title,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));
  },
});

export const currentThread = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const caller = await requireRole(ctx, token, "admin");
    const rows = await ctx.db
      .query("adminAssistantThreads")
      .withIndex("by_owner", (q) => q.eq("owner", caller.pubkey))
      .collect();
    const row = rows.sort((a, b) => b.updatedAt - a.updatedAt)[0];
    return row
      ? {
          id: row._id,
          title: row.title,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }
      : null;
  },
});

export const createThread = mutation({
  args: { token: v.string(), title: v.optional(v.string()) },
  handler: async (ctx, { token, title }) => {
    const caller = await requireRole(ctx, token, "admin");
    const now = Date.now();
    const threadId = await ctx.db.insert("adminAssistantThreads", {
      owner: caller.pubkey,
      title: title?.trim() || "Admin Detour",
      createdAt: now,
      updatedAt: now,
    });
    await logEvent(ctx, "adminAssistant.thread.create", {
      pubkey: caller.pubkey,
      data: { threadId },
    });
    return { threadId };
  },
});

export const deleteThread = mutation({
  args: { token: v.string(), threadId: v.id("adminAssistantThreads") },
  handler: async (ctx, { token, threadId }) => {
    const caller = await requireRole(ctx, token, "admin");
    const thread = await ctx.db.get(threadId);
    if (!thread || thread.owner !== caller.pubkey) throw new Error("Thread not found");
    const messages = await ctx.db
      .query("adminAssistantMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .collect();
    for (const message of messages) await ctx.db.delete(message._id);
    await ctx.db.delete(threadId);
    await logEvent(ctx, "adminAssistant.thread.delete", {
      pubkey: caller.pubkey,
      data: { threadId },
    });
    return { ok: true };
  },
});

export const messages = query({
  args: { token: v.string(), threadId: v.id("adminAssistantThreads") },
  handler: async (ctx, { token, threadId }) => {
    const caller = await requireRole(ctx, token, "admin");
    const thread = await ctx.db.get(threadId);
    if (!thread || thread.owner !== caller.pubkey) return [];
    const rows = await ctx.db
      .query("adminAssistantMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .collect();
    return rows
      .sort((a, b) => a.at - b.at)
      .map((row) => ({
        id: row._id,
        role: row.role,
        content: row.content,
        workflow: row.workflow ?? null,
        status: row.status ?? "complete",
        at: row.at,
      }));
  },
});

export const sendMessage = action({
  args: {
    token: v.string(),
    threadId: v.optional(v.id("adminAssistantThreads")),
    message: v.string(),
    workflow: v.optional(v.string()),
  },
  handler: async (ctx, { token, threadId, message, workflow }) => {
    const trimmed = message.trim();
    if (!trimmed) throw new Error("Message is required");
    const adminContext = await ctx.runQuery(internal.adminAssistant.adminContext, {
      token,
    });
    const thread = await ctx.runMutation(internal.adminAssistant.ensureThread, {
      owner: adminContext.caller.pubkey,
      threadId,
    });
    await ctx.runMutation(internal.adminAssistant.insertMessage, {
      owner: adminContext.caller.pubkey,
      threadId: thread.threadId,
      role: "user",
      content: trimmed,
      workflow,
      status: "complete",
    });
    const history = await ctx.runQuery(internal.adminAssistant.historyForInference, {
      owner: adminContext.caller.pubkey,
      threadId: thread.threadId,
      limit: 16,
    });
    const assistantId = await ctx.runMutation(internal.adminAssistant.insertMessage, {
      owner: adminContext.caller.pubkey,
      threadId: thread.threadId,
      role: "assistant",
      content: "",
      workflow,
      status: "pending",
    });
    try {
      const result = await ctx.runAction(api.inference.runChat, {
        token,
        model: "openrouter/auto",
        messages: [
          { role: "system", content: buildSystemPrompt(adminContext) },
          ...history,
        ],
        refId: String(assistantId),
      });
      await ctx.runMutation(internal.adminAssistant.updateMessage, {
        owner: adminContext.caller.pubkey,
        messageId: assistantId,
        content: result.text,
        status: "complete",
      });
      return { threadId: thread.threadId, messageId: assistantId, text: result.text };
    } catch (e) {
      const error = e instanceof Error ? e.message : "Admin Detour failed";
      await ctx.runMutation(internal.adminAssistant.updateMessage, {
        owner: adminContext.caller.pubkey,
        messageId: assistantId,
        content: error,
        status: "failed",
      });
      throw new Error(error);
    }
  },
});

export const draftTesterFollowUp = action({
  args: { token: v.string(), email: v.string() },
  handler: async (ctx, { token, email }) => {
    const clean = cleanEmail(email);
    const adminContext = await ctx.runQuery(internal.adminAssistant.adminContext, {
      token,
    });
    const application = await ctx.runQuery(
      internal.adminAssistant.testerApplicationByEmail,
      { token, email: clean },
    );
    if (!application) throw new Error("Tester application not found");
    const result = await ctx.runAction(api.inference.runChat, {
      token,
      model: "openrouter/auto",
      messages: [
        { role: "system", content: buildSystemPrompt(adminContext) },
        {
          role: "user",
          content: [
            "Draft a short email from Admin Detour to this tester applicant.",
            "The email must ask why they deserve to be an early tester/dev and request concrete proof: what they will test, what they can build, and how fast they can report issues.",
            "Be selective, direct, and friendly. Do not approve them in the email.",
            "Return exactly:\nSUBJECT: ...\nBODY: ...",
            `Application:\n${JSON.stringify(application, null, 2)}`,
          ].join("\n\n"),
        },
      ],
      refId: `admin-draft:${clean}:${Date.now()}`,
    });
    const draft = parseDraft(result.text);
    const outreachId = await ctx.runMutation(internal.adminAssistant.recordOutreachDraft, {
      email: clean,
      pubkey: application.pubkey ?? undefined,
      adminPubkey: adminContext.caller.pubkey,
      subject: draft.subject,
      body: draft.body,
      html: bodyToHtml(draft.body),
    });
    return { outreachId, ...draft };
  },
});

export const sendTesterFollowUp = action({
  args: {
    token: v.string(),
    email: v.string(),
    subject: v.string(),
    body: v.string(),
    outreachId: v.optional(v.id("testerOutreach")),
  },
  handler: async (ctx, { token, email, subject, body, outreachId }) => {
    const clean = cleanEmail(email);
    const adminContext = await ctx.runQuery(internal.adminAssistant.adminContext, {
      token,
    });
    const apiKey = process.env.AGENTMAIL_API_KEY;
    const inboxId = process.env.AGENTMAIL_INBOX_ID ?? process.env.AGENTMAIL_FROM_INBOX_ID;
    if (!apiKey || !inboxId) {
      await ctx.runMutation(internal.adminAssistant.markOutreachFailed, {
        outreachId,
        email: clean,
        adminPubkey: adminContext.caller.pubkey,
        subject,
        body,
        error: "AgentMail is not configured",
      });
      throw new Error("AgentMail is not configured");
    }
    const baseUrl = (process.env.AGENTMAIL_BASE_URL ?? AGENTMAIL_BASE_URL).replace(/\/$/, "");
    const res = await fetch(
      `${baseUrl}/inboxes/${encodeURIComponent(inboxId)}/messages/send`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          to: clean,
          subject,
          text: body,
          html: bodyToHtml(body),
          labels: ["detour", "tester-application", "follow-up"],
        }),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const error = `AgentMail send failed (${res.status}): ${text.slice(0, 180)}`;
      await ctx.runMutation(internal.adminAssistant.markOutreachFailed, {
        outreachId,
        email: clean,
        adminPubkey: adminContext.caller.pubkey,
        subject,
        body,
        error,
      });
      throw new Error(error);
    }
    const json = (await res.json()) as {
      message_id?: string;
      thread_id?: string;
    };
    const savedId = await ctx.runMutation(internal.adminAssistant.markOutreachSent, {
      outreachId,
      email: clean,
      adminPubkey: adminContext.caller.pubkey,
      subject,
      body,
      html: bodyToHtml(body),
      agentmailMessageId: json.message_id,
      agentmailThreadId: json.thread_id,
    });
    return { ok: true, outreachId: savedId, messageId: json.message_id ?? null };
  },
});

export const scoreTesterApplication = action({
  args: { token: v.string(), email: v.string() },
  handler: async (ctx, { token, email }) => {
    const clean = cleanEmail(email);
    const adminContext = await ctx.runQuery(internal.adminAssistant.adminContext, {
      token,
    });
    const application = await ctx.runQuery(
      internal.adminAssistant.testerApplicationByEmail,
      { token, email: clean },
    );
    if (!application) throw new Error("Tester application not found");
    const outreach = await ctx.runQuery(internal.adminAssistant.latestOutreachByEmail, {
      token,
      email: clean,
    });
    const answer = outreach?.replyText ?? application.reason;
    if (!answer?.trim()) throw new Error("No applicant answer to score yet");
    const result = await ctx.runAction(api.inference.runChat, {
      token,
      model: "openrouter/auto",
      messages: [
        { role: "system", content: buildSystemPrompt(adminContext) },
        {
          role: "user",
          content: [
            "Score this tester/dev applicant from 0-100 using the picky Detour rubric.",
            "Approve only if they show concrete testing/build plans, relevant skill, clear feedback habits, and useful alignment with Detour/creator rewards.",
            "Return exactly:\nSCORE: <0-100>\nRECOMMENDATION: approve|deny|hold\nRATIONALE: <short rationale>",
            `Application:\n${JSON.stringify(application, null, 2)}`,
            `Latest applicant answer:\n${answer}`,
          ].join("\n\n"),
        },
      ],
      refId: `admin-score:${clean}:${Date.now()}`,
    });
    const parsed = parseScore(result.text);
    const outreachId = await ctx.runMutation(internal.adminAssistant.recordScore, {
      email: clean,
      pubkey: application.pubkey ?? undefined,
      adminPubkey: adminContext.caller.pubkey,
      subject: "Tester application score",
      body: answer,
      score: parsed.score,
      recommendation: `${parsed.recommendation}: ${preview(result.text, 500)}`,
      replyText: outreach?.replyText ?? undefined,
      outreachId: outreach?.id ?? undefined,
    });
    return {
      outreachId,
      score: parsed.score,
      recommendation: parsed.recommendation,
      rationale: result.text,
    };
  },
});

export const integrationStatus = action({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await ctx.runQuery(internal.adminAssistant.adminContext, { token });
    const openRouter = (await ctx.runAction(api.inference.openRouterCreditStatus, {
      token,
    })) as {
      configured: boolean;
      status: { remainingUsd: number | null } | null;
      paid: { ok: boolean } | null;
      free: { ok: boolean } | null;
    };
    return {
      agentMail: !!(
        process.env.AGENTMAIL_API_KEY &&
        (process.env.AGENTMAIL_INBOX_ID || process.env.AGENTMAIL_FROM_INBOX_ID)
      ),
      agentMailWebhook: !!process.env.AGENTMAIL_WEBHOOK_SECRET,
      inference: !!(
        process.env.OPENROUTER_API_KEY ||
        process.env.ELIZACLOUD_API_KEY ||
        process.env.ELIZAOS_CLOUD_API_KEY
      ),
      openRouterConfigured: openRouter.configured,
      openRouterCreditsOk: openRouter.paid?.ok === true,
      openRouterFreeCreditsOk: openRouter.free?.ok === true,
      openRouterRemainingUsd: openRouter.status?.remainingUsd ?? null,
    };
  },
});

export const adminContext = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => requireAdminContext(ctx, token),
});

export const ensureThread = internalMutation({
  args: {
    owner: v.string(),
    threadId: v.optional(v.id("adminAssistantThreads")),
  },
  handler: async (ctx, { owner, threadId }) => {
    if (threadId) {
      const row = await ctx.db.get(threadId);
      if (!row || row.owner !== owner) throw new Error("Thread not found");
      return { threadId };
    }
    const rows = await ctx.db
      .query("adminAssistantThreads")
      .withIndex("by_owner", (q) => q.eq("owner", owner))
      .collect();
    const existing = rows.sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (existing) return { threadId: existing._id };
    const now = Date.now();
    const created = await ctx.db.insert("adminAssistantThreads", {
      owner,
      title: "Admin Detour",
      createdAt: now,
      updatedAt: now,
    });
    return { threadId: created };
  },
});

export const insertMessage = internalMutation({
  args: {
    owner: v.string(),
    threadId: v.id("adminAssistantThreads"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    workflow: v.optional(v.string()),
    status: v.optional(
      v.union(v.literal("pending"), v.literal("complete"), v.literal("failed")),
    ),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread || thread.owner !== args.owner) throw new Error("Thread not found");
    const now = Date.now();
    const id = await ctx.db.insert("adminAssistantMessages", {
      owner: args.owner,
      threadId: args.threadId,
      role: args.role,
      content: args.content,
      workflow: args.workflow,
      status: args.status,
      at: now,
    });
    const title =
      thread.title === "Admin Detour" && args.role === "user" && args.content.trim()
        ? preview(args.content, 60)
        : thread.title;
    await ctx.db.patch(args.threadId, { title, updatedAt: now });
    return id;
  },
});

export const updateMessage = internalMutation({
  args: {
    owner: v.string(),
    messageId: v.id("adminAssistantMessages"),
    content: v.string(),
    status: v.union(v.literal("pending"), v.literal("complete"), v.literal("failed")),
  },
  handler: async (ctx, { owner, messageId, content, status }) => {
    const row = await ctx.db.get(messageId);
    if (!row || row.owner !== owner) throw new Error("Message not found");
    await ctx.db.patch(messageId, { content, status });
    await ctx.db.patch(row.threadId, { updatedAt: Date.now() });
  },
});

export const historyForInference = internalQuery({
  args: {
    owner: v.string(),
    threadId: v.id("adminAssistantThreads"),
    limit: v.number(),
  },
  handler: async (ctx, { owner, threadId, limit }) => {
    const thread = await ctx.db.get(threadId);
    if (!thread || thread.owner !== owner) throw new Error("Thread not found");
    const rows = await ctx.db
      .query("adminAssistantMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .collect();
    return rows
      .sort((a, b) => a.at - b.at)
      .slice(-limit)
      .filter((row) => row.content.trim())
      .map((row) => ({ role: row.role, content: row.content }));
  },
});

export const testerApplicationByEmail = internalQuery({
  args: { token: v.string(), email: v.string() },
  handler: async (ctx, { token, email }) => {
    await requireRole(ctx, token, "admin");
    const row = await ctx.db
      .query("waitlist")
      .withIndex("by_email", (q) => q.eq("email", cleanEmail(email)))
      .unique();
    if (!row || (row.kind ?? "early_access") !== "dev_tester") return null;
    return {
      email: row.email,
      pubkey: row.pubkey ?? null,
      name: row.name ?? null,
      reason: row.reason ?? null,
      at: row.at,
    };
  },
});

export const latestOutreachByEmail = internalQuery({
  args: { token: v.string(), email: v.string() },
  handler: async (ctx, { token, email }) => {
    await requireRole(ctx, token, "admin");
    const rows = await ctx.db
      .query("testerOutreach")
      .withIndex("by_email", (q) => q.eq("email", cleanEmail(email)))
      .collect();
    const row = rows.sort((a, b) => b.updatedAt - a.updatedAt)[0];
    return row
      ? {
          id: row._id,
          email: row.email,
          status: row.status,
          subject: row.subject,
          body: row.body,
          score: row.score ?? null,
          recommendation: row.recommendation ?? null,
          replyText: row.replyText ?? null,
          updatedAt: row.updatedAt,
        }
      : null;
  },
});

export const recordOutreachDraft = internalMutation({
  args: {
    email: v.string(),
    pubkey: v.optional(v.string()),
    adminPubkey: v.string(),
    subject: v.string(),
    body: v.string(),
    html: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const id = await ctx.db.insert("testerOutreach", {
      ...args,
      status: "drafted",
      createdAt: now,
      updatedAt: now,
    });
    await logEvent(ctx, "adminAssistant.outreach.draft", {
      pubkey: args.adminPubkey,
      data: { email: args.email },
    });
    return id;
  },
});

export const markOutreachSent = internalMutation({
  args: {
    outreachId: v.optional(v.id("testerOutreach")),
    email: v.string(),
    adminPubkey: v.string(),
    subject: v.string(),
    body: v.string(),
    html: v.string(),
    agentmailMessageId: v.optional(v.string()),
    agentmailThreadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    if (args.outreachId) {
      const row = await ctx.db.get(args.outreachId);
      if (row) {
        await ctx.db.patch(args.outreachId, {
          subject: args.subject,
          body: args.body,
          html: args.html,
          status: "sent",
          agentmailMessageId: args.agentmailMessageId,
          agentmailThreadId: args.agentmailThreadId,
          error: undefined,
          updatedAt: now,
        });
        await logEvent(ctx, "adminAssistant.outreach.sent", {
          pubkey: args.adminPubkey,
          data: { email: args.email },
        });
        return args.outreachId;
      }
    }
    const id = await ctx.db.insert("testerOutreach", {
      email: args.email,
      adminPubkey: args.adminPubkey,
      subject: args.subject,
      body: args.body,
      html: args.html,
      status: "sent",
      agentmailMessageId: args.agentmailMessageId,
      agentmailThreadId: args.agentmailThreadId,
      createdAt: now,
      updatedAt: now,
    });
    await logEvent(ctx, "adminAssistant.outreach.sent", {
      pubkey: args.adminPubkey,
      data: { email: args.email },
    });
    return id;
  },
});

export const markOutreachFailed = internalMutation({
  args: {
    outreachId: v.optional(v.id("testerOutreach")),
    email: v.string(),
    adminPubkey: v.string(),
    subject: v.string(),
    body: v.string(),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    if (args.outreachId) {
      const row = await ctx.db.get(args.outreachId);
      if (row) {
        await ctx.db.patch(args.outreachId, {
          subject: args.subject,
          body: args.body,
          status: "failed",
          error: args.error,
          updatedAt: now,
        });
        return args.outreachId;
      }
    }
    return await ctx.db.insert("testerOutreach", {
      email: args.email,
      adminPubkey: args.adminPubkey,
      subject: args.subject,
      body: args.body,
      status: "failed",
      error: args.error,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const recordScore = internalMutation({
  args: {
    outreachId: v.optional(v.id("testerOutreach")),
    email: v.string(),
    pubkey: v.optional(v.string()),
    adminPubkey: v.string(),
    subject: v.string(),
    body: v.string(),
    score: v.number(),
    recommendation: v.string(),
    replyText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    if (args.outreachId) {
      const row = await ctx.db.get(args.outreachId);
      if (row) {
        await ctx.db.patch(args.outreachId, {
          status: "scored",
          score: args.score,
          recommendation: args.recommendation,
          replyText: args.replyText ?? row.replyText,
          updatedAt: now,
        });
        return args.outreachId;
      }
    }
    return await ctx.db.insert("testerOutreach", {
      email: args.email,
      pubkey: args.pubkey,
      adminPubkey: args.adminPubkey,
      subject: args.subject,
      body: args.body,
      status: "scored",
      score: args.score,
      recommendation: args.recommendation,
      replyText: args.replyText,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const recordAgentMailWebhook = internalMutation({
  args: {
    eventId: v.string(),
    eventType: v.string(),
    email: v.optional(v.string()),
    inboxId: v.optional(v.string()),
    messageId: v.optional(v.string()),
    replyText: v.optional(v.string()),
    payload: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agentMailWebhookEvents")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .unique();
    if (existing) return { ok: true, duplicate: true };
    const now = Date.now();
    await ctx.db.insert("agentMailWebhookEvents", {
      eventId: args.eventId,
      eventType: args.eventType,
      email: args.email,
      inboxId: args.inboxId,
      messageId: args.messageId,
      payload: args.payload,
      at: now,
    });
    const email = args.email;
    if (email && args.replyText?.trim()) {
      const rows = await ctx.db
        .query("testerOutreach")
        .withIndex("by_email", (q) => q.eq("email", email))
        .collect();
      const latest = rows.sort((a, b) => b.updatedAt - a.updatedAt)[0];
      if (latest) {
        await ctx.db.patch(latest._id, {
          status: "received",
          replyText: args.replyText,
          agentmailMessageId: args.messageId ?? latest.agentmailMessageId,
          updatedAt: now,
        });
      }
    }
    await logEvent(ctx, "agentmail.webhook", {
      data: {
        eventType: args.eventType,
        email: args.email,
        messageId: args.messageId,
      },
    });
    return { ok: true, duplicate: false };
  },
});

async function requireAdminContext(ctx: Parameters<typeof requireRole>[0], token: string) {
  const caller = await requireRole(ctx, token, "admin");
  const [users, profiles, whitelist, waitlist, events, configs, flags, outreach] =
    await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("profiles").collect(),
      ctx.db.query("whitelist").collect(),
      ctx.db.query("waitlist").collect(),
      ctx.db.query("events").withIndex("by_at").order("desc").take(40),
      ctx.db.query("config").collect(),
      ctx.db.query("featureFlags").collect(),
      ctx.db.query("testerOutreach").collect(),
    ]);
  const healthPacket = await buildAdminHealthPacket(ctx);
  const profilesByPubkey = new Map(profiles.map((profile) => [profile.pubkey, profile]));
  const whitelistByPubkey = new Map(whitelist.map((row) => [row.pubkey, row]));
  const allTesterApplications = waitlist
    .filter((row) => (row.kind ?? "early_access") === "dev_tester")
    .sort((a, b) => b.at - a.at);
  const testerApplications = allTesterApplications
    .slice(0, 12)
    .map((row) => ({
      email: row.email,
      pubkey: row.pubkey ?? null,
      name: row.name ?? null,
      reason: row.reason ?? null,
      at: row.at,
      latestOutreach:
        outreach
          .filter((item) => item.email === row.email)
          .sort((a, b) => b.updatedAt - a.updatedAt)[0]?.status ?? null,
    }));
  const latestOutreach = outreach
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 12)
    .map((row) => ({
      id: row._id,
      email: row.email,
      status: row.status,
      subject: row.subject,
      score: row.score ?? null,
      recommendation: row.recommendation ?? null,
      replyText: row.replyText ? preview(row.replyText, 320) : null,
      updatedAt: row.updatedAt,
    }));
  const admins = whitelist.filter(
    (row) => row.role === "admin" || row.role === "super_admin",
  );
  return {
    caller,
    counts: {
      users: users.length,
      profiles: profiles.length,
      admins: admins.length,
      whitelisted: whitelist.length,
      pendingWaitlist: waitlist.filter((row) => (row.kind ?? "early_access") !== "dev_tester")
        .length,
      pendingTesterApplications: allTesterApplications.length,
      featureFlags: flags.length,
      configKeys: configs.length,
      recentEvents: events.length,
    },
    testerApplications,
    latestOutreach,
    userSamples: users
      .sort((a, b) => b.lastLoginAt - a.lastLoginAt)
      .slice(0, 10)
      .map((user) => {
        const profile = profilesByPubkey.get(user.pubkey);
        const wl = whitelistByPubkey.get(user.pubkey);
        return {
          pubkey: user.pubkey,
          username: profile?.username ?? null,
          email: profile?.email ?? null,
          role: wl?.role ?? null,
          balance: user.balance,
          creatorRewardsEligible: user.creatorRewardsEligible === true,
          lastLoginAt: user.lastLoginAt,
        };
      }),
    recentEvents: events.map((event) => ({
      type: event.type,
      pubkey: event.pubkey ?? null,
      data: event.data ? preview(event.data, 260) : null,
      at: event.at,
    })),
    featureFlags: flags.map((flag) => ({
      key: flag.key,
      enabled: flag.enabled,
      description: flag.description ?? null,
    })),
    configKeys: configs.map((config) => ({
      key: config.key,
      category: config.category,
      public: config.public,
      description: config.description ?? null,
      value: config.public ? preview(config.value, 120) : "[private]",
    })),
    workflows: WORKFLOWS,
    backendKnowledge: BACKEND_KNOWLEDGE,
    healthPacket: compactHealthPacket(healthPacket),
  };
}
