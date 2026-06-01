import { Music2, Play, ServerCrash } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { PlaylistCard } from "@/components/ui/PlaylistCard";
import { coverSeedFromPlaylist } from "@/lib/playlists";
import type { ServerPlaylist } from "@/types";
import { Section } from "@/components/ui/Section";
import { TrackCard } from "@/components/ui/TrackCard";
import { TopBar } from "@/components/layout/TopBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { HeroSkeleton, TrackGridSkeleton } from "@/components/ui/Skeleton";
import { parseGachiMeta } from "@/lib/tracks";
import { getRecentIds } from "@/lib/storage";
import { useTracks } from "@/hooks/useTracks";
import { useTrendingTracks } from "@/hooks/useTrendingTracks";
import { useFeed } from "@/hooks/useFeed";
import { useAuthStore } from "@/store/authStore";
import { usePlayerStore } from "@/store/playerStore";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function HomePage() {
  const { tracks, loading, error, hasMore, loadMore, loadingMore, refresh } = useTracks();
  const { tracks: trending, loading: trendingLoading } = useTrendingTracks(10);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { tracks: feedTracks, loading: feedLoading } = useFeed(10);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const setQueue = usePlayerStore((s) => s.setQueue);
  const [publicPlaylists, setPublicPlaylists] = useState<ServerPlaylist[]>([]);

  useEffect(() => {
    void api.getPublicPlaylists(12).then((r) => setPublicPlaylists(r.items));
  }, []);

  const recentIds = getRecentIds();
  const recent = recentIds
    .map((id) => tracks.find((t) => t.id === id))
    .filter(Boolean) as typeof tracks;

  const byPower = [...tracks].sort((a, b) => {
    const pa = parseGachiMeta(a).gachi_power_level ?? 0;
    const pb = parseGachiMeta(b).gachi_power_level ?? 0;
    return pb - pa;
  });

  const deep = [...tracks]
    .filter((t) => (parseGachiMeta(t).deepness_score ?? 0) >= 7)
    .slice(0, 10);

  const handlePlayAll = () => {
    if (!tracks.length) return;
    setQueue(tracks, 0);
    playTrack(tracks[0], tracks);
  };

  return (
    <>
      <TopBar gradient />
      <div className="flex-1 overflow-y-auto pb-8">
        {loading ? (
          <>
            <HeroSkeleton />
            <div className="px-6 pt-6">
              <TrackGridSkeleton count={10} />
            </div>
          </>
        ) : (
          <>
            <div className="bg-gradient-gachi px-6 pb-6 pt-4">
              <p className="text-sm font-semibold text-white">{greeting()}</p>
              <div className="mt-4 flex items-end justify-between gap-4">
                <h1 className="text-5xl font-black tracking-tight md:text-7xl">
                  Dungeon Mix
                </h1>
                <button
                  type="button"
                  onClick={handlePlayAll}
                  disabled={!tracks.length}
                  className="mb-2 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-spotify-green text-black shadow-xl hover:scale-105 disabled:opacity-50"
                >
                  <Play className="h-7 w-7" fill="currentColor" />
                </button>
              </div>
            </div>

            <div className="px-6">
              {error && (
                <EmptyState
                  icon={ServerCrash}
                  title="Can't reach the API"
                  description={`${error} — run docker compose up -d && go run ./cmd/api`}
                  actionLabel="Retry"
                  onAction={() => refresh()}
                />
              )}

              {!error && tracks.length === 0 && (
                <EmptyState
                  icon={Music2}
                  title="No remixes yet"
                  description="Seed the database or upload your first gachi remix."
                  actionLabel="Upload remix"
                  actionTo="/upload"
                />
              )}

              {!error && tracks.length > 0 && (
                <>
                  {recent.length > 0 && (
                    <Section title="Recently played">
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                        {recent.slice(0, 5).map((t) => (
                          <TrackCard key={t.id} track={t} queue={tracks} />
                        ))}
                      </div>
                    </Section>
                  )}

                  {isAuthenticated && feedTracks.length > 0 && (
                    <Section title="From artists you follow" subtitle="Your subscription feed">
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                        {(feedLoading ? tracks : feedTracks).slice(0, 10).map((t) => (
                          <TrackCard key={t.id} track={t} queue={feedTracks} />
                        ))}
                      </div>
                    </Section>
                  )}

                  <Section title="Trending gachi remixes" subtitle="By play count — updated live">
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                      {(trendingLoading ? tracks : trending).slice(0, 10).map((t) => (
                        <TrackCard key={t.id} track={t} queue={trending.length ? trending : tracks} />
                      ))}
                    </div>
                  </Section>

                  {publicPlaylists.length > 0 && (
                    <Section title="Public playlists" subtitle="Community mixes">
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                        {publicPlaylists.map((pl) => (
                          <PlaylistCard
                            key={pl.id}
                            id={pl.id}
                            title={pl.title}
                            description={
                              pl.owner_display_name
                                ? `by ${pl.owner_display_name}`
                                : pl.description
                            }
                            coverSeed={coverSeedFromPlaylist(pl)}
                          />
                        ))}
                      </div>
                    </Section>
                  )}

                  {byPower.length > 0 && (
                    <Section title="Maximum ♂️ power level">
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                        {byPower.slice(0, 5).map((t) => (
                          <TrackCard key={t.id} track={t} queue={byPower} />
                        ))}
                      </div>
                    </Section>
                  )}

                  {deep.length > 0 && (
                    <Section title="Deep dark fantasy" subtitle="deepness_score ≥ 7">
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                        {deep.map((t) => (
                          <TrackCard key={t.id} track={t} queue={deep} />
                        ))}
                      </div>
                    </Section>
                  )}

                  {hasMore && (
                    <div className="mt-8 flex justify-center pb-4">
                      <button
                        type="button"
                        onClick={loadMore}
                        disabled={loadingMore}
                        className="rounded-full border border-white/30 px-8 py-2 text-sm font-semibold text-white hover:border-white disabled:opacity-50"
                      >
                        {loadingMore ? "Loading…" : "Load more"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
