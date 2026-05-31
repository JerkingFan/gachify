package email

import (
	"log/slog"
	"os"
	"testing"
)

func TestNewMailerDevelopmentUsesLog(t *testing.T) {
	m, err := NewMailer("development", SMTPConfig{}, slog.New(slog.NewTextHandler(os.Stderr, nil)))
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := m.(*LogMailer); !ok {
		t.Fatalf("expected LogMailer, got %T", m)
	}
}

func TestNewSMTPMailerRequiresHost(t *testing.T) {
	_, err := NewSMTPMailer(SMTPConfig{}, slog.Default())
	if err == nil {
		t.Fatal("expected error for empty host")
	}
}

func TestNewMailerProductionRequiresSMTP(t *testing.T) {
	_, err := NewMailer("production", SMTPConfig{}, slog.Default())
	if err == nil {
		t.Fatal("expected error for production without smtp host")
	}
}
