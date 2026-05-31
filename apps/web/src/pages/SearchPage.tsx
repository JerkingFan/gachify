import { Search, SearchX } from "lucide-react";
import { useState } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { TrackRowSkeleton } from "@/components/ui/Skeleton";
import { TrackRow } from "@/components/ui/TrackRow";
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

  return (
    <>
      <TopBar title="Search" />
      <div className="flex-1 overflow-y-auto px-6 pb-8">
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
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {BROWSE.map((b) => (
                <button
                  key={b.label}
                  type="button"
                  onClick={() => setQuery(b.query)}
                  className="relative h-28 overflow-hidden rounded-lg p-4 text-left font-bold transition hover:scale-[1.02]"
                  style={{ backgroundColor: b.color }}
                >
                  <span className="text-lg">{b.label}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {query && (
          <section>
            <h2 className="mb-4 text-xl font-bold text-white">
              {loading
                ? "Searching…"
                : `Results for "${query}"${total > 0 ? ` · ${total}` : ""}`}
            </h2>
            <div className="mb-2 grid grid-cols-[16px_4fr_3fr_1fr_40px] gap-4 border-b border-white/10 px-4 pb-2 text-xs uppercase text-spotify-muted">
              <span>#</span>
              <span>Title</span>
              <span className="hidden md:block">Artist</span>
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
                title="No results"
                description={`Nothing matched "${query}". Try "dungeon", "deep", or "boy".`}
              />
            )}
            {!loading &&
              !error &&
              results.map((t, i) => (
                <TrackRow key={t.id} track={t} index={i} queue={results} />
              ))}
          </section>
        )}
      </div>
    </>
  );
}
