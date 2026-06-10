import { ImagePlus, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { COVER_ACCEPT, uploadTrackCover } from "@/lib/coverUpload";
import type { Track } from "@/types";

type Props = {
  track: Track;
  onSaved?: (track: Track) => void;
  variant?: "button" | "tile";
};

export function TrackCoverButton({ track, onSaved, variant = "button" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = () => {
    if (!uploading) inputRef.current?.click();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const updated = await uploadTrackCover(track.id, file);
      onSaved?.(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cover upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (variant === "tile") {
    return (
      <div className="space-y-1">
        <button
          type="button"
          onClick={pick}
          disabled={uploading}
          className="group relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-white/20 bg-spotify-highlight hover:border-spotify-green disabled:opacity-50"
          title="Upload cover image (JPEG, PNG, WebP)"
        >
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin text-spotify-green" />
          ) : (
            <div className="flex flex-col items-center gap-1 px-2 text-center">
              <ImagePlus className="h-6 w-6 text-spotify-muted group-hover:text-white" />
              <span className="text-[10px] leading-tight text-spotify-muted group-hover:text-white">
                Upload cover
              </span>
            </div>
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={COVER_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            void onFile(f);
          }}
        />
        {error && <p className="max-w-[7rem] text-[10px] text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="inline-flex flex-col items-end">
      <label className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-white/20 px-3 py-1 text-xs font-semibold hover:bg-white/10">
        {uploading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <ImagePlus className="h-3.5 w-3.5" />
        )}
        Cover
        <input
          ref={inputRef}
          type="file"
          accept={COVER_ACCEPT}
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            void onFile(f);
          }}
        />
      </label>
      {error && <span className="mt-1 max-w-[10rem] text-right text-[10px] text-red-400">{error}</span>}
    </div>
  );
}
