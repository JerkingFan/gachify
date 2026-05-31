package catalog

import (
	"strings"
	"testing"

	"github.com/gachify/gachify/internal/domain"
)

func TestSearchWhereUsesTrgm(t *testing.T) {
	where, args := buildListWhere(domain.ListTracksFilter{Query: "dungeon"}, "t.")
	if !strings.Contains(where, "% $") {
		t.Fatalf("expected pg_trgm %% operator in where: %s", where)
	}
	if len(args) != 1 || args[0] != "dungeon" {
		t.Fatalf("expected single query arg, got %v", args)
	}
}

func TestSearchRankSQL(t *testing.T) {
	rank := searchRankSQL(1)
	if !strings.Contains(rank, "similarity(t.title") {
		t.Fatalf("missing title similarity: %s", rank)
	}
	if !strings.Contains(rank, "word_similarity") {
		t.Fatalf("missing word_similarity: %s", rank)
	}
}
