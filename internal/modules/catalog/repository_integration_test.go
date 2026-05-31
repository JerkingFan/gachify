package catalog_test

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/gachify/gachify/internal/domain"
	"github.com/gachify/gachify/internal/modules/catalog"
	"github.com/gachify/gachify/internal/modules/users"
	"github.com/gachify/gachify/internal/testutil"
)

func TestRepository_List_SearchIntegration(t *testing.T) {
	if os.Getenv("INTEGRATION") == "" {
		t.Skip("set INTEGRATION=1 to run postgres integration tests")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	pool, cleanup := testutil.StartPostgres(t, ctx)
	defer cleanup()

	userRepo := users.NewRepository(pool)
	creator, err := userRepo.Create(ctx, domain.CreateUserInput{
		Handle:      "search_test",
		DisplayName: "Search Test",
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}

	repo := catalog.NewRepository(pool)
	_, err = repo.Create(ctx, domain.CreateTrackInput{
		CreatorID:  creator.ID,
		Title:      "Deep Dark Fantasy Mix",
		DurationMs: 120000,
		Status:     domain.TrackPublished,
	})
	if err != nil {
		t.Fatalf("create track: %v", err)
	}
	_, err = repo.Create(ctx, domain.CreateTrackInput{
		CreatorID:  creator.ID,
		Title:      "Unrelated Song",
		DurationMs: 90000,
		Status:     domain.TrackPublished,
	})
	if err != nil {
		t.Fatalf("create track 2: %v", err)
	}

	published := domain.TrackPublished
	items, err := repo.List(ctx, domain.ListTracksFilter{
		Query:  "deep dark",
		Status: &published,
		Limit:  10,
	})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 search hit, got %d", len(items))
	}
	if items[0].Title != "Deep Dark Fantasy Mix" {
		t.Fatalf("unexpected title: %s", items[0].Title)
	}
}
