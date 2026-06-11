import type {
  AccountUser,
  ArtistsSearchResponse,
  LikedResponse,
  PlaylistsResponse,
  PublicProfile,
  PublicUserSummary,
  ServerPlaylist,
  TokenResponse,
  Track,
  TracksResponse,
  User,
} from "@/types";
import { apiUrl, getApiOrigin } from "@/lib/apiOrigin";
import { isNativeApp } from "@/lib/native";

const BASE = apiUrl("/api/v1");

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
    fetch(`${BASE}${path}`, { ...init, headers, mode: "cors" });

  let res: Response;
  try {
    res = await doFetch();
  } catch (err) {
    const hint = isNativeApp()
      ? ` Cannot reach ${getApiOrigin() || "API"}. Check network and rebuild APK with npm run apk -- --api http://YOUR_SERVER`
      : "";
    const msg = err instanceof Error ? err.message : "Network error";
    throw new Error(`${msg}${hint}`);
  }

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
    return request<void>(
      "/auth/logout",
      {
        method: "POST",
        body: JSON.stringify({ refresh_token: refreshToken }),
      },
      true,
    );
  },

  me(): Promise<AccountUser> {
    return request<AccountUser>("/auth/me", {}, true);
  },

  updateProfile(body: {
    display_name?: string;
    handle?: string;
    avatar_url?: string;
    profile_bio?: string;
    liked_tracks_public?: boolean;
    push_notifications?: "off" | "following";
  }): Promise<AccountUser> {
    return request<AccountUser>(
      "/auth/me",
      { method: "PATCH", body: JSON.stringify(body) },
      true,
    );
  },

  changePassword(body: {
    current_password: string;
    new_password: string;
  }): Promise<void> {
    return request<void>(
      "/auth/change-password",
      { method: "POST", body: JSON.stringify(body) },
      true,
    );
  },

  resendVerification(): Promise<void> {
    return request<void>("/auth/resend-verification", { method: "POST" }, true);
  },

  getUserByHandle(handle: string): Promise<User> {
    return request<User>(`/users/by-handle/${encodeURIComponent(handle)}`);
  },

  getPublicProfile(userId: string): Promise<PublicProfile> {
    return request<PublicProfile>(`/users/${userId}/profile`);
  },

  getUserPublicPlaylists(userId: string): Promise<PlaylistsResponse> {
    return request<PlaylistsResponse>(`/users/${userId}/playlists`);
  },

  getUserFollowing(userId: string): Promise<{ items: PublicUserSummary[] }> {
    return request<{ items: PublicUserSummary[] }>(`/users/${userId}/following`);
  },

  getUserPublicLiked(userId: string): Promise<TracksResponse> {
    return request<TracksResponse>(`/users/${userId}/liked`);
  },

  getNotifications(): Promise<{ items: import("@/types").Notification[]; unread: number }> {
    return request("/notifications", {}, true);
  },

  getPushVapidPublicKey(): Promise<{ enabled: boolean; public_key: string }> {
    return request("/push/vapid-public-key");
  },

  subscribePush(body: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }): Promise<void> {
    return request<void>("/me/push/subscribe", {
      method: "POST",
      body: JSON.stringify(body),
    }, true);
  },

  unsubscribePush(body: { endpoint: string }): Promise<void> {
    return request<void>("/me/push/subscribe", {
      method: "DELETE",
      body: JSON.stringify(body),
    }, true);
  },

  markNotificationsRead(): Promise<void> {
    return request<void>("/notifications/read-all", { method: "POST" }, true);
  },

  getTrackReactions(trackId: string): Promise<import("@/types").TrackReactionsSummary> {
    return request(`/tracks/${trackId}/reactions`);
  },

  setTrackReaction(trackId: string, reaction: string): Promise<import("@/types").TrackReactionsSummary> {
    return request(`/tracks/${trackId}/reactions`, {
      method: "POST",
      body: JSON.stringify({ reaction }),
    }, true);
  },

  clearTrackReaction(trackId: string): Promise<import("@/types").TrackReactionsSummary> {
    return request(`/tracks/${trackId}/reactions`, { method: "DELETE" }, true);
  },

  getTrackComments(trackId: string): Promise<{ items: import("@/types").TrackComment[] }> {
    return request(`/tracks/${trackId}/comments`);
  },

  addTrackComment(trackId: string, body: string, parentId?: string): Promise<import("@/types").TrackComment> {
    return request(`/tracks/${trackId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body, parent_id: parentId ?? null }),
    }, true);
  },

  reportTrack(trackId: string, reason: string, detail = ""): Promise<void> {
    return request<void>(`/tracks/${trackId}/report`, {
      method: "POST",
      body: JSON.stringify({ reason, detail }),
    }, true);
  },

  clonePlaylist(playlistId: string): Promise<ServerPlaylist> {
    return request<ServerPlaylist>("/me/playlists/clone", {
      method: "POST",
      body: JSON.stringify({ playlist_id: playlistId }),
    }, true);
  },

  getTracks(params?: {
    limit?: number;
    offset?: number;
    status?: string;
    creator_id?: string;
    q?: string;
    sort?: string;
    mood?: string;
    sample?: string;
    min_power?: number;
    max_power?: number;
    min_deepness?: number;
    max_deepness?: number;
    min_bpm?: number;
    max_bpm?: number;
    has_lyrics?: boolean;
  }): Promise<TracksResponse> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    if (params?.status) q.set("status", params.status);
    if (params?.creator_id) q.set("creator_id", params.creator_id);
    if (params?.q?.trim()) q.set("q", params.q.trim());
    if (params?.sort) q.set("sort", params.sort);
    if (params?.mood) q.set("mood", params.mood);
    if (params?.sample) q.set("sample", params.sample);
    if (params?.min_power != null) q.set("min_power", String(params.min_power));
    if (params?.max_power != null) q.set("max_power", String(params.max_power));
    if (params?.min_deepness != null) q.set("min_deepness", String(params.min_deepness));
    if (params?.max_deepness != null) q.set("max_deepness", String(params.max_deepness));
    if (params?.min_bpm != null) q.set("min_bpm", String(params.min_bpm));
    if (params?.max_bpm != null) q.set("max_bpm", String(params.max_bpm));
    if (params?.has_lyrics) q.set("has_lyrics", "true");
    const qs = q.toString();
    return request<TracksResponse>(`/tracks${qs ? `?${qs}` : ""}`);
  },

  recordPlay(trackId: string, source?: string): Promise<void> {
    return request<void>(`/tracks/${trackId}/play`, {
      method: "POST",
      body: JSON.stringify(source ? { source } : {}),
    });
  },

  getPlayerState(): Promise<{ track_ids: string[]; queue_index: number; progress_ms: number }> {
    return request("/me/player/state", {}, true);
  },

  putPlayerState(body: {
    track_ids: string[];
    queue_index: number;
    progress_ms: number;
  }): Promise<void> {
    return request<void>("/me/player/state", { method: "PUT", body: JSON.stringify(body) }, true);
  },

  forgotPassword(email: string): Promise<void> {
    return request<void>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },

  resetPassword(token: string, password: string): Promise<void> {
    return request<void>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    });
  },

  verifyEmail(token: string): Promise<void> {
    return request<void>("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  },

  searchArtists(params: {
    q: string;
    limit?: number;
    offset?: number;
  }): Promise<ArtistsSearchResponse> {
    const q = new URLSearchParams();
    q.set("q", params.q.trim());
    if (params.limit != null) q.set("limit", String(params.limit));
    if (params.offset != null) q.set("offset", String(params.offset));
    return request<ArtistsSearchResponse>(`/search/artists?${q.toString()}`);
  },

  getWeeklyCharts(limit = 50, offset = 0): Promise<{ items: import("@/types").ChartTrack[]; period: string }> {
    return request(`/charts/weekly?limit=${limit}&offset=${offset}`);
  },

  getMoodTags(): Promise<{ items: string[] }> {
    return request("/charts/moods");
  },

  getTracksByMood(mood: string, limit = 40): Promise<{ items: Track[]; mood: string }> {
    return request(`/tags/${encodeURIComponent(mood)}?limit=${limit}`);
  },

  createListeningParty(): Promise<{ code: string; host_token: string; state: import("@/types").PartyState }> {
    return request("/parties", { method: "POST" });
  },

  getListeningParty(code: string): Promise<{ code: string; state: import("@/types").PartyState }> {
    return request(`/parties/${encodeURIComponent(code)}`);
  },

  updateListeningParty(
    code: string,
    body: { host_token: string } & import("@/types").PartyState,
  ): Promise<{ state: import("@/types").PartyState }> {
    return request(`/parties/${encodeURIComponent(code)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },

  exportPlaylistUrl(playlistId: string, format: "m3u" | "json", authed: boolean): string {
    const path = authed
      ? `/api/v1/me/playlists/${playlistId}/export?format=${format}`
      : `/api/v1/playlists/${playlistId}/export?format=${format}`;
    return apiUrl(path);
  },

  getTrack(id: string): Promise<Track> {
    return request<Track>(`/tracks/${id}`);
  },

  getSimilarTracks(id: string, limit = 10): Promise<TracksResponse> {
    return request<TracksResponse>(`/tracks/${id}/similar?limit=${limit}`);
  },

  getRecommendNext(
    id: string,
    exclude: string[] = [],
    limit = 1,
  ): Promise<TracksResponse> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (exclude.length) params.set("exclude", exclude.join(","));
    return request<TracksResponse>(`/tracks/${id}/next?${params}`);
  },

  getFeed(limit = 20, offset = 0): Promise<TracksResponse> {
    return request<TracksResponse>(`/me/feed?limit=${limit}&offset=${offset}`, {}, true);
  },

  getForYou(): Promise<TracksResponse> {
    return request<TracksResponse>("/me/for-you", {}, true);
  },

  getFilterPresets(): Promise<{ items: import("@/types").FilterPreset[] }> {
    return request("/me/filter-presets", {}, true);
  },

  createFilterPreset(name: string, filters: Record<string, unknown>): Promise<import("@/types").FilterPreset> {
    return request("/me/filter-presets", {
      method: "POST",
      body: JSON.stringify({ name, filters }),
    }, true);
  },

  deleteFilterPreset(id: string): Promise<void> {
    return request<void>(`/me/filter-presets/${id}`, { method: "DELETE" }, true);
  },

  getOfflineDownloads(): Promise<{ track_ids: string[]; limit: number }> {
    return request("/me/offline", {}, true);
  },

  getOfflinePackage(trackId: string): Promise<import("@/types").OfflinePackage> {
    return request(`/me/offline/tracks/${trackId}`, { method: "POST" }, true);
  },

  removeOfflineTrack(trackId: string): Promise<void> {
    return request<void>(`/me/offline/tracks/${trackId}`, { method: "DELETE" }, true);
  },

  getFollowing(): Promise<{ user_ids: string[]; items?: PublicUserSummary[] }> {
    return request<{ user_ids: string[]; items?: PublicUserSummary[] }>(
      "/me/following",
      {},
      true,
    );
  },

  followUser(userId: string): Promise<void> {
    return request<void>(`/me/following/${userId}`, { method: "PUT" }, true);
  },

  unfollowUser(userId: string): Promise<void> {
    return request<void>(`/me/following/${userId}`, { method: "DELETE" }, true);
  },

  getCreatorAnalytics(): Promise<{
    total_plays: number;
    published_tracks: number;
    total_tracks: number;
    follower_count: number;
    items: Array<{ id: string; title: string; status: string; play_count: number }>;
  }> {
    return request("/creator/analytics", {}, true);
  },

  createCreatorDraft(body: {
    title: string;
    description?: string;
    gachi_metadata?: Record<string, unknown>;
  }): Promise<Track> {
    return request<Track>("/creator/drafts", {
      method: "POST",
      body: JSON.stringify(body),
    }, true);
  },

  updateCreatorDraft(
    trackId: string,
    body: {
      title?: string;
      description?: string;
      gachi_metadata?: Record<string, unknown>;
    },
  ): Promise<Track> {
    return request<Track>(`/creator/tracks/${trackId}/draft`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }, true);
  },

  presignCreatorDraft(
    trackId: string,
    body: { filename: string; content_type: string },
  ): Promise<{
    track_id: string;
    upload_url: string;
    object_key: string;
    expires_in_sec: number;
  }> {
    return request(`/creator/tracks/${trackId}/presign`, {
      method: "POST",
      body: JSON.stringify(body),
    }, true);
  },

  getCreatorTrackStats(trackId: string, days = 30): Promise<import("@/types").TrackCreatorStats> {
    return request(`/creator/tracks/${trackId}/stats?days=${days}`, {}, true);
  },

  scheduleTrackPublish(trackId: string, scheduledPublishAt: string): Promise<Track> {
    return request<Track>(`/creator/tracks/${trackId}/schedule`, {
      method: "PATCH",
      body: JSON.stringify({ scheduled_publish_at: scheduledPublishAt }),
    }, true);
  },

  publishTrackNow(trackId: string): Promise<Track> {
    return request<Track>(`/creator/tracks/${trackId}/publish`, { method: "POST" }, true);
  },

  getUser(id: string): Promise<User> {
    return request<User>(`/users/${id}`);
  },

  getLiked(): Promise<LikedResponse> {
    return request<LikedResponse>("/me/liked", {}, true);
  },

  getRecent(): Promise<{ track_ids: string[] }> {
    return request<{ track_ids: string[] }>("/me/recent", {}, true);
  },

  addRecent(trackId: string): Promise<void> {
    return request<void>(
      "/me/recent",
      { method: "POST", body: JSON.stringify({ track_id: trackId }) },
      true,
    );
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

  createPlaylist(body: {
    title: string;
    description?: string;
    is_public?: boolean;
    is_collaborative?: boolean;
  }): Promise<ServerPlaylist> {
    return request<ServerPlaylist>("/me/playlists", {
      method: "POST",
      body: JSON.stringify(body),
    }, true);
  },

  updatePlaylist(
    id: string,
    body: {
      title?: string;
      description?: string;
      is_public?: boolean;
      is_collaborative?: boolean;
    },
  ): Promise<ServerPlaylist> {
    return request<ServerPlaylist>(`/me/playlists/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }, true);
  },

  deletePlaylist(id: string): Promise<void> {
    return request<void>(`/me/playlists/${id}`, { method: "DELETE" }, true);
  },

  addTracksToPlaylist(id: string, trackIds: string[]): Promise<ServerPlaylist> {
    return request<ServerPlaylist>(`/me/playlists/${id}/tracks`, {
      method: "POST",
      body: JSON.stringify({ track_ids: trackIds }),
    }, true);
  },

  setPlaylistTracks(id: string, trackIds: string[]): Promise<ServerPlaylist> {
    return request<ServerPlaylist>(`/me/playlists/${id}/tracks`, {
      method: "PUT",
      body: JSON.stringify({ track_ids: trackIds }),
    }, true);
  },

  removeTrackFromPlaylist(playlistId: string, trackId: string): Promise<ServerPlaylist> {
    return request<ServerPlaylist>(
      `/me/playlists/${playlistId}/tracks/${trackId}`,
      { method: "DELETE" },
      true,
    );
  },

  getPlaylist(id: string): Promise<ServerPlaylist> {
    return request<ServerPlaylist>(`/me/playlists/${id}`, {}, true);
  },

  joinPlaylistByInvite(inviteToken: string): Promise<ServerPlaylist> {
    return request<ServerPlaylist>("/me/playlists/join", {
      method: "POST",
      body: JSON.stringify({ invite_token: inviteToken }),
    }, true);
  },

  enablePlaylistCollaboration(id: string): Promise<ServerPlaylist> {
    return request<ServerPlaylist>(`/me/playlists/${id}/collaborate`, { method: "POST" }, true);
  },

  leavePlaylistCollaboration(id: string): Promise<void> {
    return request<void>(`/me/playlists/${id}/collaborators/me`, { method: "DELETE" }, true);
  },

  getPublicPlaylists(limit = 20, offset = 0): Promise<PlaylistsResponse> {
    return request<PlaylistsResponse>(
      `/playlists?limit=${limit}&offset=${offset}`,
    );
  },

  getPublicPlaylist(id: string): Promise<ServerPlaylist> {
    return request<ServerPlaylist>(`/playlists/${id}`);
  },

  getTrackLyrics(id: string): Promise<import("@/types").LyricsDocument> {
    return request<import("@/types").LyricsDocument>(`/tracks/${id}/lyrics`);
  },

  getPlaylistImportCapabilities(): Promise<{
    spotify_url: boolean;
    youtube_url: boolean;
    paste_lines: boolean;
  }> {
    return request("/me/playlists/import/capabilities", {}, true);
  },

  previewPlaylistImport(body: {
    url?: string;
    lines?: string;
    title_hint?: string;
  }): Promise<{
    source: string;
    playlist_title: string;
    items: Array<{
      position: number;
      source_title: string;
      source_artist: string;
      matched_track?: { id: string; title: string; artist: string; duration_ms: number };
    }>;
    matched_count: number;
    total_count: number;
    warnings?: string[];
  }> {
    return request("/me/playlists/import/preview", {
      method: "POST",
      body: JSON.stringify(body),
    }, true);
  },

  confirmPlaylistImport(body: {
    title: string;
    description?: string;
    track_ids: string[];
    is_public?: boolean;
  }): Promise<import("@/types").ServerPlaylist> {
    return request<import("@/types").ServerPlaylist>("/me/playlists/import/confirm", {
      method: "POST",
      body: JSON.stringify(body),
    }, true);
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
    description?: string;
    filename: string;
    content_type: string;
    duration_ms?: number;
    track_id?: string;
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

  updateCreatorTrackLyrics(trackId: string, lyricsLrc: string): Promise<Track> {
    return request<Track>(
      `/creator/tracks/${trackId}/lyrics`,
      { method: "PATCH", body: JSON.stringify({ lyrics_lrc: lyricsLrc }) },
      true,
    );
  },

  initCoverUpload(
    trackId: string,
    body: { filename: string; content_type: string },
  ): Promise<{
    track_id: string;
    upload_url: string;
    object_key: string;
    expires_in_sec: number;
  }> {
    return request(`/creator/tracks/${trackId}/cover/init`, {
      method: "POST",
      body: JSON.stringify(body),
    }, true);
  },

  completeCoverUpload(trackId: string): Promise<Track> {
    return request<Track>(`/creator/tracks/${trackId}/cover/complete`, {
      method: "POST",
    }, true);
  },

  getPlayback(trackId: string): Promise<{
    format: "hls" | "mp3";
    playlist_url?: string;
    direct_url?: string;
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
