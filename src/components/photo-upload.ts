import { fileUploadError, photoUrlError } from "@/lib/roomsetu/services";

/** Resize in the browser to a JPEG data URL under ~280 KB. Shared by create and edit. */
export function compressPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const blobUrl = URL.createObjectURL(file);
    img.onload = () => {
      const max = 960;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(blobUrl);
        reject(new Error("canvas"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      let url = canvas.toDataURL("image/jpeg", 0.72);
      if (url.length > 280_000) url = canvas.toDataURL("image/jpeg", 0.5);
      URL.revokeObjectURL(blobUrl);
      if (url.length > 280_000) reject(new Error("large"));
      else resolve(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      reject(new Error("read"));
    };
    img.src = blobUrl;
  });
}

/** Read picked files into photo entries, up to `room` more. Returns the last error, if any. */
export async function readPhotos(
  list: FileList | null,
  room: number,
): Promise<{ added: { url: string; category: string }[]; error: string }> {
  const added: { url: string; category: string }[] = [];
  let error = "";
  for (const file of Array.from(list ?? [])) {
    if (added.length >= room) {
      error = "That's the photo limit for one room.";
      break;
    }
    const kind = fileUploadError({ type: file.type, bytes: file.size });
    if (kind) {
      error = kind;
      continue;
    }
    try {
      const url = await compressPhoto(file);
      const bad = photoUrlError(url);
      if (bad) {
        error = bad;
        continue;
      }
      added.push({ url, category: "Bedroom" });
    } catch {
      error = "That photo could not be read. Try a JPG or PNG.";
    }
  }
  return { added, error };
}
