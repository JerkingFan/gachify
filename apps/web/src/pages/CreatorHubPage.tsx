import { BarChart3, ChevronDown, ChevronUp, Loader2, Music2, Upload } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { api } from "@/api/client";
import { LrcEditorPanel } from "@/components/creator/LrcEditorPanel";
import { TopBar } from "@/components/layout/TopBar";
import { trackHasLyricsFromTrack } from "@/lib/lyrics";
import { useAuthStore } from "@/store/authStore";
import type { Track } from "@/types";

export function CreatorHubPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<{
    total_plays: number;
    published_tracks: number;
    total_tracks: number;
    follower_count: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [res, stats] = await Promise.all([
        api.getCreatorTracks(),
        api.getCreatorAnalytics().catch(() => null),
      ]);
      setTracks(res.items);
      if (stats) {
        setAnalytics({
          total_plays: stats.total_plays,
          published_tracks: stats.published_tracks,
          total_tracks: stats.total_tracks,
          follower_count: stats.follower_count ?? 0,
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) void load();
  }, [isAuthenticated, load]);

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  const onLyricsSaved = (updated: Track) => {
    setTracks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  };

  return (
    <>
      <TopBar title="Creator Hub" />
      <div className="flex-1 overflow-y-auto px-4 pb-12 md:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black">Creator Hub</h1>
              <p className="mt-1 text-spotify-muted">
                Manage remixes &amp; karaoke LRC — @{user?.handle}
              </p>
            </div>
            <Link
              to="/upload"
              className="inline-flex items-center gap-2 rounded-full bg-spotify-green px-6 py-2.5 text-sm font-bold text-black hover:scale-[1.02]"
            >
              <Upload className="h-4 w-4" />
              Upload remix
            </Link>
          </div>

          {analytics && (
            <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg bg-spotify-highlight p-4">
                <p className="text-xs uppercase text-spotify-muted">Plays</p>
                <p className="text-2xl font-bold">{analytics.total_plays.toLocaleString()}</p>
              </div>
              <div className="rounded-lg bg-spotify-highlight p-4">
                <p className="text-xs uppercase text-spotify-muted">Published</p>
                <p className="text-2xl font-bold">{analytics.published_tracks}</p>
              </div>
              <div className="rounded-lg bg-spotify-highlight p-4">
                <p className="text-xs uppercase text-spotify-muted">Uploads</p>
                <p className="text-2xl font-bold">{analytics.total_tracks}</p>
              </div>
              <div className="rounded-lg bg-spotify-highlight p-4 sm:col-span-1">
                <p className="text-xs uppercase text-spotify-muted">Followers</p>
                <p className="text-2xl font-bold">{analytics.follower_count.toLocaleString()}</p>
                <p className="text-xs text-spotify-subtle">dungeon masters follow you</p>
              </div>
            </div>
          )}

          <section className="rounded-lg bg-spotify-highlight p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
              <Music2 className="h-5 w-5" />
              My tracks
            </h2>
            {loading && <Loader2 className="h-6 w-6 animate-spin text-spotify-muted" />}
            {!loading && tracks.length === 0 && (
              <p className="text-sm text-spotify-muted">
                No uploads yet.{" "}
                <Link to="/upload" className="text-spotify-green hover:underline">
                  Upload your first remix
                </Link>
              </p>
            )}
            {!loading && tracks.length > 0 && (
              <ul className="divide-y divide-white/10">
                {tracks.map((t) => {
                  const open = expandedId === t.id;
                  const hasLyrics = trackHasLyricsFromTrack(t);
                  return (
                    <li key={t.id} className="py-3">
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <Link
                            to={`/track/${t.id}`}
                            className="truncate font-semibold hover:underline"
                          >
                            {t.title}
                          </Link>
                          <p className="text-xs capitalize text-spotify-muted">
                            {t.status.replace(/_/g, " ")}
                            {hasLyrics && " · ♂️ karaoke ready"}
                            {t.play_count != null && t.play_count > 0 && ` · ${t.play_count} plays`}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {t.status === "published" && (
                            <Link
                              to={`/artist/${t.creator_id}`}
                              className="text-xs text-spotify-muted hover:text-white"
                            >
                              Public
                            </Link>
                          )}
                          <button
                            type="button"
                            onClick={() => setExpandedId(open ? null : t.id)}
                            className="inline-flex items-center gap-1 rounded-full border border-white/20 px-3 py-1 text-xs font-semibold hover:bg-white/10"
                          >
                            LRC
                            {open ? (
                              <ChevronUp className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                      {open && (
                        <LrcEditorPanel track={t} onSaved={onLyricsSaved} />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {user && (
            <p className="mt-6 text-center text-sm text-spotify-muted">
              <Link to={`/profile/${user.id}`} className="hover:text-white hover:underline">
                View your public profile
              </Link>
              {" · "}
              <Link to="/settings" className="hover:text-white hover:underline">
                Account settings
              </Link>
            </p>
          )}

          <div className="mt-8 flex items-center gap-2 rounded-lg border border-white/10 p-4 text-sm text-spotify-muted">
            <BarChart3 className="h-4 w-4 shrink-0" />
            Tip: paste LRC at upload or edit here anytime before/after publish — fans get synced karaoke in the player.
          </div>
        </div>
      </div>
    </>
  );
}
