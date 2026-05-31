import type { GachiMetadata, Track } from "@/types";

export function parseGachiMeta(track: Track): GachiMetadata {
  const raw = track.gachi_metadata;
  if (!raw || typeof raw !== "object") return {};
  return raw as GachiMetadata;
}

export function formatDuration(ms: number): string {
  if (!ms || ms < 0) return "0:00";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function getPreviewUrl(track: Track): string | null {
  const meta = parseGachiMeta(track);
  if (meta.preview_url && typeof meta.preview_url === "string") {
    return meta.preview_url;
  }
  return null;
}

/** Deterministic gradient from track id (Spotify-style placeholders). */
export function coverGradient(track: Track): string {
  const meta = parseGachiMeta(track);
  if (meta.cover_gradient) return meta.cover_gradient;
  let hash = 0;
  for (let i = 0; i < track.id.length; i++) {
    hash = track.id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hues = [
    [26, 71, 42],
    [61, 26, 71],
    [71, 42, 26],
    [26, 61, 71],
    [42, 71, 26],
  ];
  const [r, g, b] = hues[Math.abs(hash) % hues.length];
  return `linear-gradient(135deg, rgb(${r * 3},${g * 3},${b * 3}) 0%, #282828 100%)`;
}

export function getArtistName(track: Track): string {
  if (track.creator?.display_name) return track.creator.display_name;
  if (track.creator?.handle) return track.creator.handle;
  return "Unknown artist";
}

export function getSubtitle(track: Track): string {
  const meta = parseGachiMeta(track);
  const parts: string[] = [];
  if (meta.dominant_male_sample) {
    parts.push(meta.dominant_male_sample.replace(/_/g, " "));
  }
  if (meta.mood_tags?.length) {
    parts.push(meta.mood_tags.slice(0, 2).join(", "));
  }
  return parts.length ? parts.join(" · ") : "Gachi remix";
}

export function searchTracks(tracks: Track[], query: string): Track[] {
  const q = query.trim().toLowerCase();
  if (!q) return tracks;
  return tracks.filter((t) => {
    const meta = parseGachiMeta(t);
    const hay = [
      t.title,
      meta.dominant_male_sample,
      ...(meta.mood_tags ?? []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q) || t.title.toLowerCase().includes(q);
  });
}
