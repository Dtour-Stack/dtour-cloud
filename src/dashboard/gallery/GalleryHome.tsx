import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { useRef, useState } from "react";
import { getDtourSessionToken } from "@/lib/session";
import { Button, Icon } from "@/ui";

export type GalleryAsset = {
  id: string;
  name: string;
  contentType: string;
  url: string | null;
  createdAt: number;
};

/** Gallery grid + upload — embeddable in Design Studio or standalone AppShell. */
export function GalleryHome({
  title = "Gallery",
  description = "Your images — uploads and generated outputs. Click any image to view it. Pick from here directly in Workflows and Agent chat.",
}: {
  title?: string;
  description?: string;
}) {
  const token = getDtourSessionToken();
  const assets = useQuery(
    anyApi.assets.myGallery,
    token ? { token } : "skip",
  ) as GalleryAsset[] | undefined;

  const generateUploadUrl = useMutation(anyApi.assets.generateUploadUrl);
  const saveUploaded = useMutation(anyApi.assets.saveUploaded);
  const removeAsset = useMutation(anyApi.assets.removeAsset);

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<GalleryAsset | null>(null);

  const loading = assets === undefined;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !token) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const uploadUrl = (await generateUploadUrl({ token })) as string;
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      const { storageId } = (await res.json()) as { storageId: string };
      await saveUploaded({ token, storageId, name: file.name, contentType: file.type });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function onDelete(a: GalleryAsset) {
    if (!token) return;
    setError(null);
    setDeletingId(a.id);
    try {
      await removeAsset({ token, id: a.id });
      setPreview((p) => (p?.id === a.id ? null : p));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete.");
    } finally {
      setDeletingId((cur) => (cur === a.id ? null : cur));
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">{title}</h1>
          <p className="mt-1 text-sm text-white/50">{description}</p>
        </div>
        <div className="flex items-center gap-3">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
          <Button onClick={() => fileRef.current?.click()} disabled={uploading || !token}>
            <Icon.Plus size={14} />
            {uploading ? "Uploading…" : "Upload image"}
          </Button>
        </div>
      </header>

      {error && (
        <div className="mt-4 rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-2.5 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="mt-6">
        {loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders
                key={i}
                className="aspect-square animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]"
              />
            ))}
          </div>
        ) : assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-16 text-center">
            <span className="mb-3 rounded-xl bg-white/5 p-3 text-white/50">
              <Icon.Image size={22} />
            </span>
            <div className="text-sm font-medium text-white">No images yet</div>
            <p className="mt-1 max-w-sm text-xs text-white/45">
              Upload an image, or generate one in Design — outputs land here. Then pick
              from your gallery directly inside Workflows and Agent chat.
            </p>
            <Button
              className="mt-4"
              variant="secondary"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={uploading || !token}
            >
              <Icon.Plus size={14} /> Upload image
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {assets.map((a) => (
              <div
                key={a.id}
                className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] transition hover:border-white/20"
              >
                <button
                  type="button"
                  onClick={() => a.url && setPreview(a)}
                  className="relative block aspect-square w-full bg-black/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
                  title="View"
                >
                  {a.url ? (
                    <img src={a.url} alt={a.name} loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-white/30">
                      <Icon.Image size={24} />
                    </div>
                  )}
                  <span className="pointer-events-none absolute inset-0 bg-black/0 transition group-hover:bg-black/10" />
                </button>
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0 truncate text-xs text-white/70">{a.name}</div>
                  <button
                    type="button"
                    onClick={() => onDelete(a)}
                    disabled={deletingId === a.id}
                    title="Delete"
                    aria-label="Delete image"
                    className="shrink-0 rounded-md p-1 text-white/40 transition hover:bg-red-500/20 hover:text-red-200 disabled:opacity-40"
                  >
                    <Icon.Trash size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {preview?.url && (
        <button
          type="button"
          aria-label="Close preview"
          onClick={() => setPreview(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
        >
          <img
            src={preview.url}
            alt={preview.name}
            className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
          />
        </button>
      )}
    </div>
  );
}
