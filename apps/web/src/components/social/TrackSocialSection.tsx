import { CornerDownRight, Flame, Users, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { CommentBody } from "@/components/social/CommentBody";
import { TrackReportButton } from "@/components/social/TrackReportButton";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useAuthStore } from "@/store/authStore";
import type { TrackComment, TrackReactionsSummary } from "@/types";

const REACTIONS = [
  { id: "power", label: "♂️ Power", icon: Zap },
  { id: "fire", label: "Fire", icon: Flame },
  { id: "brotherhood", label: "Brotherhood", icon: Users },
] as const;

type TrackSocialProps = {
  trackId: string;
  isOwner?: boolean;
};

export function TrackSocialSection({ trackId, isOwner }: TrackSocialProps) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [reactions, setReactions] = useState<TrackReactionsSummary | null>(null);
  const [comments, setComments] = useState<TrackComment[]>([]);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<TrackComment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.getTrackReactions(trackId).then(setReactions);
    void api.getTrackComments(trackId).then((r) => setComments(r.items));
  }, [trackId]);

  const { roots, replies } = useMemo(() => {
    const rootList = comments.filter((c) => !c.parent_id);
    const replyMap = new Map<string, TrackComment[]>();
    for (const c of comments) {
      if (!c.parent_id) continue;
      const list = replyMap.get(c.parent_id) ?? [];
      list.push(c);
      replyMap.set(c.parent_id, list);
    }
    return { roots: rootList, replies: replyMap };
  }, [comments]);

  const toggleReaction = async (id: string) => {
    if (!isAuthenticated) return;
    setBusy(true);
    try {
      const next =
        reactions?.user_reaction === id
          ? await api.clearTrackReaction(trackId)
          : await api.setTrackReaction(trackId, id);
      setReactions(next);
    } finally {
      setBusy(false);
    }
  };

  const startReply = (c: TrackComment) => {
    setReplyTo(c);
    const mention = c.author.handle ? `@${c.author.handle} ` : "";
    setText(mention);
  };

  const cancelReply = () => {
    setReplyTo(null);
    setText("");
  };

  const postComment = async () => {
    if (!text.trim() || !isAuthenticated) return;
    setBusy(true);
    setError(null);
    try {
      const c = await api.addTrackComment(trackId, text.trim(), replyTo?.id);
      setComments((prev) => [...prev, c]);
      setText("");
      setReplyTo(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not post");
    } finally {
      setBusy(false);
    }
  };

  const renderComment = (c: TrackComment, isReply = false) => (
    <div className={`flex gap-3 text-sm ${isReply ? "ml-8 border-l border-white/10 pl-3" : ""}`}>
      <UserAvatar user={c.author} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
          <Link to={`/profile/${c.author.id}`} className="font-semibold hover:underline">
            {c.author.display_name}
          </Link>
          {c.author.handle && (
            <span className="text-xs text-spotify-muted">@{c.author.handle}</span>
          )}
        </div>
        <CommentBody body={c.body} className="text-white/90" />
        {isAuthenticated && !isReply && (
          <button
            type="button"
            onClick={() => startReply(c)}
            className="mt-1 inline-flex items-center gap-1 text-xs text-spotify-muted hover:text-white"
          >
            <CornerDownRight className="h-3 w-3" />
            Reply
          </button>
        )}
      </div>
    </div>
  );

  return (
    <section className="mb-10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Community</h2>
        {isAuthenticated && !isOwner && <TrackReportButton trackId={trackId} />}
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {REACTIONS.map(({ id, label, icon: Icon }) => {
          const active = reactions?.user_reaction === id;
          const count = reactions?.counts[id] ?? 0;
          return (
            <button
              key={id}
              type="button"
              disabled={!isAuthenticated || busy}
              onClick={() => void toggleReaction(id)}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                active
                  ? "border-spotify-green bg-spotify-green/20 text-spotify-green"
                  : "border-white/20 hover:border-white/40"
              } disabled:opacity-50`}
            >
              <Icon className="h-4 w-4" />
              {label}
              {count > 0 && <span className="text-spotify-muted">· {count}</span>}
            </button>
          );
        })}
        {!isAuthenticated && (
          <p className="w-full text-xs text-spotify-muted">
            <Link to="/login" className="text-spotify-green hover:underline">
              Log in
            </Link>{" "}
            to react
          </p>
        )}
      </div>

      <div className="rounded-lg bg-spotify-highlight p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase text-spotify-muted">Discussion</h3>
        <p className="mb-3 text-xs text-spotify-muted">
          Replies are one level deep. Use @handle to mention someone.
        </p>
        {roots.length === 0 && (
          <p className="mb-4 text-sm text-spotify-muted">No comments yet — start the dungeon talk.</p>
        )}
        <ul className="mb-4 space-y-4">
          {roots.map((c) => (
            <li key={c.id} className="space-y-3">
              {renderComment(c)}
              {(replies.get(c.id) ?? []).map((r) => (
                <div key={r.id}>{renderComment(r, true)}</div>
              ))}
            </li>
          ))}
        </ul>
        {isAuthenticated ? (
          <div>
            {replyTo && (
              <p className="mb-2 flex items-center gap-2 text-xs text-spotify-muted">
                Replying to @{replyTo.author.handle ?? replyTo.author.display_name}
                <button type="button" onClick={cancelReply} className="text-spotify-green hover:underline">
                  Cancel
                </button>
              </p>
            )}
            <div className="flex gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={500}
                placeholder={replyTo ? "Write a reply…" : "Drop a hot take… use @handle"}
                className="min-w-0 flex-1 rounded-md bg-spotify-base px-3 py-2 text-sm"
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && void postComment()}
              />
              <button
                type="button"
                disabled={busy || !text.trim()}
                onClick={() => void postComment()}
                className="rounded-full bg-spotify-green px-4 py-2 text-sm font-bold text-black disabled:opacity-50"
              >
                {replyTo ? "Reply" : "Post"}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-spotify-muted">
            <Link to="/login" className="text-spotify-green hover:underline">
              Log in
            </Link>{" "}
            to comment
          </p>
        )}
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </div>
    </section>
  );
}
