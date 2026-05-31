import { ChevronDown, ChevronUp, Clock, Pencil, Play, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "@/api/client";
import { TopBar } from "@/components/layout/TopBar";
import { CoverArt } from "@/components/ui/CoverArt";
import { PageMeta } from "@/components/ui/PageMeta";
import { ShareButton } from "@/components/ui/ShareButton";
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
  const navigate = useNavigate();
  const { tracks } = useTracks();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const cached = useLibraryStore((s) => s.playlists);
  const updatePlaylist = useLibraryStore((s) => s.updatePlaylist);
  const deletePlaylist = useLibraryStore((s) => s.deletePlaylist);
  const removeTrackFromPlaylist = useLibraryStore((s) => s.removeTrackFromPlaylist);
  const setPlaylistTracks = useLibraryStore((s) => s.setPlaylistTracks);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const [playlist, setPlaylist] = useState<ServerPlaylist | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    const fromCache = cached.find((p) => p.id === id);
    if (fromCache) {
      setPlaylist(fromCache);
      return;
    }
    if (isAuthenticated) {
      void api.getPlaylist(id).then(setPlaylist).catch(() => setPlaylist(null));
    } else {
      setPlaylist(null);
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

  const isOwner = Boolean(user?.id && playlist?.owner_id && user.id === playlist.owner_id);
  const totalMs = playlistTracks.reduce((s, t) => s + t.duration_ms, 0);

  const startEdit = () => {
    if (!playlist) return;
    setEditTitle(playlist.title);
    setEditDesc(playlist.description);
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!playlist || !editTitle.trim()) return;
    setBusy(true);
    try {
      const updated = await updatePlaylist(playlist.id, {
        title: editTitle.trim(),
        description: editDesc.trim(),
      });
      setPlaylist(updated);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!playlist || !window.confirm(`Delete playlist "${playlist.title}"?`)) return;
    setBusy(true);
    try {
      await deletePlaylist(playlist.id);
      navigate("/library");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (trackId: string) => {
    if (!playlist) return;
    setBusy(true);
    try {
      const updated = await removeTrackFromPlaylist(playlist.id, trackId);
      setPlaylist(updated);
    } finally {
      setBusy(false);
    }
  };

  const moveTrack = async (index: number, direction: -1 | 1) => {
    if (!playlist) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= trackIds.length) return;
    const ids = [...trackIds];
    const [item] = ids.splice(index, 1);
    ids.splice(nextIndex, 0, item);
    setBusy(true);
    try {
      const updated = await setPlaylistTracks(playlist.id, ids);
      setPlaylist(updated);
    } finally {
      setBusy(false);
    }
  };

  if (!playlist) {
    return (
      <>
        <TopBar />
        <p className="p-8 text-spotify-muted">Playlist not found</p>
      </>
    );
  }

  const sharePath = `/playlist/${playlist.id}`;
  const pageUrl =
    typeof window !== "undefined" ? `${window.location.origin}${sharePath}` : sharePath;

  return (
    <>
      <PageMeta
        title={playlist.title}
        description={playlist.description || `${playlistTracks.length} tracks on Gachify`}
        url={pageUrl}
      />
      <div className="bg-gradient-gachi">
        <TopBar gradient />
        <div className="flex flex-col gap-6 px-6 pb-6 md:flex-row md:items-end">
          <CoverArt seed={coverSeedFromPlaylist(playlist)} size="xl" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase">Playlist</p>
            {editing ? (
              <div className="mt-2 space-y-3">
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full rounded-md bg-spotify-highlight px-3 py-2 text-2xl font-black md:text-4xl"
                />
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={2}
                  placeholder="Description"
                  className="w-full rounded-md bg-spotify-highlight px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveEdit()}
                    className="rounded-full bg-spotify-green px-4 py-1 text-sm font-bold text-black"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="rounded-full border border-white/30 px-4 py-1 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h1 className="mt-2 text-4xl font-black md:text-6xl">{playlist.title}</h1>
                <p className="mt-2 text-sm text-spotify-muted">
                  {playlist.description && `${playlist.description} · `}
                  {playlistTracks.length} songs, {formatDuration(totalMs)}
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="px-6 pb-8">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!playlistTracks.length}
            onClick={() => playlistTracks[0] && playTrack(playlistTracks[0], playlistTracks)}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-spotify-green text-black shadow-xl hover:scale-105 disabled:opacity-50"
          >
            <Play className="h-7 w-7" fill="currentColor" />
          </button>
          <ShareButton path={sharePath} />
          {isOwner && !editing && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={startEdit}
                className="flex items-center gap-2 rounded-full border border-white/30 px-4 py-2 text-sm font-semibold hover:bg-white/10"
              >
                <Pencil className="h-4 w-4" />
                Edit
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleDelete()}
                className="flex items-center gap-2 rounded-full border border-red-500/50 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-900/30"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </>
          )}
        </div>

        <div className="mb-2 grid grid-cols-[16px_4fr_3fr_1fr_80px] gap-4 border-b border-white/10 px-4 pb-2 text-xs uppercase text-spotify-muted">
          <span>#</span>
          <span>Title</span>
          <span className="hidden md:block">Album</span>
          <span className="flex justify-end">
            <Clock className="h-3 w-3" />
          </span>
          <span />
        </div>

        {playlistTracks.map((t, i) => (
          <div key={t.id} className="group relative">
            <TrackRow track={t} index={i} queue={playlistTracks} />
            {isOwner && (
              <div className="absolute right-2 top-1/2 flex -translate-y-1/2 gap-1 opacity-0 group-hover:opacity-100">
                <button
                  type="button"
                  disabled={busy || i === 0}
                  aria-label="Move up"
                  className="btn-icon disabled:opacity-30"
                  onClick={(e) => {
                    e.stopPropagation();
                    void moveTrack(i, -1);
                  }}
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={busy || i === playlistTracks.length - 1}
                  aria-label="Move down"
                  className="btn-icon disabled:opacity-30"
                  onClick={(e) => {
                    e.stopPropagation();
                    void moveTrack(i, 1);
                  }}
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={busy}
                  aria-label="Remove from playlist"
                  className="btn-icon text-red-300"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleRemove(t.id);
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
