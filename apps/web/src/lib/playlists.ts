import type { PlaylistItem, PlaylistSortKey, ServerPlaylist } from "@/types";

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

export function playlistInviteUrl(token: string): string {
  const path = `/playlist/join/${encodeURIComponent(token)}`;
  if (typeof window !== "undefined") {
    return `${window.location.origin}${path}`;
  }
  return path;
}

export function sortPlaylists(playlists: ServerPlaylist[], key: PlaylistSortKey): ServerPlaylist[] {
  const copy = [...playlists];
  switch (key) {
    case "title":
      return copy.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
    case "created":
      return copy.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    case "updated":
    default:
      return copy.sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      );
  }
}
