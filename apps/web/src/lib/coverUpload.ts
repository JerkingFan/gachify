import { api } from "@/api/client";
import type { Track } from "@/types";

const COVER_ACCEPT = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";

export { COVER_ACCEPT };

export async function uploadTrackCover(trackId: string, file: File): Promise<Track> {
  const contentType =
    file.type && file.type !== "application/octet-stream"
      ? file.type
      : file.name.toLowerCase().endsWith(".png")
        ? "image/png"
        : file.name.toLowerCase().endsWith(".webp")
          ? "image/webp"
          : "image/jpeg";

  const presign = await api.initCoverUpload(trackId, {
    filename: file.name,
    content_type: contentType,
  });
  const putRes = await fetch(presign.upload_url, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": contentType },
  });
  if (!putRes.ok) {
    throw new Error(`Cover upload failed (${putRes.status})`);
  }
  return api.completeCoverUpload(trackId);
}
