package library

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var ErrPresetNotFound = errors.New("filter preset not found")
var ErrPresetNameTaken = errors.New("preset name already exists")

type FilterPreset struct {
	ID        uuid.UUID       `json:"id"`
	Name      string          `json:"name"`
	Filters   json.RawMessage `json:"filters"`
	CreatedAt time.Time       `json:"created_at"`
}

func (r *Repository) ListFilterPresets(ctx context.Context, userID uuid.UUID) ([]FilterPreset, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, name, filters, created_at
		FROM filter_presets WHERE user_id = $1 ORDER BY created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []FilterPreset
	for rows.Next() {
		var p FilterPreset
		if err := rows.Scan(&p.ID, &p.Name, &p.Filters, &p.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	if out == nil {
		out = []FilterPreset{}
	}
	return out, rows.Err()
}

func (r *Repository) CreateFilterPreset(ctx context.Context, userID uuid.UUID, name string, filters json.RawMessage) (FilterPreset, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return FilterPreset{}, fmt.Errorf("name required")
	}
	if len(filters) == 0 {
		filters = json.RawMessage(`{}`)
	}
	var p FilterPreset
	err := r.pool.QueryRow(ctx, `
		INSERT INTO filter_presets (user_id, name, filters)
		VALUES ($1, $2, $3)
		RETURNING id, name, filters, created_at
	`, userID, name, filters).Scan(&p.ID, &p.Name, &p.Filters, &p.CreatedAt)
	if err != nil && strings.Contains(err.Error(), "unique") {
		return FilterPreset{}, ErrPresetNameTaken
	}
	return p, err
}

func (r *Repository) DeleteFilterPreset(ctx context.Context, userID, presetID uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM filter_presets WHERE id = $1 AND user_id = $2
	`, presetID, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrPresetNotFound
	}
	return nil
}

func (r *Repository) GetFilterPreset(ctx context.Context, userID, presetID uuid.UUID) (FilterPreset, error) {
	var p FilterPreset
	err := r.pool.QueryRow(ctx, `
		SELECT id, name, filters, created_at
		FROM filter_presets WHERE id = $1 AND user_id = $2
	`, presetID, userID).Scan(&p.ID, &p.Name, &p.Filters, &p.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return FilterPreset{}, ErrPresetNotFound
	}
	return p, err
}
