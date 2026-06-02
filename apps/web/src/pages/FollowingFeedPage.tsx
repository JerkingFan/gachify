import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Play, Rss, UserMinus, UserPlus } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/api/client";
import { TopBar } from "@/components/layout/TopBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { TrackGridSkeleton } from "@/components/ui/Skeleton";
import { TrackCard } from "@/components/ui/TrackCard";
import { useFeed } from "@/hooks/useFeed";
import { useAuthStore } from "@/store/authStore";
import { usePlayerStore } from "@/store/playerStore";
import type { PublicUserSummary } from "@/types";

type Tab = "feed" | "artists";

export function FollowingFeedPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = searchParams.get("tab") === "artists" ? "artists" : "feed";
  const setTab = (t: Tab) => setSearchParams(t === "feed" ? {} : { tab: t });

  const { tracks, loading, error } = useFeed(40);
  const playTrack = usePlayerStore((s) => s.playTrack);

  const [artists, setArtists] = useState<PublicUserSummary[]>([]);
  const [artistsLoading, setArtistsLoading] = useState(false);
  const [artistsError, setArtistsError] = useState<string | null>(null);

  const loadArtists = useCallback(async () => {
    setArtistsLoading(true);
    setArtistsError(null);
    try {
      const res = await api.getFollowing();
      setArtists(res.items ?? []);
    } catch (e) {
      setArtistsError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setArtistsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && tab === "artists") void loadArtists();
  }, [isAuthenticated, tab, loadArtists]);

  const unfollow = async (userId: string) => {
    await api.unfollowUser(userId);
    setArtists((prev) => prev.filter((u) => u.id !== userId));
  };

  if (!isAuthenticated) {
    return (
      <>
        <TopBar title="Following" />
        <EmptyState
          icon={Rss}
          title="Log in to see your feed"
          description="Follow remixers to get new releases in one place."
          actionLabel="Log in"
          actionTo="/login"
        />
      </>
    );
  }

  return (
    <>
      <TopBar title="Following" />
      <div className="flex-1 overflow-y-auto px-4 pb-12 md:px-6">
        <div className="mb-4 mt-2 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-spotify-green text-black">
            <Rss className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-black">Subscriptions</h1>
            <p className="text-sm text-spotify-muted">Feed and artists you follow</p>
          </div>
        </div>

        <div className="mb-6 flex gap-2 border-b border-white/10">
          <TabButton active={tab === "feed"} onClick={() => setTab("feed")}>
            Feed
          </TabButton>
          <TabButton active={tab === "artists"} onClick={() => setTab("artists")}>
            Artists
          </TabButton>
        </div>

        {tab === "feed" && (
          <>
            {loading && <TrackGridSkeleton count={8} />}
            {error && (
              <EmptyState icon={Rss} title="Could not load feed" description={error} />
            )}
            {!loading && !error && tracks.length === 0 && (
              <EmptyState
                icon={UserPlus}
                title="Your feed is empty"
                description="Follow creators on their profile — new releases show up here."
                actionLabel="Find artists"
                actionTo="/following?tab=artists"
              />
            )}
            {!loading && !error && tracks.length > 0 && (
              <>
                <div className="mb-6 flex gap-3">
                  <button
                    type="button"
                    onClick={() => playTrack(tracks[0], tracks)}
                    className="inline-flex items-center gap-2 rounded-full bg-spotify-green px-5 py-2.5 text-sm font-bold text-black hover:scale-[1.02]"
                  >
                    <Play className="h-4 w-4" fill="currentColor" />
                    Play feed
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("artists")}
                    className="inline-flex items-center rounded-full border border-white/30 px-4 py-2 text-sm font-semibold hover:bg-white/10"
                  >
                    Manage artists
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {tracks.map((t) => (
                    <TrackCard key={t.id} track={t} queue={tracks} showRadio />
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {tab === "artists" && (
          <>
            {artistsLoading && (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-lg bg-spotify-highlight" />
                ))}
              </div>
            )}
            {artistsError && (
              <EmptyState icon={Rss} title="Could not load artists" description={artistsError} />
            )}
            {!artistsLoading && !artistsError && artists.length === 0 && (
              <EmptyState
                icon={UserPlus}
                title="Not following anyone yet"
                description="Open a creator profile and tap Follow."
                actionLabel="Discover"
                actionTo="/discover"
              />
            )}
            {!artistsLoading && !artistsError && artists.length > 0 && (
              <ul className="divide-y divide-white/10 rounded-lg border border-white/10">
                {artists.map((u) => (
                  <li
                    key={u.id}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/5"
                  >
                    <Link to={`/profile/${u.id}`} className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{u.display_name || u.handle}</p>
                      {u.handle && (
                        <p className="truncate text-sm text-spotify-muted">@{u.handle}</p>
                      )}
                    </Link>
                    <button
                      type="button"
                      onClick={() => void unfollow(u.id)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/30 px-3 py-1.5 text-xs font-semibold text-spotify-muted hover:border-red-400/50 hover:text-red-300"
                    >
                      <UserMinus className="h-3.5 w-3.5" />
                      Unfollow
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
        active
          ? "border-spotify-green text-white"
          : "border-transparent text-spotify-muted hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
