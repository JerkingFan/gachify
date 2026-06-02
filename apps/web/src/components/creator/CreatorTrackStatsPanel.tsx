import { BarChart3 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { playSourceLabel } from "@/lib/playSource";
import type { TrackCreatorStats } from "@/types";

export function CreatorTrackStatsPanel({ trackId }: { trackId: string }) {
  const [stats, setStats] = useState<TrackCreatorStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .getCreatorTrackStats(trackId, 14)
      .then(setStats)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load stats"));
  }, [trackId]);

  if (error) {
    return (
      <section className="mb-8 rounded-lg border border-white/10 bg-spotify-highlight p-4 text-sm text-spotify-muted">
        Stats unavailable: {error}
      </section>
    );
  }

  if (!stats) {
    return (
      <section className="mb-8 h-32 animate-pulse rounded-lg bg-spotify-highlight" aria-hidden />
    );
  }

  const max = Math.max(1, ...stats.daily.map((d) => d.play_count));

  return (
    <section className="mb-8 rounded-lg border border-white/10 bg-spotify-highlight p-5">
      <div className="mb-4 flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-spotify-green" />
        <h2 className="text-lg font-bold">Creator stats</h2>
      </div>
      <p className="mb-4 text-sm text-spotify-muted">
        <span className="text-2xl font-bold text-white tabular-nums">
          {stats.play_count.toLocaleString()}
        </span>{" "}
        total plays · last 14 days
      </p>
      {stats.daily.length === 0 ? (
        <p className="text-sm text-spotify-muted">No plays recorded yet — share your remix.</p>
      ) : (
        <div className="flex h-24 items-end gap-1">
          {stats.daily.map((d) => (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full max-w-[28px] rounded-t bg-spotify-green/80"
                style={{ height: `${Math.max(4, (d.play_count / max) * 100)}%` }}
                title={`${d.date}: ${d.play_count} plays`}
              />
              <span className="text-[9px] text-spotify-subtle">
                {d.date.slice(5)}
              </span>
            </div>
          ))}
        </div>
      )}
      {stats.sources && stats.sources.length > 0 && (
        <div className="mt-5 border-t border-white/10 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase text-spotify-muted">Where listeners came from</p>
          <ul className="space-y-1.5 text-sm">
            {stats.sources.map((s) => (
              <li key={s.source} className="flex justify-between gap-4">
                <span>{playSourceLabel(s.source)}</span>
                <span className="tabular-nums text-spotify-muted">{s.play_count.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
