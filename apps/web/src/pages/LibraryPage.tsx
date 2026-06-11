import { Globe, Heart, Library, ListMusic, Plus, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PlaylistImportPanel } from "@/components/playlist/PlaylistImportPanel";
import { TopBar } from "@/components/layout/TopBar";
import { PlaylistCard } from "@/components/ui/PlaylistCard";
import { TrackRow } from "@/components/ui/TrackRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { coverSeedFromPlaylist, sortPlaylists } from "@/lib/playlists";
import { getLocale, t } from "@/lib/i18n";
import { useTracks } from "@/hooks/useTracks";
import { useAuthStore } from "@/store/authStore";
import { useLibraryStore } from "@/store/libraryStore";
import type { LikedSortKey, PlaylistSortKey } from "@/types";

export function LibraryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { tracks, loading } = useTracks();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const playlists = useLibraryStore((s) => s.playlists);
  const createPlaylist = useLibraryStore((s) => s.createPlaylist);
  const likedIds = useLibraryStore((s) => s.likedIds);
  const likedOrder = useLibraryStore((s) => s.likedOrder);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPublic, setNewPublic] = useState(false);
  const [newCollab, setNewCollab] = useState(false);
  const [sortKey, setSortKey] = useState<PlaylistSortKey>("updated");
  const [likedSort, setLikedSort] = useState<LikedSortKey>("recent");
  const [creating, setCreating] = useState(false);
  const locale = getLocale();

  useEffect(() => {
    if (searchParams.get("create") === "1" && isAuthenticated) {
      setShowCreate(true);
      searchParams.delete("create");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, isAuthenticated]);

  const sortedPlaylists = useMemo(
    () => sortPlaylists(playlists, sortKey),
    [playlists, sortKey],
  );

  const sortedLiked = useMemo(() => {
    const byId = new Map(tracks.filter((t) => likedIds.has(t.id)).map((t) => [t.id, t]));
    const list = likedOrder.map((id) => byId.get(id)).filter(Boolean) as typeof tracks;
    for (const t of tracks) {
      if (likedIds.has(t.id) && !list.some((x) => x.id === t.id)) list.push(t);
    }
    if (likedSort === "title") {
      return [...list].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
    }
    if (likedSort === "duration") {
      return [...list].sort((a, b) => b.duration_ms - a.duration_ms);
    }
    return list;
  }, [tracks, likedIds, likedOrder, likedSort]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !isAuthenticated) return;
    setCreating(true);
    try {
      await createPlaylist(newTitle.trim(), newDesc.trim(), newPublic, newCollab);
      setNewTitle("");
      setNewDesc("");
      setNewPublic(false);
      setNewCollab(false);
      setShowCreate(false);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <TopBar title="Your Library" />
      <div className="flex-1 overflow-y-auto px-6 pb-8">
        {!isAuthenticated && (
          <div className="mb-6 rounded-lg bg-spotify-highlight p-4 text-sm">
            <p className="text-spotify-muted">
              Гостевой режим: лайки и плейлисты сохраняются на этом устройстве.{" "}
              <Link to="/login" className="font-semibold text-white underline">
                Войти
              </Link>{" "}
              — чтобы синхронизировать между устройствами.
            </p>
          </div>
        )}

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <button
            type="button"
            className="rounded-full bg-white px-4 py-1 text-sm font-semibold text-black"
          >
            Playlists
          </button>
          {isAuthenticated && (
            <button
              type="button"
              onClick={() => setShowCreate((v) => !v)}
              className="flex items-center gap-2 rounded-full bg-spotify-green px-4 py-1.5 text-sm font-bold text-black"
            >
              <Plus className="h-4 w-4" />
              New playlist
            </button>
          )}
        </div>

        {showCreate && isAuthenticated && (
          <form
            onSubmit={(e) => void handleCreate(e)}
            className="mb-6 rounded-lg bg-spotify-elevated p-4"
          >
            <input
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Playlist title"
              className="mb-3 w-full rounded-md bg-spotify-highlight px-3 py-2"
            />
            <textarea
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="mb-3 w-full rounded-md bg-spotify-highlight px-3 py-2 text-sm"
            />
            <label className="mb-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={newPublic}
                onChange={(e) => setNewPublic(e.target.checked)}
                className="accent-spotify-green"
              />
              <Globe className="h-4 w-4" />
              Public — visible in community &amp; shareable link
            </label>
            <label className="mb-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={newCollab}
                onChange={(e) => setNewCollab(e.target.checked)}
                className="accent-spotify-green"
              />
              <Users className="h-4 w-4" />
              Collaborative — invite link for friends to edit
            </label>
            <button
              type="submit"
              disabled={creating}
              className="rounded-full bg-spotify-green px-5 py-2 text-sm font-bold text-black disabled:opacity-50"
            >
              {creating ? "Creating…" : "Create"}
            </button>
          </form>
        )}

        {isAuthenticated && <PlaylistImportPanel />}

        {isAuthenticated && playlists.length > 0 && (
          <div className="mb-4 flex items-center gap-2">
            <label htmlFor="playlist-sort" className="text-sm text-spotify-muted">
              Sort
            </label>
            <select
              id="playlist-sort"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as PlaylistSortKey)}
              className="rounded-full bg-spotify-highlight px-3 py-1 text-sm font-semibold"
            >
              <option value="updated">Recently updated</option>
              <option value="created">Recently created</option>
              <option value="title">A–Z</option>
            </select>
          </div>
        )}

        {playlists.length === 0 && !loading ? (
          <EmptyState
            icon={Library}
            title="No playlists"
            description="Your playlists will appear here after you log in."
            actionLabel={isAuthenticated ? undefined : "Log in"}
            actionTo={isAuthenticated ? undefined : "/login"}
          />
        ) : (
          <div className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {sortedPlaylists.map((pl) => (
              <PlaylistCard
                key={pl.id}
                id={pl.id}
                title={pl.title}
                description={pl.description}
                coverSeed={coverSeedFromPlaylist(pl)}
              />
            ))}
          </div>
        )}

        <section>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <ListMusic className="h-6 w-6 text-spotify-green" />
              <h2 className="text-2xl font-bold">{t("library.liked", locale)} ♂️</h2>
              <span className="text-spotify-muted">{sortedLiked.length} tracks</span>
            </div>
            {sortedLiked.length > 0 && (
              <select
                value={likedSort}
                onChange={(e) => setLikedSort(e.target.value as LikedSortKey)}
                className="ml-auto rounded-full bg-spotify-highlight px-3 py-1 text-sm font-semibold"
                aria-label="Sort liked tracks"
              >
                <option value="recent">{t("library.sort.recent", locale)}</option>
                <option value="title">{t("library.sort.title", locale)}</option>
                <option value="duration">{t("library.sort.duration", locale)}</option>
              </select>
            )}
          </div>
          {sortedLiked.length === 0 ? (
            <EmptyState
              icon={Heart}
              title="Save tracks you love"
              description="Click the heart on any remix while listening."
              actionLabel="Find music"
              actionTo="/search"
            />
          ) : (
            sortedLiked.map((t, i) => (
              <TrackRow key={t.id} track={t} index={i} queue={sortedLiked} />
            ))
          )}
        </section>
      </div>
    </>
  );
}
