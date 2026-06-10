package admin_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/gachify/gachify/internal/domain"
	"github.com/gachify/gachify/internal/modules/admin"
	"github.com/gachify/gachify/internal/modules/catalog"
	"github.com/gachify/gachify/internal/modules/social"
	"github.com/gachify/gachify/internal/modules/users"
	"github.com/gachify/gachify/internal/platform/queue"
	"github.com/gachify/gachify/internal/testutil"
	"github.com/go-chi/chi/v5"
)

func TestHandler_ApproveRejectPendingTrack(t *testing.T) {
	if os.Getenv("INTEGRATION") == "" {
		t.Skip("set INTEGRATION=1 to run postgres integration tests")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	pool, cleanupPG := testutil.StartPostgres(t, ctx)
	defer cleanupPG()
	redisClient, cleanupRedis := testutil.StartRedis(t)
	defer cleanupRedis()

	userRepo := users.NewRepository(pool)
	creator, err := userRepo.Create(ctx, domain.CreateUserInput{
		Handle:      "mod_test",
		DisplayName: "Mod Test",
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}

	cat := catalog.NewRepository(pool)
	track, err := cat.Create(ctx, domain.CreateTrackInput{
		CreatorID:  creator.ID,
		Title:      "Pending E2E Mix",
		DurationMs: 180000,
		Status:     domain.TrackPendingReview,
	})
	if err != nil {
		t.Fatalf("create track: %v", err)
	}

	q := queue.NewRedisQueueFromClient(redisClient)
	h := admin.NewHandler(cat, userRepo, q, nil, nil, nil, nil, social.NewRepository(pool))

	const secret = "integration-admin-secret"
	router := chi.NewRouter()
	router.Route("/internal/admin", func(r chi.Router) {
		r.Use(admin.Guard(secret))
		r.Mount("/", h.Routes())
	})

	listReq := httptest.NewRequest(http.MethodGet, "/internal/admin/tracks?status=pending_review", nil)
	listReq.Header.Set(admin.AdminKeyHeader, secret)
	listRec := httptest.NewRecorder()
	router.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("list pending: %d %s", listRec.Code, listRec.Body.String())
	}
	var listBody struct {
		Items []struct {
			ID string `json:"id"`
		} `json:"items"`
	}
	if err := json.Unmarshal(listRec.Body.Bytes(), &listBody); err != nil {
		t.Fatal(err)
	}
	if len(listBody.Items) < 1 {
		t.Fatal("expected pending tracks")
	}

	approveReq := httptest.NewRequest(http.MethodPost, "/internal/admin/tracks/"+track.ID.String()+"/approve", nil)
	approveReq.Header.Set(admin.AdminKeyHeader, secret)
	approveRec := httptest.NewRecorder()
	router.ServeHTTP(approveRec, approveReq)
	if approveRec.Code != http.StatusOK {
		t.Fatalf("approve: %d %s", approveRec.Code, approveRec.Body.String())
	}

	updated, err := cat.GetByID(ctx, track.ID)
	if err != nil {
		t.Fatal(err)
	}
	if updated.Status != domain.TrackApproved {
		t.Fatalf("expected approved, got %s", updated.Status)
	}

	// Reject flow on another track
	track2, err := cat.Create(ctx, domain.CreateTrackInput{
		CreatorID:  creator.ID,
		Title:      "Reject Me",
		DurationMs: 120000,
		Status:     domain.TrackPendingReview,
	})
	if err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal(map[string]string{"reason": "test reject"})
	rejectReq := httptest.NewRequest(http.MethodPost, "/internal/admin/tracks/"+track2.ID.String()+"/reject", bytes.NewReader(body))
	rejectReq.Header.Set(admin.AdminKeyHeader, secret)
	rejectReq.Header.Set("Content-Type", "application/json")
	rejectRec := httptest.NewRecorder()
	router.ServeHTTP(rejectRec, rejectReq)
	if rejectRec.Code != http.StatusOK {
		t.Fatalf("reject: %d %s", rejectRec.Code, rejectRec.Body.String())
	}
	rejected, err := cat.GetByID(ctx, track2.ID)
	if err != nil {
		t.Fatal(err)
	}
	if rejected.Status != domain.TrackDraft {
		t.Fatalf("expected draft after reject, got %s", rejected.Status)
	}
}
