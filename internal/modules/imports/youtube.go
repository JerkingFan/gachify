package imports

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"time"
)

type youtubeClient struct {
	apiKey string
	http   *http.Client
}

func newYouTubeClient(apiKey string) *youtubeClient {
	return &youtubeClient{
		apiKey: apiKey,
		http:   &http.Client{Timeout: 20 * time.Second},
	}
}

func (c *youtubeClient) enabled() bool {
	return c.apiKey != ""
}

func (c *youtubeClient) fetchPlaylist(ctx context.Context, playlistID string) (string, []ExternalTrack, error) {
	var (
		title  = "Imported YouTube playlist"
		tracks []ExternalTrack
		page   string
	)
	for i := 0; i < 25; i++ {
		q := url.Values{}
		q.Set("part", "snippet")
		q.Set("playlistId", playlistID)
		q.Set("maxResults", "50")
		q.Set("key", c.apiKey)
		if page != "" {
			q.Set("pageToken", page)
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://www.googleapis.com/youtube/v3/playlistItems?"+q.Encode(), nil)
		if err != nil {
			return "", nil, err
		}
		res, err := c.http.Do(req)
		if err != nil {
			return "", nil, err
		}
		var body struct {
			NextPageToken string `json:"nextPageToken"`
			Items         []struct {
				Snippet struct {
					Title string `json:"title"`
				} `json:"snippet"`
			} `json:"items"`
		}
		decErr := json.NewDecoder(res.Body).Decode(&body)
		res.Body.Close()
		if decErr != nil {
			return "", nil, decErr
		}
		if res.StatusCode != http.StatusOK {
			return "", nil, fmt.Errorf("youtube playlist: %s", res.Status)
		}
		for _, it := range body.Items {
			t := it.Snippet.Title
			if t == "" || t == "Private video" || t == "Deleted video" {
				continue
			}
			tracks = append(tracks, ExternalTrack{Title: t})
		}
		if body.NextPageToken == "" {
			break
		}
		page = body.NextPageToken
	}
	// Best-effort playlist title
	tq := url.Values{}
	tq.Set("part", "snippet")
	tq.Set("id", playlistID)
	tq.Set("key", c.apiKey)
	treq, _ := http.NewRequestWithContext(ctx, http.MethodGet, "https://www.googleapis.com/youtube/v3/playlists?"+tq.Encode(), nil)
	if tres, err := c.http.Do(treq); err == nil {
		var pl struct {
			Items []struct {
				Snippet struct {
					Title string `json:"title"`
				} `json:"snippet"`
			} `json:"items"`
		}
		_ = json.NewDecoder(tres.Body).Decode(&pl)
		tres.Body.Close()
		if len(pl.Items) > 0 && pl.Items[0].Snippet.Title != "" {
			title = pl.Items[0].Snippet.Title
		}
	}
	return title, tracks, nil
}
