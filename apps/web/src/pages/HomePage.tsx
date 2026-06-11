import { Compass, Music2, Play, ServerCrash, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { PlaylistCard } from "@/components/ui/PlaylistCard";
import { coverSeedFromPlaylist } from "@/lib/playlists";
import type { ServerPlaylist } from "@/types";
import { HomeQuickLinks } from "@/components/home/HomeQuickLinks";
import { Section } from "@/components/ui/Section";
import { TrackCard } from "@/components/ui/TrackCard";
import { TopBar } from "@/components/layout/TopBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { HeroSkeleton, TrackGridSkeleton } from "@/components/ui/Skeleton";
import { parseGachiMeta } from "@/lib/tracks";
import { useRecentTracks } from "@/hooks/useRecentTracks";
import { useTracks } from "@/hooks/useTracks";
import { useTrendingTracks } from "@/hooks/useTrendingTracks";
import { useFeed } from "@/hooks/useFeed";
import { useForYou } from "@/hooks/useForYou";
import { useFilterPresets } from "@/hooks/useFilterPresets";
import { filtersToSearchParams, type TrackFilterParams } from "@/lib/trackFilters";
import { isMobileBuild } from "@/lib/apiOrigin";
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
  const { tracks: forYouTracks, loading: forYouLoading } = useForYou(12);
  const { presets } = useFilterPresets();
  const playTrack = usePlayerStore((s) => s.playTrack);
  const setQueue = usePlayerStore((s) => s.setQueue);
  const [publicPlaylists, setPublicPlaylists] = useState<ServerPlaylist[]>([]);

  useEffect(() => {
    void api.getPublicPlaylists(12).then((r) => setPublicPlaylists(r.items));
  }, []);

  const { tracks: recent, loading: recentLoading } = useRecentTracks(tracks, 5);

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
              {!isAuthenticated && (
                <p className="mt-2 text-sm text-white/80">
                  Слушай без регистрации — нажми Play на любом треке.
                </p>
              )}
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
                  description={
                    isMobileBuild()
                      ? `${error} — проверь интернет и пересобери APK: npm run apk -- --api http://5.83.140.179`
                      : `${error} — run docker compose up -d && go run ./cmd/api`
                  }
                  actionLabel="Retry"
                  onAction={() => refresh()}
                />
              )}

              {!error && tracks.length === 0 && (
                <EmptyState
                  icon={Music2}
                  title="No remixes yet"
                  description={
                    isAuthenticated
                      ? "Seed the database or upload your first gachi remix."
                      : "Пока нет треков на сервере. Зайди позже или открой Discover."
                  }
                  actionLabel={isAuthenticated ? "Upload remix" : "Discover"}
                  actionTo={isAuthenticated ? "/upload" : "/discover"}
                />
              )}

              {!error && tracks.length > 0 && (
                <>
                  <HomeQuickLinks />

                  {(recent.length > 0 || recentLoading) && (
                    <Section title="Recently played">
                      {recentLoading && recent.length === 0 ? (
                        <TrackGridSkeleton count={5} />
                      ) : (
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                          {recent.map((t) => (
                            <TrackCard key={t.id} track={t} queue={recent} />
                          ))}
                        </div>
                      )}
                    </Section>
                  )}

                  {isAuthenticated && (forYouTracks.length > 0 || forYouLoading) && (
                    <Section
                      title="For you"
                      subtitle="Based on your history, likes & subscriptions"
                    >
                      {forYouLoading && forYouTracks.length === 0 ? (
                        <TrackGridSkeleton count={10} />
                      ) : (
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                          {forYouTracks.map((t) => (
                            <TrackCard key={t.id} track={t} queue={forYouTracks} showRadio />
                          ))}
                        </div>
                      )}
                    </Section>
                  )}

                  {isAuthenticated && presets.length > 0 && (
                    <Section title="Your mixes" subtitle="Saved Discover filters — one tap">
                      <div className="flex flex-wrap gap-2">
                        {presets.map((p) => {
                          const qs = filtersToSearchParams(p.filters as TrackFilterParams).toString();
                          return (
                            <Link
                              key={p.id}
                              to={`/discover${qs ? `?${qs}` : ""}`}
                              className="inline-flex items-center gap-2 rounded-full bg-spotify-highlight px-4 py-2 text-sm font-semibold hover:bg-spotify-elevated"
                            >
                              <Sparkles className="h-4 w-4 text-spotify-green" />
                              {p.name}
                            </Link>
                          );
                        })}
                        <Link
                          to="/discover"
                          className="inline-flex items-center rounded-full border border-white/30 px-4 py-2 text-sm font-semibold text-spotify-muted hover:text-white"
                        >
                          + Discover
                        </Link>
                      </div>
                    </Section>
                  )}

                  {isAuthenticated && feedTracks.length > 0 && (
                    <Section
                      title="From artists you follow"
                      subtitle="See all in Subscriptions"
                      action={
                        <Link
                          to="/following"
                          className="text-sm font-semibold text-spotify-green hover:underline"
                        >
                          Open feed
                        </Link>
                      }
                    >
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                        {(feedLoading ? tracks : feedTracks).slice(0, 10).map((t) => (
                          <TrackCard key={t.id} track={t} queue={feedTracks} />
                        ))}
                      </div>
                    </Section>
                  )}

                  <Section
                    title="Trending gachi remixes"
                    subtitle="By play count — updated live"
                    action={
                      <Link to="/charts" className="text-sm font-semibold text-spotify-muted hover:text-white">
                        Weekly top 50 →
                      </Link>
                    }
                  >
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

                  <Section title="Explore by vibe">
                    <Link
                      to="/discover"
                      className="inline-flex items-center gap-2 rounded-full bg-spotify-highlight px-5 py-2.5 text-sm font-semibold hover:bg-spotify-elevated"
                    >
                      <Compass className="h-4 w-4 text-spotify-green" />
                      Open Discover — moods, stations & radio
                    </Link>
                  </Section>

                  {deep.length > 0 && (
                    <Section
                      title="Deep dark fantasy"
                      subtitle="deepness_score ≥ 7"
                      action={
                        <Link
                          to="/discover?min_deepness=7"
                          className="text-sm font-semibold text-spotify-muted hover:text-white"
                        >
                          See all
                        </Link>
                      }
                    >
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
