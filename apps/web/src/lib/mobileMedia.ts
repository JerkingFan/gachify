import Hls, { type HlsConfig } from "hls.js";
import { getApiOrigin } from "@/lib/apiOrigin";
import { isNativeApp } from "@/lib/native";

let xhrPatched = false;

/** MinIO :9000 is often blocked on mobile; Caddy serves /gachify-masters on :80. */
export function patchMobileStreamUrls(): void {
  if (!isNativeApp() || xhrPatched) return;
  const origin = getApiOrigin();
  if (!origin) return;

  let site: URL;
  try {
    site = new URL(origin);
  } catch {
    return;
  }

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ) {
    let resolved = typeof url === "string" ? url : url.toString();
    try {
      const parsed = new URL(resolved, origin);
      if (parsed.hostname === site.hostname && parsed.port === "9000") {
        resolved = `${site.origin}${parsed.pathname}${parsed.search}`;
      }
    } catch {
      /* keep original */
    }
    if (username != null && password != null) {
      return origOpen.call(this, method, resolved, async ?? true, username, password);
    }
    return origOpen.call(this, method, resolved, async ?? true);
  };

  xhrPatched = true;
}

/** Keep user-gesture unlock on Android before async HLS load. */
export function prepareNativePlayback(audio: HTMLAudioElement | null): void {
  if (!audio || !isNativeApp()) return;
  const prev = audio.volume;
  audio.volume = 0;
  void audio
    .play()
    .then(() => {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = prev;
    })
    .catch(() => {
      audio.volume = prev;
    });
}

export function createHls(audio: HTMLAudioElement): Hls {
  const config: Partial<HlsConfig> = {
    lowLatencyMode: false,
    enableWorker: !isNativeApp(),
    xhrSetup: (xhr) => {
      xhr.responseType = "arraybuffer";
    },
  };
  const hls = new Hls(config);
  hls.attachMedia(audio);
  return hls;
}

export function configureAudioForPlatform(audio: HTMLAudioElement): void {
  audio.preload = "auto";
  audio.setAttribute("playsinline", "true");
  audio.setAttribute("webkit-playsinline", "true");
  audio.setAttribute("x-webkit-airplay", "allow");
  audio.setAttribute("airplay", "allow");
  if (!isNativeApp()) {
    audio.crossOrigin = "anonymous";
  } else {
    audio.removeAttribute("crossorigin");
  }
  if ("disableRemotePlayback" in audio) {
    (audio as HTMLAudioElement & { disableRemotePlayback?: boolean }).disableRemotePlayback = false;
  }
}
