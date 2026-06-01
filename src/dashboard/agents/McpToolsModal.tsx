import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MCP_CATALOG } from "@/lib/mcpCatalog";
import { Button, Icon } from "@/ui";

export function McpToolsModal({
  token,
  onClose,
}: {
  token: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const connected = useQuery(anyApi.mcps.connected, { token }) as string[] | undefined;
  const connect = useMutation(anyApi.mcps.connect);
  const disconnect = useMutation(anyApi.mcps.disconnect);
  const isOn = (id: string) => connected?.includes(id) ?? false;

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="relative z-10 flex max-h-[min(80vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d0d] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Icon.Plug size={16} />
            <span className="text-sm font-semibold">MCP tools</span>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white"
          >
            <Icon.X size={15} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 space-y-3">
          <p className="text-[13px] leading-relaxed text-white/50">
            Bookmark servers for your account. Live tool execution in chat is still rolling out —
            connected servers appear in agent traces when wired.
          </p>
          {MCP_CATALOG.map((m) => {
            const on = isOn(m.id);
            return (
              <div
                key={m.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3"
              >
                <div>
                  <div className="text-[13px] font-medium text-white">{m.name}</div>
                  <div className="text-[10px] uppercase tracking-wide text-white/35">{m.category}</div>
                  <div className="mt-0.5 text-[12px] text-white/45">{m.desc}</div>
                </div>
                <Button
                  size="sm"
                  variant={on ? "ghost" : "secondary"}
                  onClick={() => void (on ? disconnect({ token, mcp: m.id }) : connect({ token, mcp: m.id }))}
                >
                  {on ? "Connected" : "Connect"}
                </Button>
              </div>
            );
          })}
        </div>
        <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-3">
          <button
            type="button"
            onClick={() => {
              onClose();
              navigate("/mcps");
            }}
            className="rounded-full px-4 py-2 text-[13px] text-white/55 transition hover:bg-white/10 hover:text-white"
          >
            Open MCP page
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white px-4 py-2 text-[13px] font-medium text-black transition hover:bg-white/90"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
