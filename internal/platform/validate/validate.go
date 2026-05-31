package validate

import (
	"encoding/json"
	"fmt"
	"net/mail"
	"strings"
	"unicode/utf8"

	"github.com/gachify/gachify/internal/domain"
)

const (
	MaxSearchQueryLen = 200
	MaxTitleLen       = 200
	MaxFilenameLen    = 255
	MinPasswordLen    = 8
	MaxPasswordLen    = 128
	MinHandleLen      = 3
	MaxHandleLen      = 32
	MaxEmailLen       = 254
	MaxDurationMs     = 24 * 60 * 60 * 1000 // 24h
)

func Email(raw string) error {
	s := strings.TrimSpace(strings.ToLower(raw))
	if s == "" {
		return fmt.Errorf("email is required")
	}
	if utf8.RuneCountInString(s) > MaxEmailLen {
		return fmt.Errorf("email is too long")
	}
	if _, err := mail.ParseAddress(s); err != nil {
		return fmt.Errorf("invalid email format")
	}
	return nil
}

func Handle(raw string) error {
	s := strings.TrimSpace(strings.ToLower(raw))
	if utf8.RuneCountInString(s) < MinHandleLen {
		return fmt.Errorf("handle must be at least %d characters", MinHandleLen)
	}
	if utf8.RuneCountInString(s) > MaxHandleLen {
		return fmt.Errorf("handle must be at most %d characters", MaxHandleLen)
	}
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_' {
			continue
		}
		return fmt.Errorf("handle may only contain lowercase letters, digits, and underscores")
	}
	return nil
}

func Password(raw string) error {
	if len(raw) < MinPasswordLen {
		return fmt.Errorf("password must be at least %d characters", MinPasswordLen)
	}
	if len(raw) > MaxPasswordLen {
		return fmt.Errorf("password must be at most %d characters", MaxPasswordLen)
	}
	return nil
}

func SearchQuery(raw string) error {
	s := strings.TrimSpace(raw)
	if s == "" {
		return nil
	}
	if utf8.RuneCountInString(s) > MaxSearchQueryLen {
		return fmt.Errorf("search query must be at most %d characters", MaxSearchQueryLen)
	}
	return nil
}

func UploadInit(in domain.UploadInitInput) error {
	title := strings.TrimSpace(in.Title)
	if title == "" {
		return fmt.Errorf("title is required")
	}
	if utf8.RuneCountInString(title) > MaxTitleLen {
		return fmt.Errorf("title must be at most %d characters", MaxTitleLen)
	}
	filename := strings.TrimSpace(in.Filename)
	if filename == "" {
		return fmt.Errorf("filename is required")
	}
	if utf8.RuneCountInString(filename) > MaxFilenameLen {
		return fmt.Errorf("filename must be at most %d characters", MaxFilenameLen)
	}
	if in.DurationMs < 0 || in.DurationMs > MaxDurationMs {
		return fmt.Errorf("duration_ms out of range")
	}
	if len(in.GachiMetadata) > 0 && !json.Valid(in.GachiMetadata) {
		return fmt.Errorf("gachi_metadata must be valid JSON")
	}
	return nil
}
