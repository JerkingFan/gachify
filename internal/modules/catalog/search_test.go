package catalog

import (
	"strings"
	"testing"

	"github.com/gachify/gachify/internal/domain"
)

func TestEscapeILIKE(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{"plain", "plain"},
		{"100%", "100\\%"},
		{"a_b", "a\\_b"},
		{`back\slash`, `back\\slash`},
	}
	for _, tc := range tests {
		if got := escapeILIKE(tc.in); got != tc.want {
			t.Fatalf("escapeILIKE(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestBuildListWhereSearch(t *testing.T) {
	where, args := buildListWhere(domain.ListTracksFilter{Query: "dungeon"}, "t.")
	for _, part := range []string{"ILIKE", ".title", "u.display_name", "u.handle", "gachi_metadata"} {
		if !strings.Contains(where, part) {
			t.Fatalf("where missing %q: %s", part, where)
		}
	}
	if len(args) != 4 {
		t.Fatalf("expected 4 args, got %d", len(args))
	}
	pattern, ok := args[0].(string)
	if !ok || pattern != "%dungeon%" {
		t.Fatalf("unexpected search pattern: %v", args[0])
	}
}
