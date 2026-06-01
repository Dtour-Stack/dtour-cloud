import { useMutation } from "convex/react";
import { anyApi } from "convex/server";

export type UploadedGalleryAsset = {
  id: string;
  name: string;
  contentType: string;
  url: string | null;
  createdAt: number;
};

type UploadResponse = {
  storageId?: string;
};

type SaveUploadedResult = UploadedGalleryAsset & {
  ok: boolean;
};

export function useGalleryUpload(token: string | null) {
  const generateUploadUrl = useMutation(anyApi.assets.generateUploadUrl);
  const saveUploaded = useMutation(anyApi.assets.saveUploaded);

  async function uploadImage(file: File): Promise<UploadedGalleryAsset> {
    if (!token) throw new Error("Sign in to upload images.");
    if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");

    const uploadUrl = (await generateUploadUrl({ token })) as string;
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!res.ok) throw new Error(`Upload failed (${res.status})`);

    const { storageId } = (await res.json()) as UploadResponse;
    if (!storageId) throw new Error("Upload failed.");

    const saved = (await saveUploaded({
      token,
      storageId,
      name: file.name,
      contentType: file.type,
    })) as SaveUploadedResult;

    return {
      id: saved.id,
      name: saved.name,
      contentType: saved.contentType,
      url: saved.url,
      createdAt: saved.createdAt,
    };
  }

  return { uploadImage };
}
