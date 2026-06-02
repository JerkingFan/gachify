package imports

import (
	"errors"
	"net/url"
	"regexp"
	"strings"
)

var spotifyPlaylistRe = regexp.MustCompile(`(?:spotify\.com/playlist/|spotify:playlist:)([a-zA-Z0-9]+)`)

type ParsedURL struct {
	Platform string // spotify | youtube
	ID       string
}

func ParsePlaylistURL(raw string) (ParsedURL, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ParsedURL{}, errors.New("url is required")
	}
	if m := spotifyPlaylistRe.FindStringSubmatch(raw); len(m) == 2 {
		return ParsedURL{Platform: "spotify", ID: m[1]}, nil
	}
	u, err := url.Parse(raw)
	if err != nil {
		return ParsedURL{}, errors.New("invalid playlist url")
	}
	host := strings.ToLower(u.Host)
	if strings.Contains(host, "youtube.com") || strings.Contains(host, "youtu.be") {
		id := u.Query().Get("list")
		if id == "" {
			return ParsedURL{}, errors.New("youtube playlist url must include list= parameter")
		}
		return ParsedURL{Platform: "youtube", ID: id}, nil
	}
	return ParsedURL{}, errors.New("unsupported url — use Spotify or YouTube playlist link")
}
