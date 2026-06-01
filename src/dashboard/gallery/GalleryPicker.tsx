import { useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { Icon } from "@/ui";

type Asset = { id: string; name: string; url: string | null };

/** Click-to-pick gallery modal — shows the user's images; click one → onPick(url).
 *  No URLs to copy/paste. Used by agent chat + workflow image input. */
export function GalleryPicker({
  token,
  onPick,
  onClose,
}: {
  token: string;
  onPick: (url: string) => void;
  onClose: () => void;
}) {
  const assets = useQuery(anyApi.assets.myGallery, token ? { token } : "skip") as
    | Asset[]
    | undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-2xl border border-white/10 bg-[#0d0d12] p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-white">
            <Icon.Image size={16} /> Pick from gallery
          </div>
          <button type="button" onClick={onClose} className="text-white/40 transition hover:text-white/80">
            ✕
          </button>
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          {assets === undefined ? (
            <p className="py-10 text-center text-sm text-white/40">Loading…</p>
          ) : assets.length === 0 ? (
            <p className="py-10 text-center text-sm text-white/40">
              No images yet — upload or generate one in your Gallery first.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {assets.map((a) =>
                a.url ? (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onPick(a.url as string)}
                    title={a.name}
                    className="group aspect-square overflow-hidden rounded-xl border border-white/10 bg-black/30 transition hover:border-violet-400/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
                  >
                    <img
                      src={a.url}
                      alt={a.name}
                      loading="lazy"
                      className="h-full w-full object-cover transition group-hover:scale-105"
                    />
                  </button>
                ) : null,
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
