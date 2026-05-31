package streaming

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestIssueAndVerify(t *testing.T) {
	signer := NewTokenSigner("test-secret-at-least-32-characters-long!", time.Minute)
	trackID := uuid.MustParse("11111111-1111-1111-1111-111111111111")

	token, exp, err := signer.Issue(trackID, nil)
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}
	if token == "" {
		t.Fatal("expected non-empty token")
	}
	if exp.Before(time.Now()) {
		t.Fatal("expected future expiry")
	}

	claims, err := signer.Verify(token)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	parsed, err := ParseTrackID(claims)
	if err != nil {
		t.Fatalf("ParseTrackID: %v", err)
	}
	if parsed != trackID {
		t.Fatalf("track id mismatch: got %s", parsed)
	}
}

func TestVerifyRejectsTamperedToken(t *testing.T) {
	signer := NewTokenSigner("test-secret-at-least-32-characters-long!", time.Minute)
	trackID := uuid.New()
	token, _, err := signer.Issue(trackID, nil)
	if err != nil {
		t.Fatal(err)
	}
	tampered := token + "x"
	if _, err := signer.Verify(tampered); err == nil {
		t.Fatal("expected tampered token to fail")
	}
}

func TestVerifyRejectsExpiredToken(t *testing.T) {
	signer := NewTokenSigner("test-secret-at-least-32-characters-long!", -time.Second)
	token, _, err := signer.Issue(uuid.New(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := signer.Verify(token); err == nil {
		t.Fatal("expected expired token to fail")
	}
}
