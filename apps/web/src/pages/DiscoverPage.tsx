import { Compass, Mic2, Radio, Save, Sparkles, Trash2, X } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useState } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { RadioStartButton } from "@/components/ui/RadioStartButton";
import { Section } from "@/components/ui/Section";
import { TrackCard } from "@/components/ui/TrackCard";
import { TrackGridSkeleton } from "@/components/ui/Skeleton";
import { useFilteredTracks } from "@/hooks/useFilteredTracks";
import { useFilterPresets } from "@/hooks/useFilterPresets";
import { GACHI_STATIONS, MOOD_TILES, stationById } from "@/lib/stations";
import {
  describeFilters,
  filtersToSearchParams,
  hasActiveFilters,
  searchParamsToFilters,
  type TrackFilterParams,
} from "@/lib/trackFilters";
import { useAuthStore } from "@/store/authStore";
import { usePlayerStore } from "@/store/playerStore";

export function DiscoverPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { presets, createPreset, deletePreset, creating } = useFilterPresets();
  const [saveName, setSaveName] = useState("");
  const [showSave, setShowSave] = useState(false);
  const filters = searchParamsToFilters(searchParams);
  const stationId = searchParams.get("station");
  const station = stationId ? stationById(stationId) : undefined;
  const activeFilters = station?.filters ?? filters;
  const showingResults = Boolean(station) || hasActiveFilters(activeFilters);

  const { tracks, total, loading, error } = useFilteredTracks(
    showingResults ? activeFilters : { sort: "trending" },
    40,
  );

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const startRadio = usePlayerStore((s) => s.startRadio);

  const applyFilters = (next: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
    }
    if (next.has_lyrics === "true" || next.karaoke === "1") p.set("karaoke", "1");
    setSearchParams(p);
  };

  const openStation = (id: string) => {
    navigate(`/discover?station=${id}`);
  };

  const openMood = (mood: string) => {
    applyFilters({ mood });
  };

  const clearFilters = () => {
    setSearchParams({});
  };

  const saveCurrentPreset = async () => {
    const name = saveName.trim();
    if (!name) return;
    const payload: TrackFilterParams = station ? { ...station.filters } : { ...activeFilters };
    await createPreset({ name, filters: payload });
    setSaveName("");
    setShowSave(false);
  };

  return (
    <>
      <TopBar title="Discover" />
      <div className="flex-1 overflow-y-auto px-4 pb-8 md:px-6">
        <div className="mb-6 mt-2 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-spotify-green text-black">
            <Compass className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-black md:text-3xl">Discover</h1>
            <p className="text-sm text-spotify-muted">
              Mood, power level, BPM — not just text search
            </p>
          </div>
        </div>

        {currentTrack && (
          <section className="mb-8 rounded-xl bg-gradient-to-br from-spotify-highlight to-spotify-base p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase text-spotify-green">
                  <Sparkles className="h-3.5 w-3.5" />
                  Now playing
                </p>
                <p className="mt-1 truncate text-lg font-bold">{currentTrack.title}</p>
                <p className="text-sm text-spotify-muted">
                  One tap — queue fills with similar remixes
                </p>
              </div>
              <button
                type="button"
                onClick={() => void startRadio(currentTrack)}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-spotify-green px-6 py-3 text-sm font-bold text-black hover:scale-[1.02]"
              >
                <Radio className="h-4 w-4" />
                Sounds like this
              </button>
            </div>
            <Link
              to={`/track/${currentTrack.id}`}
              className="mt-3 inline-block text-xs text-spotify-muted hover:text-white hover:underline"
            >
              Open track page
            </Link>
          </section>
        )}

        {!showingResults && (
          <>
            {isAuthenticated && presets.length > 0 && (
              <Section title="Your saved mixes" subtitle="One tap to reopen">
                <div className="flex flex-wrap gap-2">
                  {presets.map((p) => {
                    const qs = filtersToSearchParams(p.filters as TrackFilterParams).toString();
                    return (
                      <div key={p.id} className="inline-flex items-center gap-1 rounded-full bg-spotify-highlight pr-1">
                        <button
                          type="button"
                          onClick={() => navigate(`/discover${qs ? `?${qs}` : ""}`)}
                          className="px-3 py-2 text-sm font-semibold hover:text-spotify-green"
                        >
                          {p.name}
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${p.name}`}
                          onClick={() => void deletePreset(p.id)}
                          className="rounded-full p-1.5 text-spotify-muted hover:bg-white/10 hover:text-white"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            <Section title="Browse by mood" subtitle="Filter by analyzer tags">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {MOOD_TILES.map((tile) => (
                  <Link
                    key={tile.mood}
                    to={`/tag/${tile.mood}`}
                    className="relative flex h-24 overflow-hidden rounded-lg p-4 text-left font-bold transition hover:scale-[1.02] md:h-28"
                    style={{ backgroundColor: tile.color }}
                  >
                    <span className="text-base md:text-lg">{tile.label}</span>
                  </Link>
                ))}
              </div>
            </Section>

            <Section title="Karaoke" subtitle="Remixes with synced LRC lyrics">
              <button
                type="button"
                onClick={() => setSearchParams(new URLSearchParams({ karaoke: "1" }))}
                className="flex w-full items-center gap-4 rounded-lg bg-gradient-to-r from-spotify-green/30 to-spotify-highlight p-5 text-left transition hover:scale-[1.01]"
              >
                <Mic2 className="h-8 w-8 text-spotify-green" />
                <div>
                  <p className="text-lg font-bold">Only with karaoke</p>
                  <p className="text-sm text-spotify-muted">
                    Tracks that have timed lyrics — sing along in the player
                  </p>
                </div>
              </button>
            </Section>

            <Section title="Gachi stations" subtitle="Curated metadata filters">
              <div className="grid gap-3 sm:grid-cols-2">
                {GACHI_STATIONS.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => openStation(st.id)}
                    className="flex items-start gap-4 rounded-lg p-4 text-left transition hover:scale-[1.01] hover:bg-spotify-highlight"
                    style={{
                      background: `linear-gradient(135deg, ${st.color}88 0%, #282828 100%)`,
                    }}
                  >
                    <Radio className="mt-0.5 h-5 w-5 shrink-0 text-white/90" />
                    <div>
                      <p className="font-bold">{st.label}</p>
                      <p className="text-sm text-white/70">{st.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </Section>

            <Section title="Trending now" subtitle="By play count">
              {loading ? (
                <TrackGridSkeleton count={8} />
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {tracks.slice(0, 10).map((t) => (
                    <TrackCard key={t.id} track={t} queue={tracks} showRadio />
                  ))}
                </div>
              )}
            </Section>
          </>
        )}

        {showingResults && (
          <section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">
                  {station?.label ?? describeFilters(activeFilters)}
                </h2>
                <p className="text-sm text-spotify-muted">
                  {loading ? "Loading…" : `${total} remix${total === 1 ? "" : "es"}`}
                  {station && ` · ${station.description}`}
                </p>
              </div>
              <div className="mb-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 rounded-full border border-white/30 px-3 py-1.5 text-sm hover:bg-white/10"
              >
                <X className="h-4 w-4" />
                Clear
              </button>
              {isAuthenticated && !station && hasActiveFilters(activeFilters) && (
                showSave ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      placeholder="My dungeon mix"
                      className="rounded-full bg-spotify-highlight px-3 py-1.5 text-sm"
                    />
                    <button
                      type="button"
                      disabled={creating || !saveName.trim()}
                      onClick={() => void saveCurrentPreset()}
                      className="inline-flex items-center gap-1 rounded-full bg-spotify-green px-3 py-1.5 text-sm font-bold text-black disabled:opacity-50"
                    >
                      <Save className="h-4 w-4" />
                      Save
                    </button>
                    <button type="button" onClick={() => setShowSave(false)} className="text-sm text-spotify-muted">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowSave(true)}
                    className="inline-flex items-center gap-1 rounded-full border border-spotify-green/50 px-3 py-1.5 text-sm text-spotify-green hover:bg-spotify-green/10"
                  >
                    <Save className="h-4 w-4" />
                    Save preset
                  </button>
                )
              )}
            </div>
            </div>

            {!station && (
              <div className="mb-4 flex flex-wrap gap-2 text-xs text-spotify-muted">
                {Object.entries(activeFilters).map(([k, v]) =>
                  v != null && v !== "" ? (
                    <span key={k} className="rounded-full bg-spotify-highlight px-2 py-1">
                      {k}: {String(v)}
                    </span>
                  ) : null,
                )}
              </div>
            )}

            {error && (
              <EmptyState
                icon={Compass}
                title="Could not load station"
                description={error}
              />
            )}

            {loading && <TrackGridSkeleton count={10} />}

            {!loading && !error && tracks.length === 0 && (
              <EmptyState
                icon={Compass}
                title="No tracks match"
                description="Try another mood or station, or upload a remix with metadata."
                actionLabel="Browse moods"
                onAction={clearFilters}
              />
            )}

            {!loading && !error && tracks.length > 0 && (
              <>
                <div className="mb-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      const first = tracks[0];
                      if (first) void startRadio(first, tracks);
                    }}
                    className="inline-flex items-center gap-2 rounded-full bg-spotify-green px-5 py-2.5 text-sm font-bold text-black hover:scale-[1.02]"
                  >
                    <Radio className="h-4 w-4" />
                    Radio from station
                  </button>
                  <Link
                    to={`/search?${filtersToSearchParams({ ...activeFilters }).toString()}`}
                    className="inline-flex items-center rounded-full border border-white/30 px-4 py-2 text-sm font-semibold hover:bg-white/10"
                  >
                    Open in Search
                  </Link>
                </div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {tracks.map((t) => (
                    <TrackCard key={t.id} track={t} queue={tracks} showRadio />
                  ))}
                </div>
              </>
            )}
          </section>
        )}
      </div>
    </>
  );
}
