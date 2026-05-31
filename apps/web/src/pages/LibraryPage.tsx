import { Heart, Library, ListMusic } from "lucide-react";
import { Link } from "react-router-dom";
import { TopBar } from "@/components/layout/TopBar";
import { PlaylistCard } from "@/components/ui/PlaylistCard";
import { TrackRow } from "@/components/ui/TrackRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { coverSeedFromPlaylist } from "@/lib/playlists";
import { useTracks } from "@/hooks/useTracks";
import { useAuthStore } from "@/store/authStore";
import { useLibraryStore } from "@/store/libraryStore";

export function LibraryPage() {
  const { tracks, loading } = useTracks();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const playlists = useLibraryStore((s) => s.playlists);
  const likedIds = useLibraryStore((s) => s.likedIds);
  const liked = tracks.filter((t) => likedIds.has(t.id));

  return (
    <>
      <TopBar title="Your Library" />
      <div className="flex-1 overflow-y-auto px-6 pb-8">
        {!isAuthenticated && (
          <div className="mb-6 rounded-lg bg-spotify-highlight p-4 text-sm">
            <p className="text-spotify-muted">
              <Link to="/login" className="font-semibold text-white underline">
                Log in
              </Link>{" "}
              to sync liked tracks and playlists across devices.
            </p>
          </div>
        )}

        <div className="mb-6 flex gap-2 border-b border-white/10 pb-4">
          <button
            type="button"
            className="rounded-full bg-white px-4 py-1 text-sm font-semibold text-black"
          >
            Playlists
          </button>
        </div>

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
            {playlists.map((pl) => (
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
          <div className="mb-4 flex items-center gap-2">
            <ListMusic className="h-6 w-6 text-spotify-green" />
            <h2 className="text-2xl font-bold">Liked ♂️ Songs</h2>
            <span className="text-spotify-muted">{liked.length} tracks</span>
          </div>
          {liked.length === 0 ? (
            <EmptyState
              icon={Heart}
              title="Save tracks you love"
              description="Click the heart on any remix while listening."
              actionLabel="Find music"
              actionTo="/search"
            />
          ) : (
            liked.map((t, i) => (
              <TrackRow key={t.id} track={t} index={i} queue={liked} />
            ))
          )}
        </section>
      </div>
    </>
  );
}
