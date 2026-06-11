import Hls from "hls.js";
import { type RefObject, useEffect, useRef } from "react";
import { api } from "@/api/client";
import { apiUrl } from "@/lib/apiOrigin";
import { configureAudioForPlatform, createHls, ensureAudible } from "@/lib/mobileMedia";
import { crossfadeAudio } from "@/lib/crossfade";
import { useAudioEffects } from "@/hooks/useAudioEffects";
import { getOfflinePlayback } from "@/lib/offlineTracks";
import { getPreviewUrl } from "@/lib/tracks";
import { usePlayerStore } from "@/store/playerStore";
import type { Track } from "@/types";

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
      const hls = createHls(audio);
      hlsRef.current = hls;
      await new Promise<void>((resolve, reject) => {
        hls.loadSource(offline.url);
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
  const directUrl = playback.direct_url ? apiUrl(playback.direct_url) : null;
  const playlistUrl = playback.playlist_url ? apiUrl(playback.playlist_url) : null;
  const fallbackUrl = playback.fallback_url ? apiUrl(playback.fallback_url) : null;

  // Same-origin MP3 proxy — reliable on web and mobile (no MSE / WebAudio HLS quirks).
  if (directUrl) {
    audio.src = directUrl;
    return;
  }

  if (playback.format === "mp3" && fallbackUrl) {
    audio.src = fallbackUrl;
    return;
  }

  if (playback.format === "hls" && playlistUrl && Hls.isSupported()) {
    const hls = createHls(audio);
    hlsRef.current = hls;
    await new Promise<void>((resolve, reject) => {
      hls.loadSource(playlistUrl);
      hls.on(Hls.Events.MANIFEST_PARSED, () => resolve());
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        hls.destroy();
        hlsRef.current = null;
        if (fallbackUrl) {
          audio.src = fallbackUrl;
          resolve();
          return;
        }
        reject(data);
      });
    });
    return;
  }

  const preview = getPreviewUrl(track);
  const url = fallbackUrl ?? (preview ? apiUrl(preview) : null);
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

    configureAudioForPlatform(audio);
    bindAudio(audio);

    const onTime = () => tick(audio.currentTime * 1000);
    const onEnded = () => next();
    const onPlay = () => usePlayerStore.setState({ isPlaying: true });
    const onPause = () => usePlayerStore.setState({ isPlaying: false });
    const onPlaying = () => {
      ensureAudible(audio, usePlayerStore.getState().volume);
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("playing", onPlaying);

    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("playing", onPlaying);
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

    const playAudible = () => {
      ensureAudible(audio, usePlayerStore.getState().volume);
      audio.playbackRate = rate;
      void audio.play().catch(() => usePlayerStore.setState({ isPlaying: false }));
    };

    const loadPlain = async () => {
      try {
        await attachPlayback(audio, track, hlsRef);
        if (cancelled) return;
        usePlayerStore.setState({ progressMs: 0, crossfadeOnLoad: false, gaplessOnLoad: false });
        playAudible();
      } catch {
        const retry = await api.getPlayback(track.id).catch(() => null);
        const preview = getPreviewUrl(track);
        const url =
          (retry?.direct_url ? apiUrl(retry.direct_url) : null) ??
          (retry?.fallback_url ? apiUrl(retry.fallback_url) : null) ??
          (preview ? apiUrl(preview) : null);
        if (!cancelled && url) {
          audio.src = url;
          usePlayerStore.setState({ progressMs: 0, crossfadeOnLoad: false });
          playAudible();
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
          playAudible();
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
