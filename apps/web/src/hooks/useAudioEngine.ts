import Hls from "hls.js";
import { type RefObject, useEffect, useRef } from "react";
import { api } from "@/api/client";
import { crossfadeAudio } from "@/lib/crossfade";
import { useAudioEffects } from "@/hooks/useAudioEffects";
import { getOfflinePlayback } from "@/lib/offlineTracks";
import { getPreviewUrl } from "@/lib/tracks";
import { usePlayerStore } from "@/store/playerStore";
import type { Track } from "@/types";

function configureAudioElement(audio: HTMLAudioElement) {
  audio.preload = "auto";
  audio.setAttribute("playsinline", "true");
  audio.setAttribute("webkit-playsinline", "true");
  audio.setAttribute("x-webkit-airplay", "allow");
  audio.setAttribute("airplay", "allow");
  audio.crossOrigin = "anonymous";
  if ("disableRemotePlayback" in audio) {
    (audio as HTMLAudioElement & { disableRemotePlayback?: boolean }).disableRemotePlayback = false;
  }
}

type PlaybackInfo = Awaited<ReturnType<typeof api.getPlayback>>;

async function attachPlayback(
  audio: HTMLAudioElement,
  track: Track,
  hlsRef: { current: Hls | null },
): Promise<void> {
  hlsRef.current?.destroy();
  hlsRef.current = null;

  const offline = await getOfflinePlayback(track.id);
  if (offline) {
    if (offline.format === "hls" && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
      hlsRef.current = hls;
      await new Promise<void>((resolve, reject) => {
        hls.loadSource(offline.url);
        hls.attachMedia(audio);
        hls.on(Hls.Events.MANIFEST_PARSED, () => resolve());
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) reject(data);
        });
      });
      return;
    }
    audio.src = offline.url;
    return;
  }

  const playback = await api.getPlayback(track.id);

  if (playback.format === "hls" && playback.playlist_url && Hls.isSupported()) {
    const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
    hlsRef.current = hls;
    await new Promise<void>((resolve, reject) => {
      hls.loadSource(playback.playlist_url!);
      hls.attachMedia(audio);
      hls.on(Hls.Events.MANIFEST_PARSED, () => resolve());
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal && playback.fallback_url) {
          hls.destroy();
          hlsRef.current = null;
          audio.src = playback.fallback_url;
          resolve();
        } else if (data.fatal) {
          reject(data);
        }
      });
    });
    return;
  }

  const url = playback.fallback_url ?? getPreviewUrl(track);
  if (url) audio.src = url;
}

/**
 * Binds a DOM <audio> element (required for reliable iOS background + PWA playback).
 */
export function useAudioEngine(audioRef: RefObject<HTMLAudioElement | null>) {
  const hlsRef = useRef<Hls | null>(null);
  useAudioEffects(audioRef);
  const bindAudio = usePlayerStore((s) => s.bindAudio);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const tick = usePlayerStore((s) => s.tick);
  const next = usePlayerStore((s) => s.next);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    configureAudioElement(audio);
    bindAudio(audio);

    const onTime = () => tick(audio.currentTime * 1000);
    const onEnded = () => next();
    const onPlay = () => usePlayerStore.setState({ isPlaying: true });
    const onPause = () => usePlayerStore.setState({ isPlaying: false });

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [audioRef, bindAudio, tick, next]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    let cancelled = false;
    const track = currentTrack;
    const crossfade = usePlayerStore.getState().crossfadeOnLoad;
    const gapless = usePlayerStore.getState().gaplessOnLoad;
    const hadSource = Boolean(audio.src || audio.currentSrc);
    const rate = usePlayerStore.getState().playbackRate;
    audio.playbackRate = rate;

    const loadPlain = async () => {
      try {
        await attachPlayback(audio, track, hlsRef);
        if (cancelled) return;
        usePlayerStore.setState({ progressMs: 0, crossfadeOnLoad: false, gaplessOnLoad: false });
        audio.playbackRate = rate;
        void audio.play().catch(() => usePlayerStore.setState({ isPlaying: false }));
      } catch {
        const legacy = getPreviewUrl(track);
        if (!cancelled && legacy) {
          audio.src = legacy;
          usePlayerStore.setState({ progressMs: 0, crossfadeOnLoad: false });
          void audio.play().catch(() => usePlayerStore.setState({ isPlaying: false }));
        }
      }
    };

    const run = async () => {
      usePlayerStore.setState({ progressMs: 0, isPlaying: false });

      if ((crossfade || gapless) && hadSource) {
        try {
          await crossfadeAudio(
            audio,
            () => attachPlayback(audio, track, hlsRef),
            gapless ? 60 : 1200,
          );
          if (cancelled) return;
          usePlayerStore.setState({ crossfadeOnLoad: false, gaplessOnLoad: false });
          audio.playbackRate = rate;
          void audio.play().catch(() => usePlayerStore.setState({ isPlaying: false }));
        } catch {
          if (!cancelled) await loadPlain();
        }
        return;
      }

      usePlayerStore.setState({ crossfadeOnLoad: false });
      await loadPlain();
    };

    void run();
    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [audioRef, currentTrack?.id]);

  const playbackRate = usePlayerStore((s) => s.playbackRate);
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = playbackRate;
  }, [audioRef, playbackRate]);
}
