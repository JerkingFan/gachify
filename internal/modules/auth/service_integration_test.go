package auth_test

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/gachify/gachify/internal/domain"
	authmod "github.com/gachify/gachify/internal/modules/auth"
	"github.com/gachify/gachify/internal/modules/users"
	platformauth "github.com/gachify/gachify/internal/platform/auth"
	"github.com/gachify/gachify/internal/platform/email"
	"github.com/gachify/gachify/internal/testutil"
)

func TestService_RegisterLoginRefresh(t *testing.T) {
	if os.Getenv("INTEGRATION") == "" {
		t.Skip("set INTEGRATION=1 to run postgres integration tests")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	pool, cleanup := testutil.StartPostgres(t, ctx)
	defer cleanup()

	repo := authmod.NewRepository(pool)
	userRepo := users.NewRepository(pool)
	tokens := platformauth.NewTokenService("integration-test-jwt-secret-min-32-chars!!", 15*time.Minute, 168*time.Hour)
	svc := authmod.NewService(repo, userRepo, tokens, 15*time.Minute, email.NoopMailer{}, "http://localhost:5173")

	handle := "auth_int_" + time.Now().Format("150405")
	out, err := svc.Register(ctx, domain.RegisterInput{
		Email:       handle + "@example.com",
		Password:    "password123",
		Handle:      handle,
		DisplayName: "Auth Integration",
	})
	if err != nil {
		t.Fatalf("register: %v", err)
	}
	if out.AccessToken == "" || out.RefreshToken == "" {
		t.Fatal("expected tokens from register")
	}

	login, err := svc.Login(ctx, domain.LoginInput{
		Email:    handle + "@example.com",
		Password: "password123",
	})
	if err != nil {
		t.Fatalf("login: %v", err)
	}

	refreshed, err := svc.Refresh(ctx, login.RefreshToken)
	if err != nil {
		t.Fatalf("refresh: %v", err)
	}
	if refreshed.AccessToken == "" {
		t.Fatal("expected new access token")
	}
	if refreshed.RefreshToken == login.RefreshToken {
		t.Fatal("expected rotated refresh token")
	}
}
