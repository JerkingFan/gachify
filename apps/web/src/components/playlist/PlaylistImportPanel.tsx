import { Check, Loader2, Music2, Upload, Youtube } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { useLibraryStore } from "@/store/libraryStore";

type Tab = "url" | "paste";

type PreviewItem = {
  position: number;
  source_title: string;
  source_artist: string;
  matched_track?: {
    id: string;
    title: string;
    artist: string;
  };
};

type Preview = {
  source: string;
  playlist_title: string;
  items: PreviewItem[];
  matched_count: number;
  total_count: number;
  warnings?: string[];
};

export function PlaylistImportPanel() {
  const load = useLibraryStore((s) => s.load);
  const [tab, setTab] = useState<Tab>("url");
  const [url, setUrl] = useState("");
  const [lines, setLines] = useState("");
  const [titleHint, setTitleHint] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [playlistLink, setPlaylistLink] = useState<string | null>(null);
  const [caps, setCaps] = useState<{ spotify_url: boolean; youtube_url: boolean; paste_lines: boolean } | null>(null);

  useEffect(() => {
    void api.getPlaylistImportCapabilities().then(setCaps).catch(() => null);
  }, []);

  const resetPreview = () => {
    setPreview(null);
    setSelected(new Set());
    setError(null);
    setSuccess(null);
    setPlaylistLink(null);
  };

  const runPreview = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    setPlaylistLink(null);
    try {
      const res = await api.previewPlaylistImport(
        tab === "url"
          ? { url: url.trim() }
          : { lines, title_hint: titleHint.trim() || undefined },
      );
      setPreview(res);
      const ids = new Set<string>();
      for (const item of res.items) {
        if (item.matched_track) ids.add(item.matched_track.id);
      }
      setSelected(ids);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
      setPreview(null);
    } finally {
      setLoading(false);
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const orderedTrackIds = useMemo(() => {
    if (!preview) return [];
    const ids: string[] = [];
    for (const item of preview.items) {
      const id = item.matched_track?.id;
      if (id && selected.has(id) && !ids.includes(id)) {
        ids.push(id);
      }
    }
    return ids;
  }, [preview, selected]);

  const confirmImport = async () => {
    if (!preview || orderedTrackIds.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      const pl = await api.confirmPlaylistImport({
        title: preview.playlist_title,
        description: `Imported from ${preview.source}`,
        track_ids: orderedTrackIds,
      });
      setSuccess(`Created playlist “${pl.title}” with ${orderedTrackIds.length} tracks.`);
      await load(true);
      setPreview(null);
      setPlaylistLink(pl.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const urlHint = useCallback(() => {
    if (!caps) return null;
    if (tab !== "url") return null;
    if (!caps.spotify_url && !caps.youtube_url) {
      return "URL fetch is not configured on this server — use Paste track list (works instantly).";
    }
    const parts: string[] = [];
    if (caps.spotify_url) parts.push("Spotify");
    if (caps.youtube_url) parts.push("YouTube");
    return `${parts.join(" & ")} playlist links supported.`;
  }, [caps, tab]);

  return (
    <section className="mb-8 rounded-lg border border-spotify-green/40 bg-spotify-highlight/60 p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Import your dungeon queue</h2>
          <p className="mt-1 text-sm text-spotify-muted">
            Paste a Spotify / YouTube playlist link or a list of tracks — we fuzzy-match remixes on
            Gachify and create a playlist in one click.
          </p>
        </div>
        <Upload className="h-8 w-8 shrink-0 text-spotify-green" />
      </div>

      <div className="mb-4 flex gap-2">
        <TabBtn active={tab === "url"} onClick={() => { setTab("url"); resetPreview(); }}>
          <Music2 className="h-3.5 w-3.5" />
          Playlist URL
        </TabBtn>
        <TabBtn active={tab === "paste"} onClick={() => { setTab("paste"); resetPreview(); }}>
          Paste track list
        </TabBtn>
      </div>

      {tab === "url" ? (
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://open.spotify.com/playlist/… or youtube.com/playlist?list=…"
          className="mb-2 w-full rounded-md bg-spotify-base px-3 py-2 text-sm"
        />
      ) : (
        <div className="space-y-2">
          <input
            value={titleHint}
            onChange={(e) => setTitleHint(e.target.value)}
            placeholder="Playlist name (optional)"
            className="w-full rounded-md bg-spotify-base px-3 py-2 text-sm"
          />
          <textarea
            value={lines}
            onChange={(e) => setLines(e.target.value)}
            rows={6}
            placeholder={"Artist - Track title\nAnother track\nTitle only also works"}
            className="w-full rounded-md bg-spotify-base px-3 py-2 font-mono text-xs"
          />
        </div>
      )}

      {urlHint() && <p className="mb-3 text-xs text-spotify-muted">{urlHint()}</p>}

      {!preview && (
        <button
          type="button"
          disabled={loading || (tab === "url" ? !url.trim() : !lines.trim())}
          onClick={() => void runPreview()}
          className="inline-flex items-center gap-2 rounded-full bg-spotify-green px-5 py-2 text-sm font-bold text-black disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Match on Gachify
        </button>
      )}

      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
      {success && (
        <p className="mt-3 text-sm text-spotify-green">
          {success}{" "}
          {playlistLink ? (
            <Link to={`/playlist/${playlistLink}`} className="underline">
              Open playlist
            </Link>
          ) : (
            <Link to="/library" className="underline">
              View library
            </Link>
          )}
        </p>
      )}

      {preview && (
        <div className="mt-5 border-t border-white/10 pt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold">{preview.playlist_title}</p>
              <p className="text-xs text-spotify-muted">
                {preview.matched_count} / {preview.total_count} matched on Gachify
                {preview.source === "youtube" && (
                  <Youtube className="ml-1 inline h-3 w-3 text-red-400" />
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={resetPreview}
              className="text-xs text-spotify-muted hover:text-white"
            >
              Start over
            </button>
          </div>
          {preview.warnings?.map((w) => (
            <p key={w} className="mb-2 text-xs text-amber-300">
              {w}
            </p>
          ))}
          <ul className="mb-4 max-h-64 space-y-1 overflow-y-auto rounded-md bg-spotify-black/40 p-2 text-sm">
            {preview.items.map((item) => {
              const m = item.matched_track;
              const checked = m ? selected.has(m.id) : false;
              return (
                <li
                  key={item.position}
                  className="flex items-start gap-2 rounded px-2 py-1.5 hover:bg-white/5"
                >
                  {m ? (
                    <button
                      type="button"
                      onClick={() => toggle(m.id)}
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                        checked
                          ? "border-spotify-green bg-spotify-green text-black"
                          : "border-white/30"
                      }`}
                      aria-label={checked ? "Deselect match" : "Select match"}
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </button>
                  ) : (
                    <span className="mt-0.5 h-5 w-5 shrink-0 rounded border border-white/10 bg-white/5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-spotify-muted">
                      {item.source_artist ? `${item.source_artist} — ` : ""}
                      {item.source_title}
                    </p>
                    {m ? (
                      <p className="truncate text-xs text-spotify-green">
                        → {m.title}
                        {m.artist ? ` · ${m.artist}` : ""}
                      </p>
                    ) : (
                      <p className="text-xs text-spotify-subtle">No match in catalog</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            disabled={importing || orderedTrackIds.length === 0}
            onClick={() => void confirmImport()}
            className="inline-flex items-center gap-2 rounded-full bg-spotify-green px-5 py-2.5 text-sm font-bold text-black disabled:opacity-50"
          >
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Import {orderedTrackIds.length} tracks
          </button>
        </div>
      )}
    </section>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
        active ? "bg-white text-black" : "bg-black/40 text-spotify-muted hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
