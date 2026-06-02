export type TrackStatus =
  | "draft"
  | "processing"
  | "pending_review"
  | "approved"
  | "published"
  | "shadow_banned"
  | "removed";

export interface LyricsLine {
  start_ms: number;
  text: string;
}

export interface LyricsDocument {
  lines: LyricsLine[];
  format?: string;
  source?: string;
}

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
  cover_url?: string;
  hls?: { manifest_key?: string };
  lyrics?: LyricsDocument;
  lyrics_lrc?: string;
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
  description?: string;
  duration_ms: number;
  status: TrackStatus;
  gachi_metadata: GachiMetadata | Record<string, unknown>;
  creator?: CreatorSummary;
  master_object_key?: string;
  source_content_type?: string;
  source_filename?: string;
  processing_error?: string;
  play_count?: number;
  scheduled_publish_at?: string;
  approved_at?: string;
  created_at: string;
  updated_at: string;
}

export interface TrackCreatorStats {
  track_id: string;
  play_count: number;
  daily: Array<{ date: string; play_count: number }>;
  sources?: Array<{ source: string; play_count: number }>;
}

export type LikedSortKey = "recent" | "title" | "duration";

export interface ChartTrack extends Track {
  creator?: { id: string; handle: string; display_name: string };
  weekly_plays: number;
}

export interface PartyState {
  track_ids: string[];
  queue_index: number;
  progress_ms: number;
  is_playing: boolean;
  updated_at: number;
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
  avatar_url?: string;
  liked_tracks_public?: boolean;
  profile_bio?: string;
  push_notifications?: "off" | "following";
  created_at?: string;
  updated_at?: string;
}

export interface AccountUser extends User {
  email_verified: boolean;
  has_password: boolean;
}

export interface PublicProfile {
  id: string;
  handle: string;
  display_name: string;
  avatar_url?: string;
  profile_bio?: string;
  published_tracks: number;
  public_playlists_count: number;
  following_count: number;
  follower_count?: number;
  liked_tracks_public: boolean;
}

export interface PublicUserSummary {
  id: string;
  handle: string;
  display_name: string;
  avatar_url?: string;
}

export interface Notification {
  id: string;
  type: string;
  actor_id?: string;
  track_id?: string;
  body: string;
  read_at?: string;
  created_at: string;
  actor?: PublicUserSummary;
  track_title?: string;
}

export interface TrackComment {
  id: string;
  track_id: string;
  user_id: string;
  parent_id?: string;
  body: string;
  created_at: string;
  author: PublicUserSummary;
}

export interface TrackReactionsSummary {
  counts: Record<string, number>;
  user_reaction?: string;
  total: number;
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
  is_collaborative?: boolean;
  invite_token?: string;
  is_owner?: boolean;
  can_edit?: boolean;
  items: PlaylistItem[] | string;
  created_at: string;
  updated_at: string;
  owner_handle?: string;
  owner_display_name?: string;
}

export type PlaylistSortKey = "updated" | "created" | "title";

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

export interface FilterPreset {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  created_at: string;
}

export interface OfflinePackage {
  track_id: string;
  format: "mp3" | "hls_offline";
  audio_url?: string;
  aes_key?: string;
  aes_iv?: string;
  segments?: { name: string; url: string }[];
  expires_at: string;
  duration_ms: number;
}
