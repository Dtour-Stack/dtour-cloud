import { useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { type ChangeEvent, useRef, useState } from "react";
import { readDtourPlaywrightUser } from "@/lib/playwright-dtour-auth";
import { Button, Icon } from "@/ui";
import { useGalleryUpload } from "./useGalleryUpload";

type Asset = { id: string; name: string; url: string | null };
const EMPTY_ASSETS: Asset[] = [];

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
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const testUser = readDtourPlaywrightUser();
  const { uploadImage } = useGalleryUpload(token);
  const queryAssets = useQuery(anyApi.assets.myGallery, token && !testUser ? { token } : "skip") as
    | Asset[]
    | undefined;
  const assets = testUser ? EMPTY_ASSETS : queryAssets;

  async function onUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const saved = await uploadImage(file);
      if (saved.url) onPick(saved.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-2xl border border-white/10 bg-[#0d0d12] p-5 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-white">
            <Icon.Image size={16} /> Pick from gallery
          </div>
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onUpload} />
            <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Icon.Plus size={13} />
              {uploading ? "Uploading…" : "Upload & use"}
            </Button>
            <button
              type="button"
              aria-label="Close gallery"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-md text-white/40 transition hover:bg-white/10 hover:text-white/80"
            >
              <Icon.X size={14} />
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-xl border border-red-400/25 bg-red-400/10 px-3 py-2 text-xs text-red-200">
            {error}
          </div>
        )}

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          {assets === undefined ? (
            <p className="py-10 text-center text-sm text-white/40">Loading…</p>
          ) : assets.length === 0 ? (
            <p className="py-10 text-center text-sm text-white/40">
              No images yet.
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
