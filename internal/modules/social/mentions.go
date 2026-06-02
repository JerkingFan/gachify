package social

import (
	"regexp"
	"strings"
)

var mentionPattern = regexp.MustCompile(`(?i)@([a-z0-9_]{2,32})\b`)

func ParseMentionHandles(body string) []string {
	seen := map[string]bool{}
	var out []string
	for _, m := range mentionPattern.FindAllStringSubmatch(body, -1) {
		if len(m) < 2 {
			continue
		}
		h := strings.ToLower(m[1])
		if seen[h] {
			continue
		}
		seen[h] = true
		out = append(out, h)
		if len(out) >= 5 {
			break
		}
	}
	return out
}
