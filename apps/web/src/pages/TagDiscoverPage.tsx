import { Tag } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/api/client";
import { TopBar } from "@/components/layout/TopBar";
import { PageMeta } from "@/components/ui/PageMeta";
import { TrackRow } from "@/components/ui/TrackRow";
import { MOOD_TILES } from "@/lib/stations";
import type { Track } from "@/types";

type TagDiscoverPageProps = {
  variant?: "tag" | "mood";
};

export function TagDiscoverPage({ variant = "tag" }: TagDiscoverPageProps) {
  const { slug } = useParams<{ slug: string }>();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  const label = useMemo(() => {
    const tile = MOOD_TILES.find((t) => t.mood === slug);
    if (tile) return tile.label;
    return (slug ?? "").replace(/_/g, " ");
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    void api
      .getTracksByMood(slug, 50)
      .then((r) => setTracks(r.items))
      .catch(() => setTracks([]))
      .finally(() => setLoading(false));
  }, [slug]);

  if (!slug) return null;

  const pathPrefix = variant === "mood" ? "/mood" : "/tag";
  const pageUrl = typeof window !== "undefined" ? `${window.location.origin}${pathPrefix}/${slug}` : pathPrefix;

  return (
    <>
      <PageMeta
        title={`${label} remixes`}
        description={`Listen to ${label} gachi remixes on Gachify — trending tracks, filters, and deep dark fantasy.`}
        url={pageUrl}
      />
      <TopBar title={label} />
      <div className="flex-1 overflow-y-auto px-6 pb-10">
        <div className="mb-8 flex items-center gap-3">
          <Tag className="h-8 w-8 text-spotify-green" />
          <div>
            <h1 className="text-3xl font-black capitalize">{label}</h1>
            <p className="text-sm text-spotify-muted">
              {tracks.length} remixes ·{" "}
              <Link to="/charts" className="underline hover:text-white">
                Weekly charts
              </Link>
            </p>
          </div>
        </div>

        {loading ? (
          <p className="text-spotify-muted">Loading…</p>
        ) : tracks.length === 0 ? (
          <p className="text-spotify-muted">No published tracks with this tag yet.</p>
        ) : (
          tracks.map((t, i) => <TrackRow key={t.id} track={t} index={i} queue={tracks} />)
        )}

        <section className="mt-10">
          <h2 className="mb-3 text-lg font-bold">More moods</h2>
          <div className="flex flex-wrap gap-2">
            {MOOD_TILES.filter((t) => t.mood !== slug).map((t) => (
              <Link
                key={t.mood}
                to={`${pathPrefix}/${t.mood}`}
                className="rounded-full px-4 py-1.5 text-sm font-semibold hover:brightness-110"
                style={{ backgroundColor: t.color }}
              >
                {t.label}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
