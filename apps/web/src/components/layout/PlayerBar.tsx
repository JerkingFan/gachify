import {
  Heart,
  Laptop2,
  ListMusic,
  Pause,
  Play,
  Radio,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { KaraokeButton } from "@/components/karaoke/KaraokeButton";
import { formatDuration, getSubtitle } from "@/lib/tracks";
import { useAuthStore } from "@/store/authStore";
import { useLibraryStore } from "@/store/libraryStore";
import { usePlayerStore } from "@/store/playerStore";
import { useUIStore } from "@/store/uiStore";
import { CoverArt } from "@/components/ui/CoverArt";

type PlayerBarProps = {
  hasLyrics?: boolean;
};

export function PlayerBar({ hasLyrics = false }: PlayerBarProps) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLikedFn = useLibraryStore((s) => s.isLiked);
  const toggleLiked = useLibraryStore((s) => s.toggleLiked);
  const track = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const progressMs = usePlayerStore((s) => s.progressMs);
  const volume = usePlayerStore((s) => s.volume);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const repeat = usePlayerStore((s) => s.repeat);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const next = usePlayerStore((s) => s.next);
  const previous = usePlayerStore((s) => s.previous);
  const seek = usePlayerStore((s) => s.seek);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const cycleRepeat = usePlayerStore((s) => s.cycleRepeat);
  const radioMode = usePlayerStore((s) => s.radioMode);
  const toggleRadioMode = usePlayerStore((s) => s.toggleRadioMode);
  const toggleQueuePanel = useUIStore((s) => s.toggleQueuePanel);
  const openNowPlaying = useUIStore((s) => s.openNowPlaying);
  const queuePanelOpen = useUIStore((s) => s.queuePanelOpen);
  const queueLen = usePlayerStore((s) => s.queue.length);

  const [liked, setLiked] = useState(false);
  const duration = track?.duration_ms ?? 0;
  useEffect(() => {
    if (track) setLiked(isLikedFn(track.id));
    else setLiked(false);
  }, [track?.id, isLikedFn]);

  const transport = (
    <div className="flex items-center justify-center gap-3 md:gap-4">
      <button
        type="button"
        onClick={toggleShuffle}
        className={`btn-icon touch-target hidden sm:flex ${shuffle ? "btn-icon-active" : ""}`}
      >
        <Shuffle className="h-4 w-4" />
      </button>
      <button type="button" onClick={previous} className="btn-icon touch-target">
        <SkipBack className="h-5 w-5 md:h-5" fill="currentColor" />
      </button>
      <button
        type="button"
        onClick={togglePlay}
        disabled={!track}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-black hover:scale-105 disabled:opacity-50 md:h-9 md:w-9"
      >
        {isPlaying ? (
          <Pause className="h-5 w-5" fill="currentColor" />
        ) : (
          <Play className="h-5 w-5 ml-0.5" fill="currentColor" />
        )}
      </button>
      <button type="button" onClick={next} className="btn-icon touch-target">
        <SkipForward className="h-5 w-5" fill="currentColor" />
      </button>
      <button
        type="button"
        onClick={cycleRepeat}
        className={`btn-icon touch-target relative hidden sm:flex ${repeat !== "off" ? "btn-icon-active" : ""}`}
      >
        <Repeat className="h-4 w-4" />
        {repeat === "one" && (
          <span className="absolute -right-0.5 -top-0.5 text-[8px] font-bold">1</span>
        )}
      </button>
      <button
        type="button"
        onClick={toggleRadioMode}
        title="Gachi radio — auto-pick similar next track"
        className={`btn-icon touch-target hidden sm:flex ${radioMode ? "btn-icon-active text-spotify-green" : ""}`}
      >
        <Radio className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <footer data-testid="player-bar" className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-spotify-highlight px-3 py-2 md:static md:grid md:h-[90px] md:grid-cols-3 md:items-center md:px-4 md:py-0">
      {/* Mobile layout */}
      <div className="flex flex-col gap-2 md:hidden">
        <div className="flex items-center gap-3">
          {track ? (
            <>
              <button
                type="button"
                onClick={openNowPlaying}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                aria-label="Open now playing"
              >
                <CoverArt track={track} size="sm" className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-white">
                    {track.title}
                  </span>
                  <span className="block truncate text-xs text-spotify-muted">
                    {getSubtitle(track)}
                  </span>
                </div>
              </button>
              {isAuthenticated ? (
                <button
                  type="button"
                  className={`btn-icon touch-target shrink-0 ${liked ? "text-spotify-green" : ""}`}
                  onClick={() =>
                    track && void toggleLiked(track.id, true).then(setLiked)
                  }
                >
                  <Heart className="h-5 w-5" fill={liked ? "currentColor" : "none"} />
                </button>
              ) : null}
              <KaraokeButton hasLyrics={hasLyrics} size="lg" />
              <button
                type="button"
                onClick={togglePlay}
                disabled={!track}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-black disabled:opacity-50"
              >
                {isPlaying ? (
                  <Pause className="h-5 w-5" fill="currentColor" />
                ) : (
                  <Play className="h-5 w-5 ml-0.5" fill="currentColor" />
                )}
              </button>
            </>
          ) : (
            <p className="text-sm text-spotify-muted">Select a track to play</p>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-spotify-muted">
          <span className="w-9 text-right tabular-nums">{formatDuration(progressMs)}</span>
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={progressMs}
            disabled={!track}
            onChange={(e) => seek(Number(e.target.value))}
            className="player-scrubber h-2 flex-1 accent-white disabled:opacity-40"
          />
          <span className="w-9 tabular-nums">{formatDuration(duration)}</span>
        </div>
      </div>

      {/* Desktop layout */}
      <div className="hidden min-w-0 items-center gap-3 md:flex">
        {track ? (
          <>
            <button
              type="button"
              onClick={openNowPlaying}
              className="flex min-w-0 items-center gap-3 text-left hover:opacity-90"
              aria-label="Open now playing"
            >
              <CoverArt track={track} size="sm" className="shrink-0" />
              <div className="min-w-0">
                <span className="block truncate text-sm font-medium text-white">
                  {track.title}
                </span>
                <span className="block truncate text-xs text-spotify-muted">
                  {getSubtitle(track)}
                </span>
              </div>
            </button>
            {isAuthenticated ? (
              <button
                type="button"
                className={`btn-icon ml-2 ${liked ? "text-spotify-green" : ""}`}
                onClick={() =>
                  track && void toggleLiked(track.id, true).then(setLiked)
                }
              >
                <Heart className="h-4 w-4" fill={liked ? "currentColor" : "none"} />
              </button>
            ) : (
              <Link to="/login" className="btn-icon ml-2" title="Log in to like">
                <Heart className="h-4 w-4" />
              </Link>
            )}
            <KaraokeButton hasLyrics={hasLyrics} />
          </>
        ) : (
          <p className="text-sm text-spotify-muted">Select a track to play</p>
        )}
      </div>

      <div className="hidden max-w-[720px] flex-col items-center justify-center gap-2 justify-self-center md:flex">
        {transport}
        <div className="flex w-full max-w-md items-center gap-2 text-xs text-spotify-muted">
          <span className="w-10 text-right tabular-nums">{formatDuration(progressMs)}</span>
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={progressMs}
            disabled={!track}
            onChange={(e) => seek(Number(e.target.value))}
            className="player-scrubber h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/30 accent-white disabled:opacity-40"
          />
          <span className="w-10 tabular-nums">{formatDuration(duration)}</span>
        </div>
      </div>

      <div className="hidden items-center justify-end gap-2 md:flex">
        <button
          type="button"
          onClick={toggleQueuePanel}
          className={`btn-icon ${queuePanelOpen ? "text-spotify-green" : ""}`}
          aria-label="Queue"
          title={`Queue (${queueLen})`}
        >
          <ListMusic className="h-4 w-4" />
        </button>
        <button type="button" className="btn-icon hidden lg:flex">
          <Laptop2 className="h-4 w-4" />
        </button>
        <div className="hidden items-center gap-2 sm:flex">
          <button
            type="button"
            className="btn-icon"
            onClick={() => setVolume(volume > 0 ? 0 : 0.8)}
          >
            {volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="w-24 accent-white"
          />
        </div>
      </div>
    </footer>
  );
}
