import {
  ChevronDown,
  ExternalLink,
  Heart,
  ListMusic,
  ListPlus,
  Maximize2,
  Mic2,
  Pause,
  Play,
  Radio,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { KaraokeLyrics } from "@/components/player/KaraokeLyrics";
import { CastButton } from "@/components/player/CastButton";
import { DiscordStatusButton } from "@/components/player/DiscordStatusButton";
import { EqPresetMenu } from "@/components/player/EqPresetMenu";
import { PlayerComfortMenu } from "@/components/player/PlayerComfortMenu";
import { WaveformSeekBar } from "@/components/player/WaveformSeekBar";
import { AddToPlaylistMenu } from "@/components/ui/AddToPlaylistMenu";
import { CoverArt } from "@/components/ui/CoverArt";
import { RadioStartButton } from "@/components/ui/RadioStartButton";
import { ShareButton } from "@/components/ui/ShareButton";
import { useTrackLyrics } from "@/hooks/useTrackLyrics";
import {
  coverGradient,
  formatDuration,
  getArtistName,
  getPreviewUrl,
  getSubtitle,
  parseGachiMeta,
} from "@/lib/tracks";
import { useAuthStore } from "@/store/authStore";
import { useLibraryStore } from "@/store/libraryStore";
import { usePlayerStore } from "@/store/playerStore";
import { useUIStore } from "@/store/uiStore";
import type { Track } from "@/types";

export function NowPlayingView() {
  const open = useUIStore((s) => s.nowPlayingOpen);
  const closeNowPlaying = useUIStore((s) => s.closeNowPlaying);
  const openQueue = useUIStore((s) => s.setQueuePanelOpen);
  const expandKaraoke = useUIStore((s) => s.expandKaraokeInNowPlaying);
  const clearExpandKaraoke = useUIStore((s) => s.clearExpandKaraokeInNowPlaying);
  const openKaraokeFullscreen = useUIStore((s) => s.openKaraokeFullscreen);

  const track = usePlayerStore((s) => s.currentTrack);
  const queue = usePlayerStore((s) => s.queue);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const progressMs = usePlayerStore((s) => s.progressMs);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const repeat = usePlayerStore((s) => s.repeat);
  const radioMode = usePlayerStore((s) => s.radioMode);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const next = usePlayerStore((s) => s.next);
  const previous = usePlayerStore((s) => s.previous);
  const seek = usePlayerStore((s) => s.seek);
  const audio = usePlayerStore((s) => s.audio);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const cycleRepeat = usePlayerStore((s) => s.cycleRepeat);
  const toggleRadioMode = usePlayerStore((s) => s.toggleRadioMode);
  const playTrack = usePlayerStore((s) => s.playTrack);

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLikedFn = useLibraryStore((s) => s.isLiked);
  const toggleLiked = useLibraryStore((s) => s.toggleLiked);

  const lyricsDoc = useTrackLyrics(track);
  const [liked, setLiked] = useState(false);
  const [karaokeVisible, setKaraokeVisible] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [similar, setSimilar] = useState<Track[]>([]);
  const [waveUrl, setWaveUrl] = useState<string | null>(null);
  const playlistRef = useRef<HTMLDivElement>(null);

  const duration = track?.duration_ms ?? 0;
  const meta = track ? parseGachiMeta(track) : null;

  useEffect(() => {
    if (track) setLiked(isLikedFn(track.id));
    else setLiked(false);
  }, [track?.id, isLikedFn]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeNowPlaying();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeNowPlaying]);

  useEffect(() => {
    if (!playlistOpen) return;
    const close = (e: MouseEvent) => {
      if (playlistRef.current && !playlistRef.current.contains(e.target as Node)) {
        setPlaylistOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [playlistOpen]);

  useEffect(() => {
    if (!track?.id || !open) {
      setSimilar([]);
      return;
    }
    let cancelled = false;
    void api.getSimilarTracks(track.id, 8).then((res) => {
      if (!cancelled) setSimilar(res.items.filter((t) => t.id !== track.id));
    });
    return () => {
      cancelled = true;
    };
  }, [track?.id, open]);

  useEffect(() => {
    if (!track) {
      setWaveUrl(null);
      return;
    }
    const preview = getPreviewUrl(track);
    if (preview) {
      setWaveUrl(preview);
      return;
    }
    void api.getPlayback(track.id).then((pb) => {
      setWaveUrl(pb.fallback_url ?? null);
    });
  }, [track?.id]);

  useEffect(() => {
    if (!open) {
      setKaraokeVisible(false);
      setPlaylistOpen(false);
      return;
    }
    if (expandKaraoke && lyricsDoc) {
      setKaraokeVisible(true);
      clearExpandKaraoke();
    }
  }, [open, expandKaraoke, lyricsDoc, clearExpandKaraoke]);

  if (!open || !track) return null;

  const bg = coverGradient(track);
  const similarQueue = [track, ...similar];

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Now playing"
      data-testid="now-playing"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{ background: `${bg}, #121212` }}
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 via-black/50 to-spotify-black" />

      <header className="relative z-10 flex shrink-0 items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={closeNowPlaying}
          className="btn-icon touch-target text-white"
          aria-label="Close now playing"
        >
          <ChevronDown className="h-7 w-7" />
        </button>
        <button
          type="button"
          onClick={() => {
            closeNowPlaying();
            openQueue(true);
          }}
          className="btn-icon touch-target text-white"
          aria-label="Open queue"
        >
          <ListMusic className="h-6 w-6" />
        </button>
      </header>

      <div className="relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
        <div className="mx-auto flex max-w-lg flex-col items-center">
          <CoverArt
            track={track}
            size="xl"
            className="!h-auto !w-full max-w-[min(100%,320px)] aspect-square shadow-2xl"
          />

          <div className="mt-6 w-full text-center">
            <h1 className="text-2xl font-bold leading-tight md:text-3xl">{track.title}</h1>
            <p className="mt-1 text-sm text-white/70">{getArtistName(track)}</p>
            <p className="mt-1 text-xs text-white/50">{getSubtitle(track)}</p>
            <Link
              to={`/track/${track.id}`}
              onClick={closeNowPlaying}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-white/60 hover:text-white hover:underline"
            >
              View remix page
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>

          {meta && (
            <dl className="mt-5 flex w-full flex-wrap justify-center gap-2 text-xs">
              {meta.gachi_power_level != null && (
                <span className="rounded-full bg-black/40 px-3 py-1 backdrop-blur">
                  ♂️ Power {meta.gachi_power_level}
                </span>
              )}
              {meta.deepness_score != null && (
                <span className="rounded-full bg-black/40 px-3 py-1 backdrop-blur">
                  Deepness {meta.deepness_score}
                </span>
              )}
              {meta.bpm != null && (
                <span className="rounded-full bg-black/40 px-3 py-1 backdrop-blur">
                  {meta.bpm} BPM
                </span>
              )}
              {meta.dominant_male_sample && (
                <Link
                  to={`/discover?sample=${encodeURIComponent(meta.dominant_male_sample)}`}
                  onClick={closeNowPlaying}
                  className="rounded-full bg-black/40 px-3 py-1 backdrop-blur hover:bg-black/60"
                >
                  {meta.dominant_male_sample.replace(/_/g, " ")}
                </Link>
              )}
              {meta.mood_tags?.slice(0, 4).map((tag) => (
                <Link
                  key={tag}
                  to={`/discover?mood=${encodeURIComponent(tag)}`}
                  onClick={closeNowPlaying}
                  className="rounded-full bg-black/40 px-3 py-1 backdrop-blur hover:bg-black/60"
                >
                  {tag.replace(/_/g, " ")}
                </Link>
              ))}
            </dl>
          )}

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <RadioStartButton track={track} queue={queue} variant="ghost" label="Start radio" />
          </div>

          {lyricsDoc && (
            <section className="mt-6 w-full rounded-xl bg-black/30 p-3 backdrop-blur">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setKaraokeVisible((v) => !v)}
                  className="flex min-w-0 flex-1 items-center justify-between text-left"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <Mic2 className="h-4 w-4 text-spotify-green" />
                    Karaoke
                  </span>
                  <span className="text-xs text-white/50">
                    {karaokeVisible ? "Hide" : "Show"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={openKaraokeFullscreen}
                  className="btn-icon shrink-0 text-spotify-green"
                  title="Fullscreen karaoke"
                  aria-label="Fullscreen karaoke"
                >
                  <Maximize2 className="h-5 w-5" />
                </button>
              </div>
              {karaokeVisible && <KaraokeLyrics doc={lyricsDoc} trackId={track.id} />}
            </section>
          )}

          {similar.length > 0 && (
            <section className="mt-8 w-full">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-white/60">
                Similar remixes
              </h2>
              <ul className="space-y-1">
                {similar.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => playTrack(t, similarQueue)}
                      className="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-white/10"
                    >
                      <CoverArt track={t} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{t.title}</p>
                        <p className="truncate text-xs text-white/50">
                          {getSubtitle(t)}
                        </p>
                      </div>
                      <span className="text-xs tabular-nums text-white/40">
                        {formatDuration(t.duration_ms)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <footer className="relative z-10 shrink-0 border-t border-white/10 bg-spotify-black/80 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md">
        <div className="mx-auto max-w-lg">
          <WaveformSeekBar
            audioUrl={waveUrl}
            progressMs={progressMs}
            durationMs={duration}
            onSeek={seek}
            large
            className="mb-2"
          />

          <div className="flex items-center justify-center gap-4 py-1">
            <button
              type="button"
              onClick={toggleShuffle}
              className={`btn-icon touch-target ${shuffle ? "btn-icon-active" : "text-white/70"}`}
              aria-label="Shuffle"
            >
              <Shuffle className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={previous}
              className="btn-icon touch-target text-white"
              aria-label="Previous"
            >
              <SkipBack className="h-6 w-6" fill="currentColor" />
            </button>
            <button
              type="button"
              onClick={togglePlay}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-black shadow-lg hover:scale-105"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause className="h-7 w-7" fill="currentColor" />
              ) : (
                <Play className="h-7 w-7 ml-0.5" fill="currentColor" />
              )}
            </button>
            <button
              type="button"
              onClick={next}
              className="btn-icon touch-target text-white"
              aria-label="Next"
            >
              <SkipForward className="h-6 w-6" fill="currentColor" />
            </button>
            <button
              type="button"
              onClick={cycleRepeat}
              className={`btn-icon touch-target relative ${repeat !== "off" ? "btn-icon-active" : "text-white/70"}`}
              aria-label="Repeat"
            >
              <Repeat className="h-5 w-5" />
              {repeat === "one" && (
                <span className="absolute -right-0.5 -top-0.5 text-[8px] font-bold">1</span>
              )}
            </button>
          </div>

          <div className="mt-2 flex items-center justify-center gap-1 sm:gap-2">
            <PlayerComfortMenu />
            <EqPresetMenu />
            <CastButton audio={audio} />
            <DiscordStatusButton />
            {isAuthenticated ? (
              <button
                type="button"
                className={`btn-icon touch-target ${liked ? "text-spotify-green" : ""}`}
                aria-label={liked ? "Unlike" : "Like"}
                onClick={() => void toggleLiked(track.id, true).then(setLiked)}
              >
                <Heart className="h-6 w-6" fill={liked ? "currentColor" : "none"} />
              </button>
            ) : (
              <Link to="/login" className="btn-icon touch-target" onClick={closeNowPlaying}>
                <Heart className="h-6 w-6" />
              </Link>
            )}

            <div className="relative" ref={playlistRef}>
              <button
                type="button"
                className="btn-icon touch-target"
                aria-label="Add to playlist"
                onClick={() => setPlaylistOpen((v) => !v)}
              >
                <ListPlus className="h-6 w-6" />
              </button>
              {playlistOpen && (
                <div className="absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2">
                  <AddToPlaylistMenu track={track} onClose={() => setPlaylistOpen(false)} />
                </div>
              )}
            </div>

            {lyricsDoc ? (
              <>
                <button
                  type="button"
                  className={`btn-icon touch-target ${karaokeVisible ? "text-spotify-green" : ""}`}
                  aria-label="Toggle karaoke lyrics"
                  onClick={() => setKaraokeVisible((v) => !v)}
                >
                  <Mic2 className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  className="btn-icon touch-target text-spotify-green"
                  aria-label="Fullscreen karaoke"
                  onClick={openKaraokeFullscreen}
                >
                  <Maximize2 className="h-5 w-5" />
                </button>
              </>
            ) : (
              <Link
                to="/discover?karaoke=1"
                className="btn-icon touch-target text-white/40"
                title="Browse karaoke tracks"
                onClick={closeNowPlaying}
              >
                <Mic2 className="h-6 w-6" />
              </Link>
            )}

            <button
              type="button"
              onClick={toggleRadioMode}
              className={`btn-icon touch-target ${radioMode ? "text-spotify-green" : ""}`}
              aria-label="Toggle gachi radio"
              title="Gachi radio"
            >
              <Radio className="h-5 w-5" />
            </button>

            <ShareButton path={`/track/${track.id}`} />
          </div>
        </div>
      </footer>
    </div>
  );
}
