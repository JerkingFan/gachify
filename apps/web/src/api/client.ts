import type {
  LikedResponse,
  PlaylistsResponse,
  ServerPlaylist,
  TokenResponse,
  Track,
  TracksResponse,
  User,
} from "@/types";

const BASE = "/api/v1";

const ACCESS_KEY = "gachify:access_token";
const REFRESH_KEY = "gachify:refresh_token";

export function getStoredTokens() {
  return {
    access: localStorage.getItem(ACCESS_KEY),
    refresh: localStorage.getItem(REFRESH_KEY),
  };
}

export function storeTokens(access: string, refresh: string) {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

type AuthTokens = { access: string | null; refresh: string | null };

let tokenProvider: () => AuthTokens = getStoredTokens;
let onUnauthorized: (() => void) | null = null;

export function setTokenProvider(fn: () => AuthTokens) {
  tokenProvider = fn;
}

export function setOnUnauthorized(fn: () => void) {
  onUnauthorized = fn;
}

let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  const { refresh } = tokenProvider();
  if (!refresh) return false;
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${BASE}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ refresh_token: refresh }),
        });
        if (!res.ok) return false;
        const data = (await res.json()) as TokenResponse;
        storeTokens(data.access_token, data.refresh_token);
        return true;
      } catch {
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

async function request<T>(
  path: string,
  init?: RequestInit,
  auth = false,
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init?.headers as Record<string, string>),
  };
  if (init?.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  if (auth) {
    const { access } = tokenProvider();
    if (access) headers.Authorization = `Bearer ${access}`;
  }

  const doFetch = () =>
    fetch(`${BASE}${path}`, { ...init, headers });

  let res = await doFetch();

  if (res.status === 401 && auth) {
    const ok = await refreshSession();
    if (ok) {
      const { access } = tokenProvider();
      if (access) headers.Authorization = `Bearer ${access}`;
      res = await doFetch();
    } else {
      onUnauthorized?.();
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg =
      (body as { message?: string }).message ?? `Request failed (${res.status})`;
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  register(body: RegisterInput): Promise<TokenResponse> {
    return request<TokenResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  login(body: LoginInput): Promise<TokenResponse> {
    return request<TokenResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  logout(refreshToken: string): Promise<void> {
    return request<void>("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  },

  me(): Promise<User> {
    return request<User>("/auth/me", {}, true);
  },

  getTracks(params?: {
    limit?: number;
    offset?: number;
    status?: string;
    creator_id?: string;
    q?: string;
  }): Promise<TracksResponse> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    if (params?.status) q.set("status", params.status);
    if (params?.creator_id) q.set("creator_id", params.creator_id);
    if (params?.q?.trim()) q.set("q", params.q.trim());
    const qs = q.toString();
    return request<TracksResponse>(`/tracks${qs ? `?${qs}` : ""}`);
  },

  getTrack(id: string): Promise<Track> {
    return request<Track>(`/tracks/${id}`);
  },

  getUser(id: string): Promise<User> {
    return request<User>(`/users/${id}`);
  },

  getLiked(): Promise<LikedResponse> {
    return request<LikedResponse>("/me/liked", {}, true);
  },

  likeTrack(trackId: string): Promise<void> {
    return request<void>(`/me/liked/${trackId}`, { method: "PUT" }, true);
  },

  unlikeTrack(trackId: string): Promise<void> {
    return request<void>(`/me/liked/${trackId}`, { method: "DELETE" }, true);
  },

  getPlaylists(): Promise<PlaylistsResponse> {
    return request<PlaylistsResponse>("/me/playlists", {}, true);
  },

  getPlaylist(id: string): Promise<ServerPlaylist> {
    return request<ServerPlaylist>(`/me/playlists/${id}`, {}, true);
  },

  importLibrary(body: {
    liked_track_ids: string[];
    playlists: { name: string; description: string; track_ids: string[] }[];
  }): Promise<void> {
    return request<void>("/me/library/import", {
      method: "POST",
      body: JSON.stringify(body),
    }, true);
  },

  initUpload(body: {
    title: string;
    filename: string;
    content_type: string;
    duration_ms?: number;
    gachi_metadata?: Record<string, unknown>;
  }): Promise<{
    track_id: string;
    upload_url: string;
    object_key: string;
    expires_in_sec: number;
  }> {
    return request("/creator/uploads/init", {
      method: "POST",
      body: JSON.stringify(body),
    }, true);
  },

  completeUpload(
    trackId: string,
    body: { duration_ms?: number },
  ): Promise<Track> {
    return request<Track>(`/creator/uploads/${trackId}/complete`, {
      method: "POST",
      body: JSON.stringify(body),
    }, true);
  },

  getUploadStatus(trackId: string): Promise<Track> {
    return request<Track>(`/creator/uploads/${trackId}/status`, {}, true);
  },

  retryTranscode(trackId: string): Promise<Track> {
    return request<Track>(`/creator/uploads/${trackId}/retry`, {
      method: "POST",
    }, true);
  },

  getCreatorTracks(): Promise<{ items: Track[] }> {
    return request<{ items: Track[] }>("/creator/tracks?limit=50", {}, true);
  },

  getPlayback(trackId: string): Promise<{
    format: "hls" | "mp3";
    playlist_url?: string;
    fallback_url?: string;
    expires_in?: number;
    duration_ms: number;
  }> {
    return request(`/stream/tracks/${trackId}/playback`);
  },
};

export type RegisterInput = {
  email: string;
  password: string;
  handle: string;
  display_name?: string;
};

export type LoginInput = {
  email: string;
  password: string;
};
