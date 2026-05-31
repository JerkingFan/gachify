package email

import (
	"fmt"
	"log/slog"
	"net/smtp"
	"strings"
)

type SMTPMailer struct {
	cfg SMTPConfig
	log *slog.Logger
}

func NewSMTPMailer(cfg SMTPConfig, log *slog.Logger) (*SMTPMailer, error) {
	if strings.TrimSpace(cfg.Host) == "" {
		return nil, fmt.Errorf("smtp host is required")
	}
	if cfg.Port <= 0 {
		cfg.Port = 587
	}
	from := strings.TrimSpace(cfg.From)
	if from == "" {
		from = strings.TrimSpace(cfg.User)
	}
	if from == "" {
		return nil, fmt.Errorf("smtp from address is required (GACHIFY_SMTP_FROM or GACHIFY_SMTP_USER)")
	}
	cfg.From = from
	return &SMTPMailer{cfg: cfg, log: log}, nil
}

func (m *SMTPMailer) Send(to, subject, body string) error {
	to = strings.TrimSpace(to)
	if to == "" {
		return fmt.Errorf("recipient is required")
	}
	msg := strings.Join([]string{
		fmt.Sprintf("To: %s", to),
		fmt.Sprintf("From: %s", m.cfg.From),
		fmt.Sprintf("Subject: %s", subject),
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"",
		body,
	}, "\r\n")

	addr := fmt.Sprintf("%s:%d", m.cfg.Host, m.cfg.Port)
	var auth smtp.Auth
	if m.cfg.User != "" {
		auth = smtp.PlainAuth("", m.cfg.User, m.cfg.Password, m.cfg.Host)
	}
	if err := smtp.SendMail(addr, auth, m.cfg.From, []string{to}, []byte(msg)); err != nil {
		return fmt.Errorf("smtp send: %w", err)
	}
	m.log.Info("email sent", "to", to, "subject", subject)
	return nil
}

// NewMailer returns LogMailer in non-production environments and SMTPMailer in production.
func NewMailer(env string, smtpCfg SMTPConfig, log *slog.Logger) (Mailer, error) {
	if env != "production" {
		return NewLogMailer(log), nil
	}
	return NewSMTPMailer(smtpCfg, log)
}
