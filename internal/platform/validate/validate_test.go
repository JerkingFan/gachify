package validate

import (
	"strings"
	"testing"

	"github.com/gachify/gachify/internal/domain"
)

func TestEmail(t *testing.T) {
	if err := Email("user@example.com"); err != nil {
		t.Fatalf("valid email rejected: %v", err)
	}
	if err := Email("not-an-email"); err == nil {
		t.Fatal("expected invalid email error")
	}
	if err := Email(""); err == nil {
		t.Fatal("expected required email error")
	}
}

func TestHandle(t *testing.T) {
	if err := Handle("dungeon_master"); err != nil {
		t.Fatalf("valid handle rejected: %v", err)
	}
	if err := Handle("ab"); err == nil {
		t.Fatal("expected too short handle error")
	}
	if err := Handle("Bad-Handle"); err == nil {
		t.Fatal("expected invalid chars error")
	}
}

func TestPassword(t *testing.T) {
	if err := Password("short"); err == nil {
		t.Fatal("expected short password error")
	}
	if err := Password("long-enough-secret"); err != nil {
		t.Fatalf("valid password rejected: %v", err)
	}
}

func TestSearchQuery(t *testing.T) {
	if err := SearchQuery(""); err != nil {
		t.Fatalf("empty query should be allowed: %v", err)
	}
	long := strings.Repeat("a", MaxSearchQueryLen+1)
	if err := SearchQuery(long); err == nil {
		t.Fatal("expected query length error")
	}
}

func TestUploadInit(t *testing.T) {
	err := UploadInit(domain.UploadInitInput{
		Title:    "Deep Dark Fantasy",
		Filename: "mix.mp3",
	})
	if err != nil {
		t.Fatalf("valid upload init rejected: %v", err)
	}
	err = UploadInit(domain.UploadInitInput{Title: "", Filename: "x.mp3"})
	if err == nil {
		t.Fatal("expected title required")
	}
}
