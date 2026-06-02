import { ListPlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { useLibraryStore } from "@/store/libraryStore";
import { usePlayerStore } from "@/store/playerStore";

type SaveMode = "full" | "upcoming";

export function SaveQueueMenu() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const playlists = useLibraryStore((s) => s.playlists);
  const createPlaylist = useLibraryStore((s) => s.createPlaylist);
  const saveQueueToPlaylist = useLibraryStore((s) => s.saveQueueToPlaylist);
  const queue = usePlayerStore((s) => s.queue);
  const queueIndex = usePlayerStore((s) => s.queueIndex);
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<SaveMode>("full");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const trackIds =
    mode === "upcoming"
      ? queue.slice(queueIndex + 1).map((t) => t.id)
      : queue.map((t) => t.id);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!isAuthenticated || queue.length === 0) return null;

  const saveTo = async (playlistId: string) => {
    if (!trackIds.length) return;
    setBusy(true);
    try {
      await saveQueueToPlaylist(playlistId, trackIds, "append");
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const saveAsNew = async () => {
    const title = window.prompt("New playlist name", "Queue snapshot");
    if (!title?.trim() || !trackIds.length) return;
    setBusy(true);
    try {
      const pl = await createPlaylist(title.trim());
      await saveQueueToPlaylist(pl.id, trackIds, "replace");
      setOpen(false);
      navigate(`/playlist/${pl.id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1 text-xs font-semibold hover:bg-white/10 disabled:opacity-50"
      >
        <ListPlus className="h-3.5 w-3.5" />
        Save to playlist
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-md border border-white/10 bg-spotify-elevated p-2 shadow-xl">
          <p className="px-2 py-1 text-xs font-semibold uppercase text-spotify-muted">
            What to save
          </p>
          <div className="mb-2 flex gap-1 px-1">
            {(
              [
                ["full", "Full queue"],
                ["upcoming", "Next up only"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={`flex-1 rounded-full px-2 py-1 text-xs font-semibold ${
                  mode === id ? "bg-spotify-green text-black" : "bg-white/10"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mb-2 px-2 text-xs text-spotify-muted">{trackIds.length} tracks</p>
          <button
            type="button"
            disabled={busy || !trackIds.length}
            onClick={() => void saveAsNew()}
            className="mb-2 w-full rounded-md bg-spotify-green px-3 py-2 text-sm font-bold text-black disabled:opacity-50"
          >
            New playlist from queue
          </button>
          {playlists.length > 0 && (
            <ul className="max-h-40 overflow-y-auto border-t border-white/10 pt-2">
              {playlists
                .filter((pl) => pl.can_edit !== false)
                .map((pl) => (
                  <li key={pl.id}>
                    <button
                      type="button"
                      disabled={busy || !trackIds.length}
                      className="w-full truncate rounded px-2 py-2 text-left text-sm hover:bg-white/10 disabled:opacity-50"
                      onClick={() => void saveTo(pl.id)}
                    >
                      {pl.title}
                      {!pl.is_owner && (
                        <span className="ml-1 text-xs text-spotify-muted">(collab)</span>
                      )}
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
