import Hls from "hls.js";
import { useEffect, useRef } from "react";
import { api } from "@/api/client";
import { getPreviewUrl } from "@/lib/tracks";
import { usePlayerStore } from "@/store/playerStore";

export function useAudioEngine() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const bindAudio = usePlayerStore((s) => s.bindAudio);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const tick = usePlayerStore((s) => s.tick);
  const next = usePlayerStore((s) => s.next);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;
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
      hlsRef.current?.destroy();
      hlsRef.current = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audioRef.current = null;
    };
  }, [bindAudio, tick, next]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    let cancelled = false;

    const load = async () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      usePlayerStore.setState({ progressMs: 0, isPlaying: false });

      try {
        const playback = await api.getPlayback(currentTrack.id);
        if (cancelled) return;

        if (
          playback.format === "hls" &&
          playback.playlist_url &&
          Hls.isSupported()
        ) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: false,
          });
          hlsRef.current = hls;
          hls.loadSource(playback.playlist_url);
          hls.attachMedia(audio);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (!cancelled) {
              void audio.play().catch(() =>
                usePlayerStore.setState({ isPlaying: false }),
              );
            }
          });
          hls.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal && playback.fallback_url) {
              hls.destroy();
              hlsRef.current = null;
              audio.src = playback.fallback_url;
              void audio.play();
            }
          });
          return;
        }

        const fallback =
          playback.fallback_url ?? getPreviewUrl(currentTrack);
        if (fallback) {
          audio.src = fallback;
          void audio.play().catch(() =>
            usePlayerStore.setState({ isPlaying: false }),
          );
        }
      } catch {
        const legacy = getPreviewUrl(currentTrack);
        if (!cancelled && legacy) {
          audio.src = legacy;
          void audio.play().catch(() =>
            usePlayerStore.setState({ isPlaying: false }),
          );
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [currentTrack?.id]);
}
