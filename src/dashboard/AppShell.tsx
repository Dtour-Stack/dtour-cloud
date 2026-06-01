import { useAction, useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { usePublicConfig } from "@/lib/useConfig";
import { useFlags } from "@/lib/useFlags";
import { surfaceLabelForRoute } from "@/lib/surfaceFlags";
import {
  DTOUR_TEST_SESSION_TOKEN,
  readDtourPlaywrightUser,
} from "@/lib/playwright-dtour-auth";
import { isAdmin, type Role } from "@/lib/roles";
import { DTOUR_SESSION_KEY, getDtourSessionToken } from "@/lib/session";
import { Badge, cn, Icon, IconButton } from "@/ui";
import { AdminDetourAssistant } from "./admin/AdminDetourAssistant";
import { InboxPanel } from "./InboxPanel";

type Me = { username?: string | null; role?: Role } | null | undefined;

export type NavItem = {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
  /** Optional section header to group this item under (rendered uppercase). */
  group?: string;
  /** Show a small "NEW" badge next to the label. */
  isNew?: boolean;
};

/** The user dashboard nav. The first three items are ungrouped (always on top);
 *  the rest are grouped into sections (Runtime → Account → Monetization). Drives
 *  the sidebar here AND the dashboard surfaces. */
// Lean nav: the few daily-driver surfaces. Everything else (Developers, Account,
// Analytics, Instances, MCPs, My Apps, Earnings) lives on the Dashboard launcher
// grid; the dashboard "views" (Profile, Design, Coding, Admin) live in the
// header context-switcher dropdown.
export const USER_NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: <Icon.Home />, end: true },
  { to: "/agents", label: "Agents", icon: <Icon.Bot /> },
  { to: "/gallery", label: "Gallery", icon: <Icon.Image /> },
];

/** Shared app shell: collapsible nav, header (with admin context switcher),
 *  right off-canvas panel. The user dashboard and admin sections both use it. */
