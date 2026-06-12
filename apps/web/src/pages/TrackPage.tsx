import { Clock, Download, Heart, Loader2, Music2, Play } from "lucide-react";
import { CreatorTrackStatsPanel } from "@/components/creator/CreatorTrackStatsPanel";
import { SchedulePublishPanel } from "@/components/creator/SchedulePublishPanel";
import { TrackSocialSection } from "@/components/social/TrackSocialSection";
import { RadioStartButton } from "@/components/ui/RadioStartButton";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "@/api/client";
import { KaraokeButton } from "@/components/karaoke/KaraokeButton";
import { useTrackLyrics } from "@/hooks/useTrackLyrics";
import { TopBar } from "@/components/layout/TopBar";
import { CoverArt } from "@/components/ui/CoverArt";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageMeta } from "@/components/ui/PageMeta";
import { ShareButton } from "@/components/ui/ShareButton";
import { PageScroll } from "@/components/ui/PageScroll";
import { PageHeaderSkeleton } from "@/components/ui/Skeleton";
import { TrackRow } from "@/components/ui/TrackRow";
import { TrackRowSkeleton } from "@/components/ui/Skeleton";
import { parseGachiMeta, formatDuration, getArtistName } from "@/lib/tracks";
import { useAuthStore } from "@/store/authStore";
import { useOfflineDownloads } from "@/hooks/useOfflineDownloads";
import { useLibraryStore } from "@/store/libraryStore";
import { usePlayerStore } from "@/store/playerStore";
import type { Track, User } from "@/types";

