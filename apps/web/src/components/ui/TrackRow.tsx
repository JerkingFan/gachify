import { Heart, Mic2, MoreHorizontal } from "lucide-react";
import { trackHasLyricsFromTrack } from "@/lib/lyrics";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { formatDuration, getArtistName } from "@/lib/tracks";
import { useAuthStore } from "@/store/authStore";
import { useLibraryStore } from "@/store/libraryStore";
import { usePlayerStore } from "@/store/playerStore";
import type { Track } from "@/types";
import { AddToPlaylistMenu } from "./AddToPlaylistMenu";
import { CoverArt } from "./CoverArt";
import { PlayButton } from "./PlayButton";

interface TrackRowProps {
  track: Track;
  index: number;
  queue: Track[];
  showIndex?: boolean;
}

export function TrackRow({ track, index, queue, showIndex = true }: TrackRowProps) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLikedFn = useLibraryStore((s) => s.isLiked);
  const toggleLiked = useLibraryStore((s) => s.toggleLiked);
  const current = usePlayerStore((s) => s.currentTrack);
  const playing = usePlayerStore((s) => s.isPlaying);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const [liked, setLiked] = useState(() => isLikedFn(track.id));
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const isCurrent = current?.id === track.id;
  const isActive = isCurrent && playing;
  const hasKaraoke = trackHasLyricsFromTrack(track);

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCurrent) togglePlay();
    else playTrack(track, queue);
  };

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const nowLiked = await toggleLiked(track.id, isAuthenticated);
      setLiked(nowLiked);
    } catch {
      /* guest or API error */
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => playTrack(track, queue)}
      onKeyDown={(e) => e.key === "Enter" && playTrack(track, queue)}
      className={`group grid grid-cols-[16px_4fr_3fr_1fr_40px] items-center gap-4 rounded-md border-b border-white/5 px-4 py-2 text-sm hover:bg-white/10 ${
        isCurrent ? "text-spotify-green" : "text-spotify-muted"
      }`}
    >
      <div className="flex justify-center">
        {showIndex ? (
          <>
            <span className="group-hover:hidden">{isActive ? "🔊" : index + 1}</span>
            <span className="hidden group-hover:block">
              <PlayButton size="sm" onClick={handlePlay} isPlaying={isActive} className="!h-4 !w-4 !opacity-100" />
            </span>
          </>
        ) : null}
      </div>

      <div className="flex min-w-0 items-center gap-3">
        <CoverArt track={track} size="sm" />
        <div className="min-w-0">
          <Link
            to={`/track/${track.id}`}
            onClick={(e) => e.stopPropagation()}
            className={`flex items-center gap-1 truncate hover:underline ${isCurrent ? "text-spotify-green" : "text-white"}`}
          >
            <span className="truncate">{track.title}</span>
            {hasKaraoke && (
              <Mic2 className="h-3.5 w-3.5 shrink-0 text-spotify-green" aria-label="Karaoke" />
            )}
          </Link>
          <p className="truncate text-xs text-spotify-muted">{getArtistName(track)}</p>
        </div>
      </div>

      <div className="hidden truncate md:block">{getArtistName(track)}</div>
      <div className="text-right tabular-nums">{formatDuration(track.duration_ms)}</div>

      <div className="relative flex justify-end gap-1 opacity-0 group-hover:opacity-100">
        <button
          type="button"
          className={`btn-icon ${liked ? "text-spotify-green" : ""}`}
          onClick={handleLike}
          aria-label="Like"
          title={isAuthenticated ? "Like" : "Like (local — log in to sync)"}
        >
          <Heart className="h-4 w-4" fill={liked ? "currentColor" : "none"} />
        </button>
        <button
          type="button"
          className="btn-icon"
          aria-label="More"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {menuOpen && (
          <div
            ref={menuRef}
            className="absolute right-0 top-full z-50 mt-1"
            onClick={(e) => e.stopPropagation()}
          >
            <AddToPlaylistMenu track={track} onClose={() => setMenuOpen(false)} />
          </div>
        )}
      </div>
    </div>
  );
}
