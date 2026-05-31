package email

import (
	"fmt"
	"log/slog"
)

type Mailer interface {
	Send(to, subject, body string) error
}

type LogMailer struct {
	log *slog.Logger
}

func NewLogMailer(log *slog.Logger) *LogMailer {
	return &LogMailer{log: log}
}

func (m *LogMailer) Send(to, subject, body string) error {
	m.log.Info("email", "to", to, "subject", subject, "body", body)
	return nil
}

type SMTPConfig struct {
	Host     string
	Port     int
	User     string
	Password string
	From     string
}

// NoopMailer discards messages (tests).
type NoopMailer struct{}

func (NoopMailer) Send(_, _, _ string) error { return nil }

func VerificationBody(frontendURL, token string) string {
	return fmt.Sprintf("Verify your email: %s/verify-email?token=%s", frontendURL, token)
}

func PasswordResetBody(frontendURL, token string) string {
	return fmt.Sprintf("Reset your password: %s/reset-password?token=%s", frontendURL, token)
}
