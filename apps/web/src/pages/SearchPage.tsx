import { Compass, Mic2, Search, SearchX, User } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { TopBar } from "@/components/layout/TopBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { TrackRowSkeleton } from "@/components/ui/Skeleton";
import { TrackRow } from "@/components/ui/TrackRow";
import { useArtistSearch } from "@/hooks/useArtistSearch";
import { useTrackSearch } from "@/hooks/useTrackSearch";
import { GACHI_STATIONS } from "@/lib/stations";

const BROWSE = [
  { label: "Dungeon", href: "/discover?mood=dungeon", color: "#1a472a" },
  { label: "Boy Next Door", href: "/discover?sample=boy_next_door", color: "#5038a0" },
  { label: "Orchestral", href: "/discover?mood=orchestral", color: "#8b2635" },
  { label: "Brotherhood", href: "/discover?mood=brotherhood", color: "#2d4a6f" },
  { label: "Slap Bass", href: "/discover?mood=slap_bass", color: "#6b4423" },
  { label: "Deep Fantasy", href: "/discover?min_deepness=7", color: "#1a1a3d" },
];

export function SearchPage() {
  const [query, setQuery] = useState("");
  const [karaokeOnly, setKaraokeOnly] = useState(false);
  const navigate = useNavigate();
  const { results, total, loading, error } = useTrackSearch(query, karaokeOnly);
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
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-spotify-muted">
            <input
              type="checkbox"
              checked={karaokeOnly}
              onChange={(e) => setKaraokeOnly(e.target.checked)}
              className="accent-spotify-green"
            />
            <Mic2 className="h-4 w-4 text-spotify-green" />
            Only tracks with karaoke lyrics
          </label>
        </div>

        {!query && !karaokeOnly && (
          <>
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold">Browse by mood</h2>
              <Link
                to="/discover"
                className="inline-flex items-center gap-1 text-sm font-semibold text-spotify-green hover:underline"
              >
                <Compass className="h-4 w-4" />
                Discover
              </Link>
            </div>
            <div className="mb-10 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
              {BROWSE.map((b) => (
                <button
                  key={b.label}
                  type="button"
                  onClick={() => navigate(b.href)}
                  className="relative h-24 overflow-hidden rounded-lg p-4 text-left font-bold transition hover:scale-[1.02] md:h-28"
                  style={{ backgroundColor: b.color }}
                >
                  <span className="text-base md:text-lg">{b.label}</span>
                </button>
              ))}
            </div>

            <h2 className="mb-4 text-xl font-bold">Gachi stations</h2>
            <p className="mb-4 text-sm text-spotify-muted">
              Metadata filters — power, BPM, mood tags — not just title search
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {GACHI_STATIONS.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => navigate(`/discover?station=${st.id}`)}
                  className="rounded-lg bg-spotify-highlight px-4 py-3 text-left transition hover:bg-spotify-elevated"
                >
                  <p className="font-semibold">{st.label}</p>
                  <p className="text-sm text-spotify-muted">{st.description}</p>
                </button>
              ))}
            </div>
          </>
        )}

        {(query || karaokeOnly) && (
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
                  description={
                    karaokeOnly
                      ? "No published tracks with synced lyrics match your filters."
                      : `Nothing matched "${query}". Try Discover for mood and power filters.`
                  }
                  actionLabel="Karaoke on Discover"
                  actionTo="/discover?karaoke=1"
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
