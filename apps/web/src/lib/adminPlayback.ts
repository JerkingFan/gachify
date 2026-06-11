import Hls from "hls.js";
import { getAdminKey } from "@/lib/adminApi";
import type { AdminPlayback } from "@/lib/adminApi";

function createAdminHls(): Hls {
  const key = getAdminKey();
  return new Hls({
    enableWorker: true,
    xhrSetup: (xhr, url) => {
      if (key && url.includes("/internal/admin/stream/")) {
        xhr.setRequestHeader("X-Gachify-Admin-Key", key);
      }
    },
  });
}

/** Attach moderation preview audio (MP3 proxy preferred, HLS fallback). */
export async function attachAdminPlayback(
  audio: HTMLAudioElement,
  playback: AdminPlayback,
  hlsRef: { current: Hls | null },
): Promise<void> {
  hlsRef.current?.destroy();
  hlsRef.current = null;
  audio.pause();
  audio.removeAttribute("src");
  audio.load();

  if (playback.direct_url) {
    audio.src = playback.direct_url;
    return;
  }

  if (playback.format === "hls" && playback.playlist_url && Hls.isSupported()) {
    const hls = createAdminHls();
    hlsRef.current = hls;
    hls.loadSource(playback.playlist_url);
    hls.attachMedia(audio);
    await new Promise<void>((resolve, reject) => {
      hls.on(Hls.Events.MANIFEST_PARSED, () => resolve());
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        hls.destroy();
        hlsRef.current = null;
        if (playback.fallback_url) {
          audio.src = playback.fallback_url;
          resolve();
          return;
        }
        reject(new Error("HLS playback failed"));
      });
    });
    return;
  }

  const src = playback.fallback_url;
  if (!src) {
    throw new Error("No preview stream available (transcode may still be running)");
  }
  audio.src = src;
}

export function stopAdminPlayback(
  audio: HTMLAudioElement | null,
  hlsRef: { current: Hls | null },
): void {
  hlsRef.current?.destroy();
  hlsRef.current = null;
  if (!audio) return;
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
}
