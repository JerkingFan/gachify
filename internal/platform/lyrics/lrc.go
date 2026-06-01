package lyrics

import (
	"regexp"
	"strconv"
	"strings"
)

// Line is one karaoke cue.
type Line struct {
	StartMs int    `json:"start_ms"`
	Text    string `json:"text"`
}

// Document stored in tracks.gachi_metadata.lyrics.
type Document struct {
	Lines  []Line `json:"lines"`
	Format string `json:"format"`
	Source string `json:"source"`
}

var lrcTime = regexp.MustCompile(`\[(\d{1,2}):(\d{2})(?:[.:](\d{2,3}))?\]`)

// ParseLRC parses standard LRC timestamp lines into timed cues.
func ParseLRC(raw string) Document {
	lines := make([]Line, 0)
	for _, row := range strings.Split(raw, "\n") {
		row = strings.TrimSpace(row)
		if row == "" {
			continue
		}
		matches := lrcTime.FindAllStringSubmatchIndex(row, -1)
		if len(matches) == 0 {
			continue
		}
		text := strings.TrimSpace(lrcTime.ReplaceAllString(row, ""))
		if text == "" {
			continue
		}
		for _, m := range matches {
			if len(m) < 8 {
				continue
			}
			min, _ := strconv.Atoi(row[m[2]:m[3]])
			sec, _ := strconv.Atoi(row[m[4]:m[5]])
			ms := 0
			if m[6] >= 0 && m[7] > m[6] {
				frac, _ := strconv.Atoi(row[m[6]:m[7]])
				if m[7]-m[6] == 3 {
					ms = frac * 10
				} else {
					ms = frac * 10
				}
			}
			start := (min*60+sec)*1000 + ms
			lines = append(lines, Line{StartMs: start, Text: text})
		}
	}
	return Document{Lines: lines, Format: "lrc", Source: "lrc"}
}

// ActiveLine returns the index of the line for current playback position.
func ActiveLine(doc Document, positionMs int) int {
	if len(doc.Lines) == 0 {
		return -1
	}
	active := -1
	for i, ln := range doc.Lines {
		if ln.StartMs <= positionMs {
			active = i
		} else {
			break
		}
	}
	return active
}
