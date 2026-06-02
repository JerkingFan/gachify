import { Globe, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useLibraryStore } from "@/store/libraryStore";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function CreatePlaylistModal({ open, onClose }: Props) {
  const createPlaylist = useLibraryStore((s) => s.createPlaylist);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [isCollab, setIsCollab] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await createPlaylist(title.trim(), description.trim(), isPublic, isCollab);
      setTitle("");
      setDescription("");
      setIsPublic(false);
      setIsCollab(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create playlist");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-playlist-title"
      onClick={onClose}
    >
      <form
        onSubmit={(e) => void submit(e)}
        className="w-full max-w-md rounded-xl border border-white/10 bg-spotify-elevated p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="create-playlist-title" className="text-lg font-bold">
            New playlist
          </h2>
          <button type="button" onClick={onClose} className="btn-icon" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <input
          autoFocus
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Playlist title"
          className="mb-3 w-full rounded-md bg-spotify-highlight px-3 py-2"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          rows={2}
          className="mb-3 w-full rounded-md bg-spotify-highlight px-3 py-2 text-sm"
        />
        <label className="mb-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            className="accent-spotify-green"
          />
          <Globe className="h-4 w-4" />
          Public — in community &amp; on your profile
        </label>
        <label className="mb-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isCollab}
            onChange={(e) => setIsCollab(e.target.checked)}
            className="accent-spotify-green"
          />
          <Users className="h-4 w-4" />
          Collaborative — invite link to edit together
        </label>
        {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={creating}
          className="w-full rounded-full bg-spotify-green py-2.5 text-sm font-bold text-black disabled:opacity-50"
        >
          {creating ? "Creating…" : "Create playlist"}
        </button>
      </form>
    </div>
  );
}
