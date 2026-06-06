import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { type ReactNode, useState } from "react";
import { NavLink, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { getDtourSessionToken } from "@/lib/session";
import { cn, Icon } from "@/ui";

type Agent = {
  id: string;
  name: string;
  createdAt: number;
  lastChatAt: number;
  lastPreview: string | null;
};

type AgentChat = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

/** ChatGPT-style chat rail: New agent + search at top, a scrollable "Recents"
 *  list of the user's agents below. Rendered by AppShell on the agents pages. */
export function ChatSidebar({
  collapsed,
  closeMobile,
}: {
  collapsed: boolean;
  closeMobile: () => void;
}) {
  const navigate = useNavigate();
  const { agentId } = useParams();
  const [searchParams] = useSearchParams();
  const activeChatId = searchParams.get("chat");
  const token = getDtourSessionToken();
  const agents = useQuery(
    anyApi.agents.list,
    token ? { token } : "skip",
  ) as Agent[] | undefined;
  const chats = useQuery(
    anyApi.agents.listChats,
    token && agentId ? { token, agentId } : "skip",
  ) as AgentChat[] | undefined;
  const createChat = useMutation(anyApi.agents.createChat);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  const filtered = (agents ?? []).filter((a) =>
    a.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  function go(to: string) {
    closeMobile();
    navigate(to);
  }

  async function startNewChat() {
    if (!token || !agentId) return;
    const { chatId } = (await createChat({ token, agentId })) as { chatId: string };
    go(`/agents/${agentId}?chat=${chatId}`);
  }

  // Collapsed rail: icon-only quick actions, no recents list.
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1">
        <RailIcon label="New agent" onClick={() => go("/agents")}>
          <Icon.SquarePen size={16} />
        </RailIcon>
        <RailIcon label="All agents" onClick={() => go("/agents")}>
          <Icon.Bot size={16} />
        </RailIcon>
        <RailIcon label="Dashboard" onClick={() => go("/dashboard")}>
          <Icon.Home size={16} />
        </RailIcon>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-0.5">
        <Row icon={<Icon.SquarePen size={16} />} label="New agent" onClick={() => go("/agents")} />
        <Row
          icon={<Icon.Search size={16} />}
          label="Search agents"
          onClick={() => setSearching((v) => !v)}
          active={searching}
        />
        <Row icon={<Icon.Home size={16} />} label="Dashboard" onClick={() => go("/dashboard")} />
      </div>

      {searching && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter agents…"
          className="mt-2 w-full rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-[13px] text-white placeholder:text-white/30 focus:border-purple-400/50 focus:outline-none"
        />
      )}

      {agentId && (
        <>
          <div className="mb-1 mt-4 px-2 text-[10px] uppercase tracking-widest text-white/35">
            Chats
          </div>
          <div className="space-y-0.5">
            <Row
              icon={<Icon.SquarePen size={16} />}
              label="New chat"
              onClick={() => void startNewChat()}
            />
            {chats === undefined ? (
              <div className="mx-1 h-8 animate-pulse rounded-md bg-white/[0.04]" />
            ) : chats.length === 0 ? (
              <p className="px-2 py-2 text-[12px] text-white/35">No chats yet.</p>
            ) : (
              chats.map((c) => (
                <NavLink
                  key={c.id}
                  to={`/agents/${agentId}?chat=${c.id}`}
                  onClick={closeMobile}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2.5 py-2 text-[13px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60",
                    c.id === activeChatId
                      ? "bg-white/10 text-white"
                      : "text-white/65 hover:bg-white/5 hover:text-white",
                  )}
                >
                  <Icon.List size={14} className="shrink-0 opacity-60" />
                  <span className="truncate">{c.title}</span>
                </NavLink>
              ))
            )}
          </div>
        </>
      )}

      <div className="mb-1 mt-4 px-2 text-[10px] uppercase tracking-widest text-white/35">
        Recents
      </div>

      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {agents === undefined ? (
          <div className="space-y-1.5 px-1 py-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-8 w-full animate-pulse rounded-md bg-white/[0.04]" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-2 py-3 text-[12px] leading-relaxed text-white/35">
            {agents.length === 0
              ? "No agents yet. Create one to start chatting."
              : "No agents match your search."}
          </p>
        ) : (
          filtered.map((a) => (
            <NavLink
              key={a.id}
              to={`/agents/${a.id}`}
              onClick={closeMobile}
              className={cn(
                "flex items-start gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60",
                a.id === agentId
                  ? "bg-white/10 text-white"
                  : "text-white/65 hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon.Bot size={15} className="mt-0.5 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{a.name}</span>
                {a.lastPreview ? (
                  <span className="mt-0.5 block truncate text-[11px] text-white/35">
                    {a.lastPreview}
                  </span>
                ) : null}
              </span>
            </NavLink>
          ))
        )}
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  onClick,
  active,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60",
        active
          ? "bg-white/10 text-white"
          : "text-white/70 hover:bg-white/5 hover:text-white",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function RailIcon({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-10 w-10 items-center justify-center rounded-md text-white/60 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
    >
      {children}
    </button>
  );
}
