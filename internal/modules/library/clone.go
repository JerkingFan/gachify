package library

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/gachify/gachify/internal/domain"
	"github.com/google/uuid"
)

func (r *Repository) ClonePlaylist(ctx context.Context, userID, sourceID uuid.UUID) (domain.Playlist, error) {
	src, err := r.GetPublicPlaylist(ctx, sourceID)
	if err != nil {
		if p, err2 := r.GetPlaylist(ctx, userID, sourceID); err2 == nil {
			src = domain.PublicPlaylist{Playlist: p}
		} else {
			return domain.Playlist{}, ErrPlaylistNotFound
		}
	}

	title := src.Title
	if src.OwnerID != userID {
		if src.OwnerHandle != "" {
			title = fmt.Sprintf("%s · by @%s", src.Title, src.OwnerHandle)
		}
	} else {
		title = src.Title + " (copy)"
	}

	desc := src.Description
	if src.OwnerID != userID && src.OwnerDisplayName != "" {
		if desc != "" {
			desc += "\n"
		}
		desc += fmt.Sprintf("Cloned from %s's public playlist.", src.OwnerDisplayName)
	}

	created, err := r.CreatePlaylist(ctx, userID, domain.CreatePlaylistInput{
		Title:       title,
		Description: desc,
		IsPublic:    false,
	})
	if err != nil {
		return domain.Playlist{}, err
	}

	var items []domain.PlaylistItem
	if len(src.Items) > 0 && string(src.Items) != "[]" {
		if err := json.Unmarshal(src.Items, &items); err != nil {
			return domain.Playlist{}, fmt.Errorf("parse source items: %w", err)
		}
	}
	if len(items) == 0 {
		return created, nil
	}
	ids := make([]uuid.UUID, 0, len(items))
	for _, it := range items {
		ids = append(ids, it.TrackID)
	}
	return r.SetPlaylistItems(ctx, userID, created.ID, ids)
}
