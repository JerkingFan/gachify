export type TrackStatus =
  | "draft"
  | "processing"
  | "pending_review"
  | "published"
  | "shadow_banned"
  | "removed";

export interface GachiMetadata {
  gachi_power_level?: number;
  deepness_score?: number;
  dominant_male_sample?: string;
  grunt_count?: number;
  bpm?: number;
  mood_tags?: string[];
  wessratost_level?: number;
  is_continuous_mix?: boolean;
  energy?: number;
  valence?: number;
  danceability?: number;
  wackiness_score?: number;
  gapless_group_id?: string;
  preview_url?: string;
  cover_gradient?: string;
  hls?: { manifest_key?: string };
}

export interface CreatorSummary {
  id: string;
  handle: string;
  display_name: string;
}

export interface Track {
  id: string;
  creator_id: string;
  title: string;
  duration_ms: number;
  status: TrackStatus;
  gachi_metadata: GachiMetadata | Record<string, unknown>;
  creator?: CreatorSummary;
  master_object_key?: string;
  source_content_type?: string;
  source_filename?: string;
  processing_error?: string;
  play_count?: number;
  created_at: string;
  updated_at: string;
}

export interface TracksResponse {
  items: Track[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface User {
  id: string;
  email?: string;
  handle: string;
  display_name: string;
  tier: string;
  trash_tolerance: number;
  gachi_persona?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: User;
}

export interface PlaylistItem {
  track_id: string;
  position: number;
  added_at: string;
}

export interface ServerPlaylist {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  is_public: boolean;
  items: PlaylistItem[] | string;
  created_at: string;
  updated_at: string;
}

export interface PlaylistsResponse {
  items: ServerPlaylist[];
}

export interface LikedResponse {
  track_ids: string[];
}

export interface ArtistSearchResult {
  id: string;
  handle: string;
  display_name: string;
  published_tracks: number;
}

export interface ArtistsSearchResponse {
  items: ArtistSearchResult[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}
