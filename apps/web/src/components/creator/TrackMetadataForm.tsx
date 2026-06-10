import { useEffect, useState } from "react";
import { COVER_PRESETS, type DraftMetadataFields } from "@/lib/creatorMetadata";
import { COVER_ACCEPT } from "@/lib/coverUpload";

type Props = {
  title: string;
  description: string;
  fields: DraftMetadataFields;
  lrcFile: File | null;
  coverFile: File | null;
  onTitle: (v: string) => void;
  onDescription: (v: string) => void;
  onFields: (f: DraftMetadataFields) => void;
  onLrcFile: (f: File | null) => void;
  onLrcText: (v: string) => void;
  onCoverFile: (f: File | null) => void;
};

export function TrackMetadataForm({
  title,
  description,
  fields,
  lrcFile,
  coverFile,
  onTitle,
  onDescription,
  onFields,
  onLrcFile,
  onLrcText,
  onCoverFile,
}: Props) {
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!coverFile) {
      setCoverPreview(null);
      return;
    }
    const url = URL.createObjectURL(coverFile);
    setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [coverFile]);

  const set = (patch: Partial<DraftMetadataFields>) =>
    onFields({ ...fields, ...patch });

  return (
    <div className="space-y-5">
      <label className="block text-sm">
        <span className="text-spotify-muted">Title</span>
        <input
          required
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          className="mt-1 w-full rounded-md bg-spotify-highlight px-3 py-2 text-white outline-none focus:ring-2 focus:ring-spotify-green"
          placeholder="Deep Dark Fantasy (Your Mix)"
        />
      </label>

      <label className="block text-sm">
        <span className="text-spotify-muted">Description</span>
        <textarea
          value={description}
          onChange={(e) => onDescription(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md bg-spotify-highlight px-3 py-2 text-white"
          placeholder="Dungeon lore, sample sources, BPM notes…"
        />
      </label>

      <div>
        <p className="mb-2 text-sm text-spotify-muted">Cover gradient</p>
        <div className="flex flex-wrap gap-2">
          {COVER_PRESETS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => set({ coverGradient: g })}
              className={`h-10 w-10 rounded-md border-2 ${
                fields.coverGradient === g ? "border-spotify-green" : "border-transparent"
              }`}
              style={{ background: g }}
              aria-label="Select cover gradient"
            />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm text-spotify-muted">Cover image (optional)</p>
        <div className="flex items-start gap-4">
          <div
            className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/10 bg-spotify-highlight"
            style={
              !coverPreview && fields.coverGradient
                ? { background: fields.coverGradient }
                : undefined
            }
          >
            {coverPreview ? (
              <img src={coverPreview} alt="" className="h-full w-full object-cover" />
            ) : fields.coverUrl.trim() ? (
              <img
                src={fields.coverUrl.trim()}
                alt=""
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <span className="text-xs text-spotify-subtle">No image</span>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <input
              type="file"
              accept={COVER_ACCEPT}
              onChange={(e) => onCoverFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-spotify-muted file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:text-white"
            />
            {coverFile && (
              <p className="text-xs text-spotify-green">Selected: {coverFile.name}</p>
            )}
            <label className="block text-xs">
              <span className="text-spotify-muted">Or external image URL</span>
              <input
                value={fields.coverUrl}
                onChange={(e) => set({ coverUrl: e.target.value })}
                className="mt-1 w-full rounded-md bg-spotify-highlight px-3 py-2 text-sm"
                placeholder="https://…"
              />
            </label>
          </div>
        </div>
      </div>

      <label className="block text-sm">
        <span className="text-spotify-muted">Mood tags (comma-separated)</span>
        <input
          value={fields.moodTags}
          onChange={(e) => set({ moodTags: e.target.value })}
          className="mt-1 w-full rounded-md bg-spotify-highlight px-3 py-2"
          placeholder="dungeon, intense, continuous"
        />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="text-sm">
          <span className="text-spotify-muted">♂️ Power ({fields.gachiPower})</span>
          <input
            type="range"
            min={1}
            max={100}
            value={fields.gachiPower}
            onChange={(e) => set({ gachiPower: Number(e.target.value) })}
            className="mt-2 w-full accent-spotify-green"
          />
        </label>
        <label className="text-sm">
          <span className="text-spotify-muted">Deepness ({fields.deepness})</span>
          <input
            type="range"
            min={1}
            max={10}
            step={0.1}
            value={fields.deepness}
            onChange={(e) => set({ deepness: Number(e.target.value) })}
            className="mt-2 w-full accent-spotify-green"
          />
        </label>
      </div>

      <div className="space-y-3 rounded-lg border border-white/10 p-4">
        <p className="text-sm font-semibold">Karaoke lyrics (optional)</p>
        <textarea
          value={fields.lyricsLrc}
          onChange={(e) => {
            set({ lyricsLrc: e.target.value });
            onLrcText(e.target.value);
          }}
          rows={4}
          placeholder="[00:12.50]Hello ♂️ world"
          className="w-full rounded-md bg-spotify-highlight px-3 py-2 font-mono text-xs"
        />
        <input
          type="file"
          accept=".lrc,text/plain"
          onChange={(e) => onLrcFile(e.target.files?.[0] ?? null)}
          className="w-full text-sm text-spotify-muted"
        />
        {lrcFile && (
          <p className="text-xs text-spotify-green">Attached: {lrcFile.name}</p>
        )}
      </div>
    </div>
  );
}
