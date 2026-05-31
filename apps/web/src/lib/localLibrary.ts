/** Legacy localStorage keys — migrated to server on first login. */

const LIKED_KEY = "gachify:liked";
const PLAYLISTS_KEY = "gachify:playlists";
const MIGRATED_KEY = "gachify:library_migrated";

interface LegacyPlaylist {
  id: string;
  name: string;
  description?: string;
  trackIds: string[];
  coverSeed?: string;
}

export function isLibraryMigrated(): boolean {
  return localStorage.getItem(MIGRATED_KEY) === "1";
}

export function markLibraryMigrated(): void {
  localStorage.setItem(MIGRATED_KEY, "1");
  localStorage.removeItem(LIKED_KEY);
  localStorage.removeItem(PLAYLISTS_KEY);
}

export function getLegacyLikedIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LIKED_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function getLegacyPlaylists(): LegacyPlaylist[] {
  try {
    const raw = localStorage.getItem(PLAYLISTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as LegacyPlaylist[];
  } catch {
    return [];
  }
}

export function hasLegacyLibraryData(): boolean {
  if (isLibraryMigrated()) return false;
  return (
    getLegacyLikedIds().length > 0 || getLegacyPlaylists().length > 0
  );
}

export function buildImportPayload() {
  const legacy = getLegacyPlaylists().filter(
    (p) => p.id !== "pl-liked" && p.trackIds?.length,
  );
  return {
    liked_track_ids: getLegacyLikedIds(),
    playlists: legacy.map((p) => ({
      name: p.name,
      description: p.description ?? "",
      track_ids: p.trackIds,
    })),
  };
}
