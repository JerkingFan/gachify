import Hls, { type HlsConfig } from "hls.js";
import { isNativeApp } from "@/lib/native";

/** Sync unlock on user tap — never zero volume (that leaves playback silent on Android). */
export function unlockNativeAudio(audio: HTMLAudioElement | null): void {
  if (!audio || !isNativeApp()) return;
  audio.muted = false;
  if (audio.volume < 0.01) audio.volume = 0.8;
  void audio.play().catch(() => {});
}

export function ensureAudible(audio: HTMLAudioElement, volume: number): void {
  audio.muted = false;
  audio.volume = volume > 0 ? volume : 0.8;
}

export function createHls(audio: HTMLAudioElement): Hls {
  const config: Partial<HlsConfig> = {
    lowLatencyMode: false,
    enableWorker: !isNativeApp(),
    // arraybuffer only for segments — applying it to .m3u8 breaks manifest parsing on web
    xhrSetup: (xhr, url) => {
      if (url.includes("/segment?") || url.endsWith(".ts")) {
        xhr.responseType = "arraybuffer";
      }
    },
  };
  const hls = new Hls(config);
  hls.attachMedia(audio);
  return hls;
}

export function configureAudioForPlatform(audio: HTMLAudioElement): void {
  audio.preload = "auto";
  audio.muted = false;
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