export function AppShell({
  title,
  children,
  panel,
  bare = false,
  nav = USER_NAV,
  context = "user",
  sidebar,
}: {
  title?: string;
  children: ReactNode;
  panel?: ReactNode;
  /** Fill the main area exactly (no scroll/padding) — for full-height views like chat. */
  bare?: boolean;
  /** Sidebar items. Defaults to the user-dashboard nav. */
  nav?: NavItem[];
  /** Which context this shell renders — drives the context switcher. */
  context?: "user" | "admin" | "design" | "coding" | "profile" | "custom";
  /** Custom sidebar body (replaces the default nav) — e.g. the chat recents rail. */
  sidebar?: (o: { collapsed: boolean; closeMobile: () => void }) => ReactNode;
}) {
  const navigate = useNavigate();
  const testUser = readDtourPlaywrightUser();
  const token = testUser ? DTOUR_TEST_SESSION_TOKEN : getDtourSessionToken();
  const meQuery = useQuery(anyApi.users.me, token && !testUser ? { token } : "skip") as Me;
  const me = testUser ?? meQuery;
  // Early-access login pins the stored balance to 0; re-read the live on-chain
  // $DTOUR balance once on mount so every section shows the REAL number.
  const refreshBalance = useAction(anyApi.users.refreshBalance);
  useEffect(() => {
    if (token && !testUser) void refreshBalance({ token }).catch(() => {});
  }, [token, testUser, refreshBalance]);
  // Attribute a pending affiliate referral (captured from ?ref= at load) once.
  const attributeRef = useMutation(anyApi.affiliates.attribute);
  useEffect(() => {
    if (testUser) return;
    if (!token) return;
    let ref: string | null = null;
    try {
      ref = localStorage.getItem("dtour-ref");
    } catch {
      /* ignore */
    }
    if (!ref) return;
    void attributeRef({ token, code: ref }).finally(() => {
      try {
        localStorage.removeItem("dtour-ref");
      } catch {
        /* ignore */
      }
    });
  }, [token, testUser, attributeRef]);
  // Auto-provision the user's own affiliate code + invite link on first session,
  // so every signup can invite friends and earn $ELIZA from day one.
  const provisionAffiliate = useMutation(anyApi.affiliates.getOrCreateCode);
  useEffect(() => {
    if (token && !testUser) void provisionAffiliate({ token }).catch(() => {});
  }, [token, testUser, provisionAffiliate]);
  // One-time free starter credits so metered inference doesn't wall new users.
  const claimStarter = useAction(anyApi.credits.claimStarter);
  useEffect(() => {
    if (token && !testUser) void claimStarter({ token }).catch(() => {});
  }, [token, testUser, claimStarter]);
  const unread = useQuery(
    anyApi.messages.unreadCount,
    token && !testUser ? { token } : "skip",
  ) as number | undefined;
  const cfg = usePublicConfig();
  const flags = useFlags();
  const visibleNav = nav;
  const banner = cfg.maintenance_mode
    ? "⚠️ Detour Cloud is in maintenance mode — some features may be unavailable."
    : typeof cfg.announcement === "string" && cfg.announcement.trim()
      ? (cfg.announcement as string)
      : null;

  const [navOpen, setNavOpen] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const panelCloseRef = useRef<HTMLButtonElement>(null);
  const panelTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (panelOpen) setPanelOpen(false);
      else if (mobileNavOpen) setMobileNavOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen, mobileNavOpen]);

  useEffect(() => {
    if (panelOpen) panelCloseRef.current?.focus();
    else panelTriggerRef.current?.focus();
  }, [panelOpen]);

  function signOut() {
    localStorage.removeItem(DTOUR_SESSION_KEY);
    navigate("/login", { replace: true });
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60",
      isActive
        ? "bg-white/10 text-white"
        : "text-white/60 hover:bg-white/5 hover:text-white",
    );
  const label = (text: string) => (
    <span className={cn(!navOpen && "md:hidden")}>{text}</span>
  );
  const closeMobile = () => setMobileNavOpen(false);

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0a0a] text-white">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-white px-4 py-2 text-sm font-medium text-black focus:not-sr-only focus:absolute focus:left-4 focus:top-3"
      >
        Skip to content
      </a>

      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={closeMobile}
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-[1px] md:hidden"
        />
      )}

      <aside
        className={cn(
          "flex shrink-0 flex-col border-r border-white/10 bg-black/40 transition-all duration-200",
          "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:w-60",
          mobileNavOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full",
          navOpen ? "md:w-60" : "md:w-16",
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b border-white/10 px-3">
          <img src="/brand/dtour/logo.svg" alt="Dtour" className="h-7 w-7 shrink-0" />
          <span className={cn("truncate text-sm font-semibold tracking-tight", !navOpen && "md:hidden")}>
            Detour Cloud
          </span>
          <IconButton
            label={navOpen ? "Collapse navigation" : "Expand navigation"}
            onClick={() => setNavOpen((v) => !v)}
            className="ml-auto hidden md:inline-flex"
          >
            <Icon.PanelLeft />
          </IconButton>
          <IconButton label="Close navigation" onClick={closeMobile} className="ml-auto md:hidden">
            <Icon.X />
          </IconButton>
        </div>

        {sidebar ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2">
            {sidebar({ collapsed: !navOpen, closeMobile })}
          </div>
        ) : (
          <nav className="flex-1 space-y-1 overflow-y-auto p-2" aria-label="Primary">
            {(() => {
              const renderItem = (item: NavItem) => {
                const surfaceLabel = surfaceLabelForRoute(item.to, flags);
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={linkClass}
                    onClick={closeMobile}
                  >
                    {item.icon}
                    {label(item.label)}
                    {surfaceLabel && (
                      <Badge
                        tone={surfaceLabel === "Coming soon" ? "warning" : "accent"}
                        className={cn("ml-auto px-1.5 py-0 text-[9px]", !navOpen && "md:hidden")}
                      >
                        {surfaceLabel}
                      </Badge>
                    )}
                    {item.isNew && (
                      <span
                        className={cn(
                          "ml-auto rounded-full border border-purple-400/25 bg-purple-400/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-none tracking-wider text-purple-200",
                          !navOpen && "md:hidden",
                        )}
                      >
                        New
                      </span>
                    )}
                  </NavLink>
                );
              };

              const ungrouped = visibleNav.filter((i) => !i.group);
              // Derive group order from first appearance — keeps AppShell generic
              // (a flat nav with no groups renders nothing here) while honoring the
              // manifest order: Runtime → Account → Monetization.
              const groupOrder: string[] = [];
              for (const i of visibleNav) {
                if (i.group && !groupOrder.includes(i.group)) groupOrder.push(i.group);
              }

              return (
                <>
                  {ungrouped.map(renderItem)}
                  {groupOrder.map((g) => (
                    <div key={g} className="pt-2">
                      <p
                        className={cn(
                          "px-2.5 pb-1 text-[11px] uppercase tracking-wider text-white/40",
                          !navOpen && "md:hidden",
                        )}
                      >
                        {g}
                      </p>
                      <div className="space-y-1">
                        {visibleNav.filter((i) => i.group === g).map(renderItem)}
                      </div>
                    </div>
                  ))}
                </>
              );
            })()}
          </nav>
        )}

        <div className="border-t border-white/10 p-2">
          <button
            type="button"
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-white/60 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
          >
            <Icon.LogOut />
            {label("Sign out")}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4 md:px-5">
          <div className="flex items-center gap-2">
            <IconButton label="Open navigation" onClick={() => setMobileNavOpen(true)} className="md:hidden">
              <Icon.PanelLeft />
            </IconButton>
            <ContextSwitcher context={context} role={me?.role} flags={flags} />
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-white/60 sm:inline">
              {me?.username ? `@${me.username}` : ""}
            </span>
            <div className="relative">
              <IconButton
                ref={panelTriggerRef}
                label="Inbox"
                aria-expanded={panelOpen}
                onClick={() => setPanelOpen((v) => !v)}
              >
                <Icon.PanelRight />
              </IconButton>
              {!!unread && unread > 0 && (
                <span className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-purple-500 px-1 text-[10px] font-semibold leading-none text-white">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </div>
          </div>
        </header>

        {banner && (
          <div className="shrink-0 border-b border-amber-400/20 bg-amber-400/10 px-5 py-2 text-center text-xs text-amber-100/90">
            {banner}
          </div>
        )}
        <main
          id="main"
          tabIndex={-1}
          className={cn(
            "min-h-0 flex-1 focus:outline-none",
            bare ? "flex flex-col overflow-hidden" : "overflow-auto",
          )}
        >
          {children}
        </main>
      </div>

      {panelOpen && (
        <button
          type="button"
          aria-label="Close panel"
          onClick={() => setPanelOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[1px]"
        />
      )}
      <aside
        className={cn(
          "fixed right-0 top-0 z-40 flex h-full w-80 max-w-[88vw] flex-col border-l border-white/10 bg-[#0d0d0d] shadow-2xl transition-transform duration-200",
          panelOpen ? "translate-x-0" : "translate-x-full",
        )}
        aria-hidden={!panelOpen}
        aria-label="Detail panel"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4">
          <span className="text-sm font-medium text-white/80">Inbox</span>
          <IconButton ref={panelCloseRef} label="Close panel" onClick={() => setPanelOpen(false)}>
            <Icon.X />
          </IconButton>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {panelOpen ? (panel ?? <InboxPanel />) : null}
        </div>
      </aside>
      {context === "admin" && isAdmin(me?.role) && <AdminDetourAssistant />}
    </div>
  );
}

function ContextSwitcher({
  context,
  role,
  flags,
}: {
  context: "user" | "admin" | "design" | "coding" | "profile" | "custom";
  role?: Role;
  flags: Record<string, boolean>;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const testUser = readDtourPlaywrightUser();
  const token = testUser ? DTOUR_TEST_SESSION_TOKEN : getDtourSessionToken();
  const customDashboards = useQuery(
    anyApi.design.listDashboards,
    token && !testUser ? { token } : "skip",
  ) as { name: string; title: string; updatedAt: number }[] | null | undefined;

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const activeCustomName = location.pathname.startsWith("/dashboard/custom/")
    ? decodeURIComponent(location.pathname.replace("/dashboard/custom/", ""))
    : "";
  const customItems =
    Array.isArray(customDashboards)
      ? customDashboards.map((dashboard) => ({
          key: `custom:${dashboard.name}`,
          label: dashboard.title || dashboard.name,
          to: `/dashboard/custom/${encodeURIComponent(dashboard.name)}`,
          icon: <Icon.LayoutGrid size={14} />,
        }))
      : [];

  const items = [
    { key: "user", label: "User Dashboard", to: "/dashboard", icon: <Icon.Home size={14} /> },
    { key: "profile", label: "Profile", to: "/profile", icon: <Icon.User size={14} /> },
    { key: "design", label: "Design Studio", to: "/design", icon: <Icon.Palette size={14} /> },
    { key: "coding", label: "Coding", to: "/coding", icon: <Icon.Zap size={14} /> },
    ...customItems,
    ...(isAdmin(role)
      ? [{ key: "admin", label: "Admin", to: "/admin", icon: <Icon.Shield size={14} /> }]
      : []),
  ];
  const itemLabel = (to: string) => surfaceLabelForRoute(to, flags);
  const current =
    context === "custom"
      ? (items.find((i) => i.key === `custom:${activeCustomName}`) ?? {
          key: `custom:${activeCustomName}`,
          label: activeCustomName || "Custom dashboard",
          to: location.pathname,
          icon: <Icon.LayoutGrid size={14} />,
        })
      : (items.find((i) => i.key === context) ?? items[0]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[13px] text-white/85 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
      >
        {current.icon}
        <span>{current.label}</span>
        {itemLabel(current.to) && (
          <Badge
            tone={itemLabel(current.to) === "Coming soon" ? "warning" : "accent"}
            className="hidden px-1.5 py-0 text-[9px] sm:inline-flex"
          >
            {itemLabel(current.to)}
          </Badge>
        )}
        <Icon.ChevronDown size={14} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-1.5 w-52 overflow-hidden rounded-xl border border-white/10 bg-[#111] p-1 shadow-2xl"
        >
          {items.map((i) => (
            <button
              key={i.key}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                navigate(i.to);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition",
                i.key === current.key
                  ? "bg-white/10 text-white"
                  : "text-white/70 hover:bg-white/5 hover:text-white",
              )}
            >
              {i.icon}
              <span className="flex-1">{i.label}</span>
              {itemLabel(i.to) && (
                <Badge
                  tone={itemLabel(i.to) === "Coming soon" ? "warning" : "accent"}
                  className="px-1.5 py-0 text-[9px]"
                >
                  {itemLabel(i.to)}
                </Badge>
              )}
              {i.key === current.key && <Icon.Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
