import { useState } from "react";
import { useLibraryStore } from "@/store/libraryStore";
import { useAuthStore } from "@/store/authStore";
import type { Track } from "@/types";

type Props = {
  track: Track;
  onClose?: () => void;
};

export function AddToPlaylistMenu({ track, onClose }: Props) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const playlists = useLibraryStore((s) => s.playlists);
  const addTracks = useLibraryStore((s) => s.addTracksToPlaylist);
  const [busy, setBusy] = useState(false);

  if (!isAuthenticated) {
    return (
      <p className="rounded-md bg-spotify-elevated p-3 text-sm text-spotify-muted">
        Log in to save to a playlist.
      </p>
    );
  }

  if (!playlists.length) {
    return (
      <p className="rounded-md bg-spotify-elevated p-3 text-sm text-spotify-muted">
        Create a playlist from the sidebar first.
      </p>
    );
  }

  return (
    <div className="min-w-[200px] rounded-md bg-spotify-elevated p-2 shadow-xl">
      <p className="px-2 py-1 text-xs font-semibold uppercase text-spotify-muted">
        Add to playlist
      </p>
      <ul className="max-h-48 overflow-y-auto">
        {playlists.map((pl) => (
          <li key={pl.id}>
            <button
              type="button"
              disabled={busy}
              className="w-full truncate rounded px-2 py-2 text-left text-sm hover:bg-white/10"
              onClick={() => {
                setBusy(true);
                void addTracks(pl.id, [track.id])
                  .then(() => onClose?.())
                  .finally(() => setBusy(false));
              }}
            >
              {pl.title}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
