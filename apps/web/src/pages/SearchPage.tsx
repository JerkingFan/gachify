import { Search, SearchX, User } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { TopBar } from "@/components/layout/TopBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { TrackRowSkeleton } from "@/components/ui/Skeleton";
import { TrackRow } from "@/components/ui/TrackRow";
import { useArtistSearch } from "@/hooks/useArtistSearch";
import { useTrackSearch } from "@/hooks/useTrackSearch";

const BROWSE = [
  { label: "Dungeon", query: "dungeon", color: "#1a472a" },
  { label: "Boy Next Door", query: "boy next door", color: "#5038a0" },
  { label: "Orchestral", query: "orchestral", color: "#8b2635" },
  { label: "Brotherhood", query: "brotherhood", color: "#2d4a6f" },
  { label: "Slap Bass", query: "slap", color: "#6b4423" },
  { label: "Deep Fantasy", query: "deep", color: "#1a1a3d" },
];

export function SearchPage() {
  const [query, setQuery] = useState("");
  const { results, total, loading, error } = useTrackSearch(query);
  const {
    results: artists,
    total: artistTotal,
    loading: artistsLoading,
  } = useArtistSearch(query);

  return (
    <>
      <TopBar title="Search" />
      <div className="flex-1 overflow-y-auto px-4 pb-8 md:px-6">
        <div className="relative mb-8 mt-2">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-spotify-muted" />
          <input
            type="search"
            placeholder="What do you want to listen to?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-full bg-white py-3.5 pl-12 pr-4 text-base text-black placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-white"
            autoFocus
          />
        </div>

        {!query && (
          <>
            <h2 className="mb-4 text-xl font-bold">Browse all</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
              {BROWSE.map((b) => (
                <button
                  key={b.label}
                  type="button"
                  onClick={() => setQuery(b.query)}
                  className="relative h-24 overflow-hidden rounded-lg p-4 text-left font-bold transition hover:scale-[1.02] md:h-28"
                  style={{ backgroundColor: b.color }}
                >
                  <span className="text-base md:text-lg">{b.label}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {query && (
          <>
            {(artistsLoading || artists.length > 0) && (
              <section className="mb-10">
                <h2 className="mb-4 text-lg font-bold text-white md:text-xl">
                  Artists{artistTotal > 0 ? ` · ${artistTotal}` : ""}
                </h2>
                {artistsLoading && artists.length === 0 ? (
                  <p className="text-sm text-spotify-muted">Searching artists…</p>
                ) : (
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {artists.map((a) => (
                      <li key={a.id}>
                        <Link
                          to={`/artist/${a.id}`}
                          className="flex items-center gap-3 rounded-md bg-spotify-highlight px-4 py-3 transition hover:bg-spotify-elevated touch-target"
                        >
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-spotify-base">
                            <User className="h-6 w-6 text-spotify-muted" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{a.display_name}</p>
                            <p className="truncate text-sm text-spotify-muted">
                              @{a.handle} · {a.published_tracks} tracks
                            </p>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            <section>
              <h2 className="mb-4 text-lg font-bold text-white md:text-xl">
                {loading
                  ? "Searching tracks…"
                  : `Tracks${total > 0 ? ` · ${total}` : ""}`}
              </h2>
              <div className="mb-2 hidden grid-cols-[16px_4fr_3fr_1fr_40px] gap-4 border-b border-white/10 px-4 pb-2 text-xs uppercase text-spotify-muted md:grid">
                <span>#</span>
                <span>Title</span>
                <span>Artist</span>
                <span className="text-right">
                  <Search className="ml-auto h-3 w-3" />
                </span>
                <span />
              </div>
              {loading && (
                <>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <TrackRowSkeleton key={i} />
                  ))}
                </>
              )}
              {!loading && error && (
                <EmptyState
                  icon={SearchX}
                  title="Search failed"
                  description={error}
                />
              )}
              {!loading && !error && results.length === 0 && (
                <EmptyState
                  icon={SearchX}
                  title="No track results"
                  description={`Nothing matched "${query}". Try "dungeon", "deep", or "boy".`}
                />
              )}
              {!loading &&
                !error &&
                results.map((t, i) => (
                  <TrackRow key={t.id} track={t} index={i} queue={results} />
                ))}
            </section>
          </>
        )}
      </div>
    </>
  );
}
