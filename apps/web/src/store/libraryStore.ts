import { create } from "zustand";
import { api } from "@/api/client";
import {
  getLegacyLikedIds,
  getLegacyPlaylists,
  isLibraryMigrated,
} from "@/lib/localLibrary";
import type { ServerPlaylist } from "@/types";

const LIKED_KEY = "gachify:liked";

function readGuestLiked(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(LIKED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function writeGuestLiked(ids: Set<string>) {
  localStorage.setItem(LIKED_KEY, JSON.stringify([...ids]));
}

interface LibraryState {
  likedIds: Set<string>;
  playlists: ServerPlaylist[];
  loaded: boolean;
  load: (authenticated: boolean) => Promise<void>;
  reset: () => void;
  isLiked: (trackId: string) => boolean;
  toggleLiked: (trackId: string, authenticated: boolean) => Promise<boolean>;
  createPlaylist: (title: string, description?: string) => Promise<ServerPlaylist>;
  updatePlaylist: (
    id: string,
    patch: { title?: string; description?: string },
  ) => Promise<ServerPlaylist>;
  deletePlaylist: (id: string) => Promise<void>;
  addTracksToPlaylist: (playlistId: string, trackIds: string[]) => Promise<ServerPlaylist>;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => Promise<ServerPlaylist>;
  setPlaylistTracks: (playlistId: string, trackIds: string[]) => Promise<ServerPlaylist>;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  likedIds: new Set(),
  playlists: [],
  loaded: false,

  reset() {
    set({ likedIds: new Set(), playlists: [], loaded: false });
  },

  async load(authenticated) {
    if (!authenticated) {
      const legacyPl = getLegacyPlaylists();
      const guestPlaylists: ServerPlaylist[] = legacyPl.map((p) => ({
        id: p.id,
        owner_id: "",
        title: p.name,
        description: p.description ?? "",
        is_public: false,
        items: p.trackIds.map((track_id, position) => ({
          track_id,
          position,
          added_at: new Date().toISOString(),
        })),
        created_at: "",
        updated_at: "",
      }));
      set({
        likedIds: readGuestLiked(),
        playlists: guestPlaylists,
        loaded: true,
      });
      return;
    }

    const [liked, pl] = await Promise.all([
      api.getLiked(),
      api.getPlaylists(),
    ]);
    set({
      likedIds: new Set(liked.track_ids),
      playlists: pl.items,
      loaded: true,
    });
  },

  isLiked(trackId) {
    return get().likedIds.has(trackId);
  },

  async toggleLiked(trackId, authenticated) {
    const liked = get().likedIds.has(trackId);
    const next = new Set(get().likedIds);

    if (!authenticated) {
      if (liked) next.delete(trackId);
      else next.add(trackId);
      writeGuestLiked(next);
      set({ likedIds: next });
      return !liked;
    }

    if (liked) {
      await api.unlikeTrack(trackId);
      next.delete(trackId);
    } else {
      await api.likeTrack(trackId);
      next.add(trackId);
    }
    set({ likedIds: next });
    return !liked;
  },

  async createPlaylist(title, description = "") {
    const p = await api.createPlaylist({ title, description });
    set({ playlists: [...get().playlists, p] });
    return p;
  },

  async updatePlaylist(id, patch) {
    const p = await api.updatePlaylist(id, patch);
    set({
      playlists: get().playlists.map((pl) => (pl.id === id ? p : pl)),
    });
    return p;
  },

  async deletePlaylist(id) {
    await api.deletePlaylist(id);
    set({ playlists: get().playlists.filter((pl) => pl.id !== id) });
  },

  async addTracksToPlaylist(playlistId, trackIds) {
    const p = await api.addTracksToPlaylist(playlistId, trackIds);
    set({
      playlists: get().playlists.map((pl) => (pl.id === playlistId ? p : pl)),
    });
    return p;
  },

  async removeTrackFromPlaylist(playlistId, trackId) {
    const p = await api.removeTrackFromPlaylist(playlistId, trackId);
    set({
      playlists: get().playlists.map((pl) => (pl.id === playlistId ? p : pl)),
    });
    return p;
  },

  async setPlaylistTracks(playlistId, trackIds) {
    const p = await api.setPlaylistTracks(playlistId, trackIds);
    set({
      playlists: get().playlists.map((pl) => (pl.id === playlistId ? p : pl)),
    });
    return p;
  },
}));

// Re-export for migration check
export { isLibraryMigrated, getLegacyLikedIds };
