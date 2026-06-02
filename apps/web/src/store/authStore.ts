import { create } from "zustand";
import {
  api,
  clearTokens,
  setOnUnauthorized,
  setTokenProvider,
  storeTokens,
  getStoredTokens,
} from "@/api/client";
import type { RegisterInput } from "@/api/client";
import {
  buildImportPayload,
  hasLegacyLibraryData,
  markLibraryMigrated,
} from "@/lib/localLibrary";
import { syncRecentFromServer } from "@/lib/storage";
import type { User } from "@/types";
import { useLibraryStore } from "./libraryStore";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => {
  setTokenProvider(getStoredTokens);
  setOnUnauthorized(() => {
    clearTokens();
    set({ user: null, isAuthenticated: false });
    useLibraryStore.getState().reset();
  });

  return {
    user: null,
    isLoading: true,
    isAuthenticated: false,

    async init() {
      set({ isLoading: true });
      const { access } = getStoredTokens();
      if (!access) {
        await useLibraryStore.getState().load(false);
        set({ isLoading: false, isAuthenticated: false });
        return;
      }
      try {
        const user = await api.me();
        set({ user, isAuthenticated: true, isLoading: false });
        await useLibraryStore.getState().load(true);
        await syncRecentFromServer();
        await maybeMigrateLibrary();
      } catch {
        clearTokens();
        set({ user: null, isAuthenticated: false, isLoading: false });
        await useLibraryStore.getState().load(false);
      }
    },

    async login(email, password) {
      const tokens = await api.login({ email, password });
      storeTokens(tokens.access_token, tokens.refresh_token);
      set({ user: tokens.user, isAuthenticated: true });
      await useLibraryStore.getState().load(true);
      await syncRecentFromServer();
      await maybeMigrateLibrary();
    },

    async register(input) {
      const tokens = await api.register(input);
      storeTokens(tokens.access_token, tokens.refresh_token);
      set({ user: tokens.user, isAuthenticated: true });
      await useLibraryStore.getState().load(true);
      await syncRecentFromServer();
      await maybeMigrateLibrary();
    },

    async logout() {
      const { refresh } = getStoredTokens();
      if (refresh) {
        try {
          await api.logout(refresh);
        } catch {
          /* ignore */
        }
      }
      clearTokens();
      useLibraryStore.getState().reset();
      set({ user: null, isAuthenticated: false });
    },

    async refreshUser() {
      try {
        const user = await api.me();
        set({ user, isAuthenticated: true });
      } catch {
        /* ignore */
      }
    },
  };
});

async function maybeMigrateLibrary() {
  if (!hasLegacyLibraryData()) return;
  const payload = buildImportPayload();
  if (
    payload.liked_track_ids.length === 0 &&
    payload.playlists.length === 0
  ) {
    markLibraryMigrated();
    return;
  }
  try {
    await api.importLibrary(payload);
    markLibraryMigrated();
    await useLibraryStore.getState().load(true);
  } catch {
    /* keep local data until next login */
  }
}
