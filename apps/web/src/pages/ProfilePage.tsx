import { Heart, ListMusic, Play, Settings, Sparkles, UserCircle, UserPlus, UserMinus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/api/client";
import { TopBar } from "@/components/layout/TopBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { PlaylistCard } from "@/components/ui/PlaylistCard";
import { TrackRow } from "@/components/ui/TrackRow";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { coverSeedFromPlaylist } from "@/lib/playlists";
import { useAuthStore } from "@/store/authStore";
import { usePlayerStore } from "@/store/playerStore";
import type { PublicProfile, PublicUserSummary, ServerPlaylist, Track } from "@/types";

export function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const me = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const playTrack = usePlayerStore((s) => s.playTrack);

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [playlists, setPlaylists] = useState<ServerPlaylist[]>([]);
  const [following, setFollowing] = useState<PublicUserSummary[]>([]);
  const [liked, setLiked] = useState<Track[]>([]);
  const [published, setPublished] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  const isOwn = Boolean(me?.id && id && me.id === id);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    void (async () => {
      try {
        const p = await api.getPublicProfile(id);
        setProfile(p);
        const [pl, fol, tracksRes] = await Promise.all([
          api.getUserPublicPlaylists(id).then((r) => r.items),
          api.getUserFollowing(id).then((r) => r.items),
          p.published_tracks > 0
            ? api.getTracks({ creator_id: id, status: "published", limit: 50 })
            : Promise.resolve({ items: [] as Track[] }),
        ]);
        setPlaylists(pl);
        setFollowing(fol);
        setPublished(tracksRes.items);
        try {
          const likedRes = await api.getUserPublicLiked(id);
          setLiked(likedRes.items);
        } catch {
          setLiked([]);
        }
        if (isAuthenticated && me?.id !== id) {
          const fl = await api.getFollowing();
          setIsFollowing(fl.user_ids.includes(id));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Profile not found");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isAuthenticated, me?.id]);

  if (loading) {
    return (
      <>
        <TopBar />
        <p className="p-8 text-spotify-muted">Loading profile…</p>
      </>
    );
  }

  if (error || !profile) {
    return (
      <>
        <TopBar />
        <EmptyState icon={UserCircle} title="Profile not found" description={error ?? undefined} actionTo="/" />
      </>
    );
  }

  return (
    <>
      <div className="bg-gradient-gachi">
        <TopBar gradient />
        <div className="flex flex-col gap-6 px-6 pb-8 md:flex-row md:items-end">
          <UserAvatar
            user={{ display_name: profile.display_name, avatar_url: profile.avatar_url }}
            size="xl"
            className="!rounded-full"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase">
              {profile.published_tracks > 0 ? "Creator & listener" : "Listener"}
            </p>
            <h1 className="mt-2 text-4xl font-black md:text-6xl">{profile.display_name}</h1>
            <p className="mt-2 text-spotify-muted">@{profile.handle}</p>
            {profile.profile_bio && (
              <p className="mt-3 max-w-xl text-sm text-white/80">{profile.profile_bio}</p>
            )}
            <p className="mt-2 text-sm text-spotify-muted">
              {profile.follower_count != null && profile.follower_count > 0 && (
                <>{profile.follower_count.toLocaleString()} followers · </>
              )}
              {profile.public_playlists_count} public playlist
              {profile.public_playlists_count === 1 ? "" : "s"} · following {profile.following_count}
              {profile.published_tracks > 0 && ` · ${profile.published_tracks} remixes`}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {published.length > 0 && (
                <button
                  type="button"
                  onClick={() => playTrack(published[0], published)}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-spotify-green text-black shadow-xl hover:scale-105"
                >
                  <Play className="h-7 w-7" fill="currentColor" />
                </button>
              )}
              {isOwn && (
                <Link
                  to="/settings"
                  className="inline-flex items-center gap-2 rounded-full border border-white/30 px-5 py-2 text-sm font-semibold hover:bg-white/10"
                >
                  <Settings className="h-4 w-4" />
                  Edit profile
                </Link>
              )}
              {isOwn && (
                <Link
                  to="/creator"
                  className="inline-flex items-center gap-2 rounded-full bg-spotify-highlight px-5 py-2 text-sm font-semibold hover:bg-spotify-elevated"
                >
                  <Sparkles className="h-4 w-4 text-spotify-green" />
                  Creator Hub
                </Link>
              )}
              {isAuthenticated && !isOwn && (
                <button
                  type="button"
                  disabled={followBusy}
                  onClick={() => {
                    setFollowBusy(true);
                    void (isFollowing ? api.unfollowUser(id!) : api.followUser(id!))
                      .then(() => setIsFollowing(!isFollowing))
                      .finally(() => setFollowBusy(false));
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-white/30 px-5 py-2 text-sm font-semibold hover:bg-white/10"
                >
                  {isFollowing ? (
                    <>
                      <UserMinus className="h-4 w-4" /> Following
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4" /> Follow
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-10 px-6 py-8 pb-12">
        {playlists.length > 0 && (
          <section>
            <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
              <ListMusic className="h-5 w-5" />
              Public playlists
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {playlists.map((pl) => (
                <PlaylistCard
                  key={pl.id}
                  id={pl.id}
                  title={pl.title}
                  description={pl.description}
                  coverSeed={coverSeedFromPlaylist(pl)}
                />
              ))}
            </div>
          </section>
        )}

        {liked.length > 0 && (
          <section>
            <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
              <Heart className="h-5 w-5 text-spotify-green" />
              Liked tracks
            </h2>
            {liked.map((t, i) => (
              <TrackRow key={t.id} track={t} index={i} queue={liked} />
            ))}
          </section>
        )}

        {following.length > 0 && (
          <section>
            <h2 className="mb-4 text-xl font-bold">Following</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {following.map((u) => (
                <li key={u.id}>
                  <Link
                    to={`/profile/${u.id}`}
                    className="flex items-center gap-3 rounded-md bg-spotify-highlight px-4 py-3 hover:bg-spotify-elevated"
                  >
                    <UserAvatar user={u} size="sm" />
                    <div>
                      <p className="font-semibold">{u.display_name}</p>
                      <p className="text-sm text-spotify-muted">@{u.handle}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {published.length > 0 && (
          <section>
            <h2 className="mb-4 text-xl font-bold">Published remixes</h2>
            {published.map((t, i) => (
              <TrackRow key={t.id} track={t} index={i} queue={published} />
            ))}
          </section>
        )}

        {playlists.length === 0 &&
          liked.length === 0 &&
          following.length === 0 &&
          published.length === 0 && (
            <EmptyState
              icon={UserCircle}
              title="Nothing public yet"
              description={
                isOwn
                  ? "Make playlists public or enable liked tracks in Settings."
                  : "This user hasn't shared anything publicly."
              }
              actionLabel={isOwn ? "Open settings" : undefined}
              actionTo={isOwn ? "/settings" : undefined}
            />
          )}
      </div>
    </>
  );
}