export function TrackPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const [track, setTrack] = useState<Track | null>(null);
  const [creator, setCreator] = useState<User | null>(null);
  const [related, setRelated] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const playTrack = usePlayerStore((s) => s.playTrack);
  const seek = usePlayerStore((s) => s.seek);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const progressMs = usePlayerStore((s) => s.progressMs);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const me = useAuthStore((s) => s.user);
  const toggleLiked = useLibraryStore((s) => s.toggleLiked);
  const isLikedFn = useLibraryStore((s) => s.isLiked);
  const [liked, setLiked] = useState(false);
  const lyricsDoc = useTrackLyrics(track);
  const hasLyrics = Boolean(lyricsDoc?.lines?.length);
  const offline = useOfflineDownloads();
  const isOffline = offline.ids.includes(track?.id ?? "");

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const t = await api.getTrack(id);
        setTrack(t);
        setLiked(isLikedFn(t.id));
        const [u, sim] = await Promise.all([
          api.getUser(t.creator_id).catch(() => null),
          api.getSimilarTracks(t.id, 8),
        ]);
        setCreator(u);
        setRelated(sim.items);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load track");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isLikedFn]);

  useEffect(() => {
    if (!track) return;
    const raw = searchParams.get("t");
    if (!raw) return;
    const sec = Number(raw);
    if (!Number.isFinite(sec) || sec < 0) return;
    const ms = Math.round(sec * 1000);
    if (currentTrack?.id !== track.id) {
      playTrack(track, [track, ...related]);
    }
    window.setTimeout(() => seek(ms), 300);
  }, [track?.id, searchParams.get("t")]);

  if (loading) {
    return (
      <PageScroll>
        <TopBar />
        <PageHeaderSkeleton />
        <div className="px-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <TrackRowSkeleton key={i} />
          ))}
        </div>
      </PageScroll>
    );
  }

  if (error || !track) {
    return (
      <PageScroll>
        <TopBar />
        <EmptyState
          icon={Music2}
          title="Track not found"
          description={error ?? "This remix may have been removed."}
          actionLabel="Go home"
          actionTo="/"
        />
      </PageScroll>
    );
  }

  const meta = parseGachiMeta(track);
  const isOwner = Boolean(me && me.id === track.creator_id);
  const queue = [track, ...related];
  const sharePath = `/track/${track.id}`;
  const pageUrl =
    typeof window !== "undefined" ? `${window.location.origin}/track/${track.id}` : sharePath;

  return (
    <>
      <PageMeta
        title={track.title}
        description={`${getArtistName(track)} · ${formatDuration(track.duration_ms)} · Gachify remix`}
        url={pageUrl}
        oembedUrl={
          typeof window !== "undefined"
            ? `${window.location.origin}/share/oembed?url=${encodeURIComponent(pageUrl)}&format=json`
            : undefined
        }
      />
      <PageScroll>
      <div className="bg-gradient-gachi">
        <TopBar gradient />
        <div className="flex flex-col gap-6 px-6 pb-8 md:flex-row md:items-end">
          <CoverArt track={track} size="xl" className="shadow-2xl" />
          <div className="min-w-0 flex-1 pb-2">
            <p className="text-xs font-semibold uppercase">Remix</p>
            <h1 className="mt-2 text-3xl font-black md:text-5xl">{track.title}</h1>
            {creator && (
              <Link
                to={`/artist/${creator.id}`}
                className="mt-2 inline-block text-sm font-semibold text-white hover:underline"
              >
                {creator.display_name}
              </Link>
            )}
            <p className="mt-2 text-sm text-spotify-muted">
              {formatDuration(track.duration_ms)} · ♂️ Power {meta.gachi_power_level ?? "—"}
              {meta.deepness_score != null && ` · Deepness ${meta.deepness_score}`}
              {track.play_count != null && track.play_count > 0 && ` · ${track.play_count.toLocaleString()} plays`}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => playTrack(track, queue)}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-spotify-green text-black shadow-xl hover:scale-105"
                aria-label="Play"
              >
                <Play className="h-7 w-7" fill="currentColor" />
              </button>
              <RadioStartButton
                track={track}
                queue={queue}
                variant="primary"
                label="Start radio"
              />
              {isAuthenticated && (
                <button
                  type="button"
                  aria-label={liked ? "Unlike track" : "Like track"}
                  onClick={() => void toggleLiked(track.id, true).then(setLiked)}
                  className={`rounded-full border border-white/30 p-3 ${liked ? "text-spotify-green" : "text-white"}`}
                >
                  <Heart className="h-6 w-6" fill={liked ? "currentColor" : "none"} />
                </button>
              )}
              {isAuthenticated && liked && (
                <button
                  type="button"
                  title={isOffline ? "Available offline" : "Download for offline"}
                  disabled={offline.busy === track.id}
                  onClick={() => {
                    if (isOffline) {
                      void offline.remove(track.id);
                    } else {
                      void offline.download(track.id);
                    }
                  }}
                  className={`rounded-full border border-white/30 p-3 ${isOffline ? "text-spotify-green" : "text-white"}`}
                >
                  {offline.busy === track.id ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    <Download className="h-6 w-6" />
                  )}
                </button>
              )}
              <ShareButton
                path={sharePath}
                title={track.title}
                trackId={track.id}
                timeSec={
                  currentTrack?.id === track.id && progressMs > 0
                    ? Math.floor(progressMs / 1000)
                    : undefined
                }
              />
              <KaraokeButton hasLyrics={hasLyrics} variant="pill" />
              {!hasLyrics && (
                <Link
                  to="/discover?karaoke=1"
                  className="text-xs text-spotify-muted underline hover:text-white"
                >
                  Find karaoke tracks
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-8">
        {track.description && (
          <p className="mb-6 max-w-2xl text-sm text-spotify-muted">{track.description}</p>
        )}

        {isOwner && track.status === "approved" && (
          <SchedulePublishPanel
            track={track}
            onUpdated={(t) => setTrack(t)}
          />
        )}

        {isOwner && track.status === "published" && (
          <CreatorTrackStatsPanel trackId={track.id} />
        )}

        {(meta.mood_tags?.length || meta.dominant_male_sample) && (
          <section className="mb-8">
            <h2 className="mb-3 text-lg font-bold">About this remix</h2>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              {meta.dominant_male_sample && (
                <>
                  <dt className="text-spotify-muted">Dominant sample</dt>
                  <dd>
                    <Link
                      to={`/discover?sample=${encodeURIComponent(meta.dominant_male_sample)}`}
                      className="hover:underline"
                    >
                      {meta.dominant_male_sample.replace(/_/g, " ")}
                    </Link>
                  </dd>
                </>
              )}
              {meta.bpm != null && (
                <>
                  <dt className="text-spotify-muted">BPM</dt>
                  <dd>{meta.bpm}</dd>
                </>
              )}
              {meta.grunt_count != null && (
                <>
                  <dt className="text-spotify-muted">♂️ Grunts</dt>
                  <dd>{meta.grunt_count}</dd>
                </>
              )}
              {meta.mood_tags?.map((tag) => (
                <Link
                  key={tag}
                  to={`/discover?mood=${encodeURIComponent(tag)}`}
                  className="mr-2 inline-block rounded-full bg-spotify-highlight px-3 py-1 text-xs hover:bg-spotify-elevated"
                >
                  {tag.replace(/_/g, " ")}
                </Link>
              ))}
            </dl>
          </section>
        )}

        {id && <TrackSocialSection trackId={id} isOwner={isOwner} />}

        {related.length > 0 && (
          <section>
            <h2 className="mb-4 text-lg font-bold">Similar remixes</h2>
            <div className="mb-2 grid grid-cols-[16px_4fr_3fr_1fr_40px] gap-4 border-b border-white/10 px-4 pb-2 text-xs uppercase text-spotify-muted">
              <span>#</span>
              <span>Title</span>
              <span className="hidden md:block">Album</span>
              <span className="flex justify-end">
                <Clock className="h-3 w-3" />
              </span>
              <span />
            </div>
            {related.map((t, i) => (
              <TrackRow key={t.id} track={t} index={i} queue={queue} />
            ))}
          </section>
        )}
      </div>
      </PageScroll>
    </>
  );
}
