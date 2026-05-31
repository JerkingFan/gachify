import type { PlaylistItem, ServerPlaylist } from "@/types";

export function parsePlaylistItems(pl: ServerPlaylist): PlaylistItem[] {
  if (Array.isArray(pl.items)) return pl.items;
  if (typeof pl.items === "string") {
    try {
      return JSON.parse(pl.items) as PlaylistItem[];
    } catch {
      return [];
    }
  }
  return [];
}

export function playlistTrackIds(pl: ServerPlaylist): string[] {
  return parsePlaylistItems(pl)
    .sort((a, b) => a.position - b.position)
    .map((i) => i.track_id);
}

export function coverSeedFromPlaylist(pl: ServerPlaylist): string {
  const t = pl.title.toLowerCase();
  if (t.includes("dungeon")) return "dungeon";
  if (t.includes("battle")) return "battle";
  if (t.includes("liked")) return "liked";
  return pl.id.slice(0, 8);
}
