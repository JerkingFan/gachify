import { getPreviewUrl } from "@/lib/tracks";
import type { Track } from "@/types";

const CACHE_NAME = "gachify-audio-previews";
const MAX_ENTRIES = 32;

/** Warm Cache Storage with preview MP3s for liked tracks (best-effort offline). */
export async function warmLikedPreviewCache(tracks: Track[], likedIds: Set<string>): Promise<void> {
  if (!("caches" in window)) return;

  const urls = tracks
    .filter((t) => likedIds.has(t.id))
    .map((t) => getPreviewUrl(t))
    .filter((u): u is string => Boolean(u))
    .slice(0, MAX_ENTRIES);

  if (!urls.length) return;

  const cache = await caches.open(CACHE_NAME);
  await Promise.all(
    urls.map(async (url) => {
      if (await cache.match(url)) return;
      try {
        const res = await fetch(url, { mode: "cors", credentials: "omit" });
        if (res.ok) await cache.put(url, res);
      } catch {
        /* CDN CORS or offline — skip */
      }
    }),
  );
}
