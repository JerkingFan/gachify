package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/gachify/gachify/internal/config"
	"github.com/redis/go-redis/v9"
)

func TestOIDCStateStoredOnStartAndRequiredOnCallback(t *testing.T) {
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatal(err)
	}
	defer mr.Close()
	client := redis.NewClient(&redis.Options{Addr: mr.Addr()})

	cfg := config.Config{
		GoogleClientID:     "test-client-id",
		GoogleClientSecret: "test-client-secret",
		GoogleRedirectURL:  "http://localhost/callback",
	}
	svc := NewOIDCService(nil, nil, nil, nil, client, cfg)
	if !svc.Enabled() {
		t.Fatal("expected OIDC enabled with google credentials")
	}

	req := httptest.NewRequest(http.MethodGet, "/oidc/google/start", nil)
	rec := httptest.NewRecorder()
	svc.StartGoogle(rec, req)
	if rec.Code != http.StatusFound {
		t.Fatalf("expected redirect, got %d", rec.Code)
	}
	loc := rec.Header().Get("Location")
	if loc == "" {
		t.Fatal("missing redirect location")
	}

	keys := mr.Keys()
	if len(keys) != 1 {
		t.Fatalf("expected 1 redis key for state, got %v", keys)
	}
	stateKey := keys[0]
	state := stateKey[len(oidcStatePrefix):]

	badReq := httptest.NewRequest(http.MethodGet, "/oidc/google/callback?code=x&state=wrong", nil)
	badRec := httptest.NewRecorder()
	svc.CallbackGoogle(badRec, badReq)
	if badRec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for bad state, got %d", badRec.Code)
	}

	n, err := client.Exists(context.Background(), oidcStatePrefix+state).Result()
	if err != nil || n != 1 {
		t.Fatal("valid state should still exist after failed callback")
	}
}
