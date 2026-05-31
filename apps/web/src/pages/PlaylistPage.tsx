import { Clock, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/api/client";
import { TopBar } from "@/components/layout/TopBar";
import { CoverArt } from "@/components/ui/CoverArt";
import { TrackRow } from "@/components/ui/TrackRow";
import { coverSeedFromPlaylist, playlistTrackIds } from "@/lib/playlists";
import { formatDuration } from "@/lib/tracks";
import { useTracks } from "@/hooks/useTracks";
import { useAuthStore } from "@/store/authStore";
import { useLibraryStore } from "@/store/libraryStore";
import { usePlayerStore } from "@/store/playerStore";
import type { ServerPlaylist } from "@/types";

export function PlaylistPage() {
  const { id } = useParams<{ id: string }>();
  const { tracks } = useTracks();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const cached = useLibraryStore((s) => s.playlists);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const [playlist, setPlaylist] = useState<ServerPlaylist | null>(null);

  useEffect(() => {
    if (!id) return;
    const fromCache = cached.find((p) => p.id === id);
    if (fromCache) {
      setPlaylist(fromCache);
      return;
    }
    if (isAuthenticated) {
      void api.getPlaylist(id).then(setPlaylist).catch(() => setPlaylist(null));
    }
  }, [id, cached, isAuthenticated]);

  const trackIds = playlist ? playlistTrackIds(playlist) : [];
  const playlistTracks = useMemo(
    () =>
      trackIds
        .map((tid) => tracks.find((t) => t.id === tid))
        .filter(Boolean) as typeof tracks,
    [trackIds, tracks],
  );

  const totalMs = playlistTracks.reduce((s, t) => s + t.duration_ms, 0);

  if (!playlist) {
    return (
      <>
        <TopBar />
        <p className="p-8 text-spotify-muted">Playlist not found</p>
      </>
    );
  }

  return (
    <>
      <div className="bg-gradient-gachi">
        <TopBar gradient />
        <div className="flex flex-col gap-6 px-6 pb-6 md:flex-row md:items-end">
          <CoverArt seed={coverSeedFromPlaylist(playlist)} size="xl" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase">Playlist</p>
            <h1 className="mt-2 text-4xl font-black md:text-6xl">{playlist.title}</h1>
            <p className="mt-2 text-sm text-spotify-muted">
              {playlist.description} · {playlistTracks.length} songs,{" "}
              {formatDuration(totalMs)}
            </p>
          </div>
        </div>
      </div>

      <div className="px-6 pb-8">
        <button
          type="button"
          disabled={!playlistTracks.length}
          onClick={() => playlistTracks[0] && playTrack(playlistTracks[0], playlistTracks)}
          className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-spotify-green text-black shadow-xl hover:scale-105 disabled:opacity-50"
        >
          <Play className="h-7 w-7" fill="currentColor" />
        </button>

        <div className="mb-2 grid grid-cols-[16px_4fr_3fr_1fr_40px] gap-4 border-b border-white/10 px-4 pb-2 text-xs uppercase text-spotify-muted">
          <span>#</span>
          <span>Title</span>
          <span className="hidden md:block">Album</span>
          <span className="flex justify-end">
            <Clock className="h-3 w-3" />
          </span>
          <span />
        </div>

        {playlistTracks.map((t, i) => (
          <TrackRow key={t.id} track={t} index={i} queue={playlistTracks} />
        ))}
      </div>
    </>
  );
}
