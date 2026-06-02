package imports

import (
	"strings"
)

// ParseLines turns pasted text into external tracks (Artist - Title, tab-separated, or title-only).
func ParseLines(raw string) []ExternalTrack {
	lines := strings.Split(raw, "\n")
	out := make([]ExternalTrack, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.Contains(line, "\t") {
			parts := strings.SplitN(line, "\t", 2)
			title := strings.TrimSpace(parts[0])
			artist := ""
			if len(parts) > 1 {
				artist = strings.TrimSpace(parts[1])
			}
			if title != "" {
				out = append(out, ExternalTrack{Title: title, Artist: artist})
			}
			continue
		}
		if idx := strings.Index(line, " - "); idx > 0 {
			artist := strings.TrimSpace(line[:idx])
			title := strings.TrimSpace(line[idx+3:])
			if title != "" {
				out = append(out, ExternalTrack{Title: title, Artist: artist})
			}
			continue
		}
		out = append(out, ExternalTrack{Title: line})
	}
	return out
}
