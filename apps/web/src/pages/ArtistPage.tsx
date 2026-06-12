import { Play, UserCircle, UserPlus, UserMinus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/api/client";
import { TopBar } from "@/components/layout/TopBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageScroll } from "@/components/ui/PageScroll";
import { PageHeaderSkeleton, TrackRowSkeleton } from "@/components/ui/Skeleton";
import { TrackRow } from "@/components/ui/TrackRow";
import { useAuthStore } from "@/store/authStore";
import { usePlayerStore } from "@/store/playerStore";
import type { Track, User } from "@/types";

export function ArtistPage() {
  const { id } = useParams<{ id: string }>();
  const [artist, setArtist] = useState<User | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const me = useAuthStore((s) => s.user);
  const playTrack = usePlayerStore((s) => s.playTrack);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    void (async () => {
      try {
        const u = await api.getUser(id);
        setArtist(u);
        const res = await api.getTracks({
          creator_id: id,
          limit: 100,
          status: "published",
        });
        setTracks(res.items);
        if (isAuthenticated) {
          const fl = await api.getFollowing();
          setFollowing(fl.user_ids.includes(id));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Artist not found");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isAuthenticated]);

  if (loading) {
    return (
      <PageScroll>
        <TopBar />
        <PageHeaderSkeleton />
        <div className="px-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <TrackRowSkeleton key={i} />
          ))}
        </div>
      </PageScroll>
    );
  }

  if (error || !artist) {
    return (
      <PageScroll>
        <TopBar />
        <EmptyState
          icon={UserCircle}
          title="Creator not found"
          description={error ?? undefined}
          actionLabel="Browse home"
          actionTo="/"
        />
      </PageScroll>
    );
  }

  const published = tracks.filter((t) => t.status === "published");

  return (
    <PageScroll>
      <div className="bg-gradient-gachi">
        <TopBar gradient />
        <div className="flex flex-col gap-6 px-6 pb-8 md:flex-row md:items-end">
          <div className="flex h-56 w-56 shrink-0 items-center justify-center rounded-full bg-spotify-highlight text-6xl font-bold text-spotify-green shadow-2xl">
            {artist.display_name[0]?.toUpperCase() ?? "♂"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase">Remixer</p>
            <h1 className="mt-2 text-4xl font-black md:text-6xl">{artist.display_name}</h1>
            <p className="mt-2 text-spotify-muted">@{artist.handle}</p>
            <Link
              to={`/profile/${artist.id}`}
              className="text-sm text-spotify-green hover:underline"
            >
              Full profile
            </Link>
            <p className="mt-1 text-sm text-spotify-muted">
              {published.length} public remix{published.length === 1 ? "" : "es"}
            </p>
            {published.length > 0 && (
              <button
                type="button"
                onClick={() => playTrack(published[0], published)}
                className="mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-spotify-green text-black shadow-xl hover:scale-105"
              >
                <Play className="h-7 w-7" fill="currentColor" />
              </button>
            )}
            {isAuthenticated && me?.id !== artist.id && (
              <button
                type="button"
                disabled={followBusy}
                onClick={() => {
                  setFollowBusy(true);
                  void (following ? api.unfollowUser(artist.id) : api.followUser(artist.id))
                    .then(() => setFollowing(!following))
                    .finally(() => setFollowBusy(false));
                }}
                className="mt-6 flex items-center gap-2 rounded-full border border-white/30 px-5 py-2 text-sm font-semibold hover:bg-white/10"
              >
                {following ? (
                  <>
                    <UserMinus className="h-4 w-4" /> Following
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" /> Follow
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="px-6 pb-12">
        {published.length === 0 ? (
          <EmptyState
            icon={UserCircle}
            title="No published remixes"
            description="This creator hasn't published anything yet."
          />
        ) : (
          <>
            <h2 className="mb-4 mt-6 text-xl font-bold">Popular</h2>
            {published.map((t, i) => (
              <TrackRow key={t.id} track={t} index={i} queue={published} />
            ))}
          </>
        )}
      </div>
    </PageScroll>
  );
}
