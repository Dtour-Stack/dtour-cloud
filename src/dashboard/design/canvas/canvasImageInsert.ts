import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

function newFileId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `f${Date.now()}${Math.floor(Math.random() * 1e6)}`;
}

async function urlToDataUrl(url: string): Promise<{ dataURL: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch image (${res.status})`);
  const blob = await res.blob();
  const dataURL = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(blob);
  });
  return { dataURL, mimeType: blob.type || "image/png" };
}

function loadImageSize(dataURL: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Invalid image"));
    img.src = dataURL;
  });
}

function fitSize(width: number, height: number, max = 480) {
  const scale = Math.min(1, max / Math.max(width, height, 1));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Insert a remote gallery/workflow image onto the Excalidraw scene. */
export async function insertImageFromUrl(
  api: ExcalidrawImperativeAPI,
  url: string,
  index = 0,
): Promise<void> {
  const fileId = newFileId();
  const { dataURL, mimeType } = await urlToDataUrl(url);
  const natural = await loadImageSize(dataURL);
  const { width, height } = fitSize(natural.width, natural.height);

  api.addFiles([
    {
      id: fileId as never,
      dataURL,
      mimeType,
      created: Date.now(),
    },
  ]);

  const x = 80 + (index % 4) * (width + 40);
  const y = 80 + Math.floor(index / 4) * (height + 40);
  const { convertToExcalidrawElements } = await import("@excalidraw/excalidraw");
  const elements = convertToExcalidrawElements(
    [{ type: "image", x, y, width, height, fileId: fileId as never }],
    { regenerateIds: true },
  );

  const existing = api.getSceneElements();
  api.updateScene({ elements: [...existing, ...elements] });
  api.scrollToContent(undefined, { fitToContent: true });
}
