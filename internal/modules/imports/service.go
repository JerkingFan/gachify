package imports

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

type Config struct {
	SpotifyClientID     string
	SpotifyClientSecret string
	YouTubeAPIKey       string
}

type Capabilities struct {
	SpotifyURL bool `json:"spotify_url"`
	YouTubeURL bool `json:"youtube_url"`
	PasteLines bool `json:"paste_lines"`
}

type Service struct {
	cfg     Config
	spotify *spotifyClient
	youtube *youtubeClient
	matcher *Matcher
}

func NewService(cfg Config, matcher *Matcher) *Service {
	return &Service{
		cfg:     cfg,
		spotify: newSpotifyClient(cfg.SpotifyClientID, cfg.SpotifyClientSecret),
		youtube: newYouTubeClient(cfg.YouTubeAPIKey),
		matcher: matcher,
	}
}

func (s *Service) Capabilities() Capabilities {
	return Capabilities{
		SpotifyURL: s.spotify.enabled(),
		YouTubeURL: s.youtube.enabled(),
		PasteLines: true,
	}
}

func (s *Service) PreviewURL(ctx context.Context, rawURL string) (PreviewResult, error) {
	parsed, err := ParsePlaylistURL(rawURL)
	if err != nil {
		return PreviewResult{}, err
	}
	var (
		title  string
		tracks []ExternalTrack
	)
	switch parsed.Platform {
	case "spotify":
		if !s.spotify.enabled() {
			return PreviewResult{}, errors.New("spotify import is not configured on this server — paste your track list instead")
		}
		title, tracks, err = s.spotify.fetchPlaylist(ctx, parsed.ID)
	case "youtube":
		if !s.youtube.enabled() {
			return PreviewResult{}, errors.New("youtube import is not configured on this server — paste your track list instead")
		}
		title, tracks, err = s.youtube.fetchPlaylist(ctx, parsed.ID)
	default:
		return PreviewResult{}, fmt.Errorf("unsupported platform %q", parsed.Platform)
	}
	if err != nil {
		return PreviewResult{}, err
	}
	return s.buildPreview(ctx, parsed.Platform, title, tracks, nil)
}

func (s *Service) PreviewLines(ctx context.Context, lines string, titleHint string) (PreviewResult, error) {
	tracks := ParseLines(lines)
	if len(tracks) == 0 {
		return PreviewResult{}, errors.New("no tracks found in pasted text")
	}
	title := strings.TrimSpace(titleHint)
	if title == "" {
		title = "Imported playlist"
	}
	return s.buildPreview(ctx, "paste", title, tracks, nil)
}

func (s *Service) buildPreview(ctx context.Context, source, title string, tracks []ExternalTrack, warnings []string) (PreviewResult, error) {
	if len(tracks) == 0 {
		return PreviewResult{}, errors.New("playlist has no tracks")
	}
	if len(tracks) > 500 {
		tracks = tracks[:500]
		warnings = append(warnings, "Only the first 500 tracks were processed")
	}
	items := s.matcher.MatchAll(ctx, tracks)
	matched := 0
	for _, it := range items {
		if it.Matched != nil {
			matched++
		}
	}
	return PreviewResult{
		Source:        source,
		PlaylistTitle: title,
		Items:         items,
		MatchedCount:  matched,
		TotalCount:    len(items),
		Warnings:      warnings,
	}, nil
}
