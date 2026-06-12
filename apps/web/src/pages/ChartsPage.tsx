import { TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { TopBar } from "@/components/layout/TopBar";
import { PageMeta } from "@/components/ui/PageMeta";
import { TrackRow } from "@/components/ui/TrackRow";
import type { ChartTrack } from "@/types";

export function ChartsPage() {
  const [items, setItems] = useState<ChartTrack[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api
      .getWeeklyCharts(50)
      .then((r) => setItems(r.items))
      .finally(() => setLoading(false));
  }, []);

  const maxWeekly = Math.max(1, ...items.map((i) => i.weekly_plays ?? 0));

  return (
    <>
      <PageMeta
        title="Top this week"
        description="Gachify weekly charts — most played remixes in the last 7 days."
        url={typeof window !== "undefined" ? `${window.location.origin}/charts` : "/charts"}
      />
      <TopBar title="Top this week" />
      <div className="flex-1 overflow-y-auto px-6 pb-10">
        <div className="mb-8 flex items-center gap-3">
          <TrendingUp className="h-8 w-8 text-spotify-green" />
          <div>
            <h1 className="text-3xl font-black">Top this week</h1>
            <p className="text-sm text-spotify-muted">Plays in the last 7 days · updated live</p>
          </div>
        </div>

        {loading ? (
          <p className="text-spotify-muted">Loading charts…</p>
        ) : items.length === 0 ? (
          <p className="text-spotify-muted">No plays yet this week — be the first to trend.</p>
        ) : (
          <ol className="space-y-1">
            {items.map((row, i) => (
              <li key={row.id} className="flex items-center gap-3">
                <span
                  className={`w-8 shrink-0 text-center text-lg font-black tabular-nums ${
                    i < 3 ? "text-spotify-green" : "text-spotify-muted"
                  }`}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <TrackRow track={row} index={i} queue={items} />
                </div>
                <div className="hidden w-24 shrink-0 text-right sm:block">
                  <p className="text-sm font-bold tabular-nums">{row.weekly_plays.toLocaleString()}</p>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full bg-spotify-green"
                      style={{ width: `${(row.weekly_plays / maxWeekly) * 100}%` }}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}

        <p className="mt-8 text-sm text-spotify-muted">
          Browse by mood:{" "}
          {["dungeon", "slap_bass", "club"].map((m, idx) => (
            <span key={m}>
              {idx > 0 && " · "}
              <Link to={`/tag/${m}`} className="underline hover:text-white">
                {m.replace("_", " ")}
              </Link>
            </span>
          ))}
        </p>
      </div>
    </>
  );
}
