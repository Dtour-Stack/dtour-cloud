import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { useEffect, useRef, useState } from "react";
import {
  DTOUR_TEST_SESSION_TOKEN,
  readDtourPlaywrightUser,
} from "@/lib/playwright-dtour-auth";
import { getDtourSessionToken } from "@/lib/session";
import { cn, EmptyState, Icon, Skeleton } from "@/ui";

type Msg = {
  id: string;
  fromRole: string;
  subject: string | null;
  body: string;
  push: boolean;
  read: boolean;
  at: number;
};

const EMPTY_MESSAGES: Msg[] = [];

export function InboxPanel() {
  const testUser = readDtourPlaywrightUser();
  const token = testUser ? DTOUR_TEST_SESSION_TOKEN : getDtourSessionToken();
  const messages = useQuery(
    anyApi.messages.inbox,
    token && !testUser ? { token } : "skip",
  ) as Msg[] | undefined;
  const markRead = useMutation(anyApi.messages.markRead);
  const markAllRead = useMutation(anyApi.messages.markAllRead);
  const visibleMessages = testUser ? EMPTY_MESSAGES : messages;

  const seen = useRef<Set<string>>(new Set());
  const primed = useRef(false);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported",
  );

  // Fire a browser notification for newly-arrived push messages.
  useEffect(() => {
    if (!visibleMessages) return;
    if (!primed.current) {
      for (const m of visibleMessages) seen.current.add(m.id);
      primed.current = true;
      return;
    }
    for (const m of visibleMessages) {
      if (seen.current.has(m.id)) continue;
      seen.current.add(m.id);
      if (
        m.push &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
        new Notification(m.subject ?? "Detour Cloud", {
          body: m.body,
          icon: "/brand/dtour/logo.svg",
        });
      }
    }
  }, [visibleMessages]);

  const hasUnread = visibleMessages?.some((m) => !m.read);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end gap-3 pb-2">
        {perm === "default" && (
          <button
            type="button"
            onClick={() => Notification.requestPermission().then(setPerm)}
            className="text-xs text-white/50 underline-offset-2 hover:text-white hover:underline"
          >
            Enable notifications
          </button>
        )}
        {hasUnread && token && (
          <button
            type="button"
            onClick={() => markAllRead({ token })}
            className="text-xs text-white/50 hover:text-white"
          >
            Mark all read
          </button>
        )}
      </div>

      {visibleMessages === undefined ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : visibleMessages.length === 0 ? (
        <EmptyState
          icon={<Icon.Activity size={20} />}
          title="No messages"
          description="Notifications from the team show up here."
        />
      ) : (
        <ul className="space-y-2 overflow-auto">
          {visibleMessages.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => token && !m.read && markRead({ token, id: m.id })}
                className={cn(
                  "w-full rounded-lg border p-3 text-left transition",
                  m.read
                    ? "border-white/[0.08] bg-transparent"
                    : "border-purple-400/20 bg-purple-400/5 hover:bg-purple-400/10",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-white/90">
                    {m.subject ?? "Message"}
                  </span>
                  {!m.read && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-purple-400" />
                  )}
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-white/55">
                  {m.body}
                </p>
                <span className="mt-1 block text-[10px] text-white/30">
                  {new Date(m.at).toLocaleString()}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
