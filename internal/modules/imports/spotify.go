package imports

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type spotifyClient struct {
	clientID     string
	clientSecret string
	http         *http.Client
	mu           sync.Mutex
	token        string
	tokenExpiry  time.Time
}

func newSpotifyClient(id, secret string) *spotifyClient {
	return &spotifyClient{
		clientID:     id,
		clientSecret: secret,
		http:         &http.Client{Timeout: 20 * time.Second},
	}
}

func (c *spotifyClient) enabled() bool {
	return c.clientID != "" && c.clientSecret != ""
}

func (c *spotifyClient) accessToken(ctx context.Context) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.token != "" && time.Now().Before(c.tokenExpiry.Add(-30*time.Second)) {
		return c.token, nil
	}
	form := url.Values{}
	form.Set("grant_type", "client_credentials")
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://accounts.spotify.com/api/token", strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.SetBasicAuth(c.clientID, c.clientSecret)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, err := c.http.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("spotify token: %s", res.Status)
	}
	var body struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		return "", err
	}
	if body.AccessToken == "" {
		return "", errors.New("spotify token empty")
	}
	c.token = body.AccessToken
	c.tokenExpiry = time.Now().Add(time.Duration(body.ExpiresIn) * time.Second)
	return c.token, nil
}

func (c *spotifyClient) fetchPlaylist(ctx context.Context, playlistID string) (string, []ExternalTrack, error) {
	token, err := c.accessToken(ctx)
	if err != nil {
		return "", nil, err
	}
	var (
		title  string
		tracks []ExternalTrack
		offset = 0
	)
	for {
		u := fmt.Sprintf(
			"https://api.spotify.com/v1/playlists/%s/tracks?limit=100&offset=%d&fields=name,items(track(name,artists(name)))",
			playlistID, offset,
		)
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
		if err != nil {
			return "", nil, err
		}
		req.Header.Set("Authorization", "Bearer "+token)
		res, err := c.http.Do(req)
		if err != nil {
			return "", nil, err
		}
		var body struct {
			Name  string `json:"name"`
			Items []struct {
				Track *struct {
					Name   string `json:"name"`
					Artists []struct {
						Name string `json:"name"`
					} `json:"artists"`
				} `json:"track"`
			} `json:"items"`
		}
		decErr := json.NewDecoder(res.Body).Decode(&body)
		res.Body.Close()
		if decErr != nil {
			return "", nil, decErr
		}
		if res.StatusCode != http.StatusOK {
			return "", nil, fmt.Errorf("spotify playlist: %s", res.Status)
		}
		if title == "" {
			title = body.Name
		}
		if len(body.Items) == 0 {
			break
		}
		for _, it := range body.Items {
			if it.Track == nil || it.Track.Name == "" {
				continue
			}
			artist := ""
			if len(it.Track.Artists) > 0 {
				artist = it.Track.Artists[0].Name
			}
			tracks = append(tracks, ExternalTrack{Title: it.Track.Name, Artist: artist})
		}
		if len(body.Items) < 100 {
			break
		}
		offset += 100
		if offset > 2000 {
			break
		}
	}
	if title == "" {
		title = "Imported Spotify playlist"
	}
	return title, tracks, nil
}
