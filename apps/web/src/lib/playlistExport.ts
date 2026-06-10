import { getStoredTokens } from "@/api/client";
import { apiUrl } from "@/lib/apiOrigin";

/** Download playlist as M3U or JSON (public or owned). */
export async function downloadPlaylistExport(
  playlistId: string,
  format: "m3u" | "json",
  authed: boolean,
  filename: string,
): Promise<void> {
  const base = apiUrl(
    authed
      ? `/api/v1/me/playlists/${playlistId}/export?format=${format}`
      : `/api/v1/playlists/${playlistId}/export?format=${format}`,
  );
  const headers: HeadersInit = {};
  if (authed) {
    const { access } = getStoredTokens();
    if (access) headers.Authorization = `Bearer ${access}`;
  }
  const res = await fetch(base, { headers, credentials: "include" });
  if (!res.ok) throw new Error("Export failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.${format === "m3u" ? "m3u" : "json"}`;
  a.click();
  URL.revokeObjectURL(url);
}
