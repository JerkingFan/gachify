import { Users } from "lucide-react";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { playlistInviteUrl } from "@/lib/playlists";
import { useLibraryStore } from "@/store/libraryStore";
import type { ServerPlaylist } from "@/types";

type Props = {
  playlist: ServerPlaylist;
  isOwner: boolean;
  canEdit: boolean;
  onUpdate: (p: ServerPlaylist) => void;
};

export function PlaylistCollabPanel({ playlist, isOwner, canEdit, onUpdate }: Props) {
  const navigate = useNavigate();
  const enableCollab = useLibraryStore((s) => s.enablePlaylistCollaboration);
  const updatePlaylist = useLibraryStore((s) => s.updatePlaylist);
  const leaveCollab = useLibraryStore((s) => s.leavePlaylistCollaboration);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const isCollaborator = canEdit && !isOwner;

  if (!canEdit && !playlist.is_collaborative) return null;

  const inviteUrl = playlist.invite_token ? playlistInviteUrl(playlist.invite_token) : "";

  const copyInvite = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const toggleCollab = async (on: boolean) => {
    setBusy(true);
    try {
      if (on && !playlist.is_collaborative) {
        onUpdate(await enableCollab(playlist.id));
      } else {
        onUpdate(
          await updatePlaylist(playlist.id, { is_collaborative: on }),
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-8 rounded-lg bg-spotify-highlight p-4">
      <div className="mb-3 flex items-center gap-2">
        <Users className="h-5 w-5 text-spotify-green" />
        <h2 className="font-bold">Collaborative playlist</h2>
      </div>

      {isOwner && (
        <>
          <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(playlist.is_collaborative)}
              disabled={busy}
              onChange={(e) => void toggleCollab(e.target.checked)}
              className="accent-spotify-green"
            />
            Let friends edit via invite link
          </label>
          {playlist.is_collaborative && inviteUrl && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                readOnly
                value={inviteUrl}
                className="min-w-0 flex-1 rounded-md bg-spotify-base px-3 py-2 text-xs"
              />
              <button
                type="button"
                onClick={() => void copyInvite()}
                className="inline-flex items-center gap-1 rounded-full bg-spotify-green px-4 py-2 text-sm font-bold text-black"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy invite"}
              </button>
            </div>
          )}
          <p className="mt-2 text-xs text-spotify-muted">
            Anyone with the link can add, remove, and reorder tracks after logging in.
          </p>
        </>
      )}

      {isCollaborator && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-spotify-muted">
            You can edit this playlist together with the owner.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!window.confirm("Leave this collaborative playlist?")) return;
              setBusy(true);
              void leaveCollab(playlist.id)
                .then(() => navigate("/library"))
                .finally(() => setBusy(false));
            }}
            className="rounded-full border border-white/30 px-4 py-1.5 text-sm font-semibold hover:bg-white/10"
          >
            Leave playlist
          </button>
        </div>
      )}
    </section>
  );
}
