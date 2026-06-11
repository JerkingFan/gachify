package admin

import (
	"encoding/json"
	"strings"
)

type updateTrackBody struct {
	Title             string   `json:"title"`
	ArtistName        *string  `json:"artist_name"`
	GachiPowerLevel   *int     `json:"gachi_power_level"`
	DeepnessScore     *float32 `json:"deepness_score"`
	DominantSample    *string  `json:"dominant_male_sample"`
	GruntCount        *int     `json:"grunt_count"`
	BPM               *float32 `json:"bpm"`
	MoodTags          []string `json:"mood_tags"`
	WessratostLevel   *int     `json:"wessratost_level"`
	IsContinuousMix   *bool    `json:"is_continuous_mix"`
	Energy            *float32 `json:"energy"`
	Valence           *float32 `json:"valence"`
	Danceability      *float32 `json:"danceability"`
	WackinessScore    *float32 `json:"wackiness_score"`
}

func mergeGachiMetadata(existing json.RawMessage, patch updateTrackBody) (json.RawMessage, error) {
	var m map[string]any
	if len(existing) > 0 {
		if err := json.Unmarshal(existing, &m); err != nil {
			return nil, err
		}
	}
	if m == nil {
		m = map[string]any{}
	}
	if patch.GachiPowerLevel != nil {
		m["gachi_power_level"] = *patch.GachiPowerLevel
	}
	if patch.DeepnessScore != nil {
		m["deepness_score"] = *patch.DeepnessScore
	}
	if patch.DominantSample != nil {
		m["dominant_male_sample"] = *patch.DominantSample
	}
	if patch.GruntCount != nil {
		m["grunt_count"] = *patch.GruntCount
	}
	if patch.BPM != nil {
		m["bpm"] = *patch.BPM
	}
	if patch.MoodTags != nil {
		m["mood_tags"] = patch.MoodTags
	}
	if patch.WessratostLevel != nil {
		m["wessratost_level"] = *patch.WessratostLevel
	}
	if patch.IsContinuousMix != nil {
		m["is_continuous_mix"] = *patch.IsContinuousMix
	}
	if patch.Energy != nil {
		m["energy"] = *patch.Energy
	}
	if patch.Valence != nil {
		m["valence"] = *patch.Valence
	}
	if patch.Danceability != nil {
		m["danceability"] = *patch.Danceability
	}
	if patch.WackinessScore != nil {
		m["wackiness_score"] = *patch.WackinessScore
	}
	if patch.ArtistName != nil {
		name := strings.TrimSpace(*patch.ArtistName)
		if name != "" {
			m["artist_name"] = name
		} else {
			delete(m, "artist_name")
		}
	}
	return json.Marshal(m)
}
