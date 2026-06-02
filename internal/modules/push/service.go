package push

import (
	"context"
	"log/slog"
	"net/http"
	"strings"

	webpush "github.com/SherClockHolmes/webpush-go"
	"github.com/google/uuid"
)

type Config struct {
	VAPIDPublicKey  string
	VAPIDPrivateKey string
	VAPIDSubject    string
	FrontendURL     string
}

type Service struct {
	cfg  Config
	repo *Repository
}

func NewService(cfg Config, repo *Repository) *Service {
	return &Service{cfg: cfg, repo: repo}
}

func (s *Service) Enabled() bool {
	return s.cfg.VAPIDPublicKey != "" && s.cfg.VAPIDPrivateKey != "" && s.cfg.VAPIDSubject != ""
}

func (s *Service) PublicKey() string {
	return s.cfg.VAPIDPublicKey
}

func (s *Service) Subscribe(ctx context.Context, userID uuid.UUID, sub Subscription) error {
	return s.repo.UpsertSubscription(ctx, userID, sub)
}

func (s *Service) Unsubscribe(ctx context.Context, userID uuid.UUID, endpoint string) error {
	return s.repo.DeleteSubscription(ctx, userID, endpoint)
}

func (s *Service) NotifyFollowersNewRelease(ctx context.Context, creatorID, trackID uuid.UUID, trackTitle, creatorHandle string) {
	if !s.Enabled() || s.repo == nil {
		return
	}
	targets, err := s.repo.ListFollowerTargets(ctx, creatorID)
	if err != nil || len(targets) == 0 {
		return
	}
	handle := creatorHandle
	if handle == "" {
		handle = "artist"
	}
	trackURL := stringsTrimRight(s.cfg.FrontendURL) + "/track/" + trackID.String()
	payload, err := Payload{
		Title: "New remix from @" + handle,
		Body:  trackTitle,
		URL:   trackURL,
		Tag:   "release-" + trackID.String(),
	}.JSON()
	if err != nil {
		return
	}
	for _, t := range targets {
		if err := s.send(ctx, t, payload); err != nil {
			slog.Warn("web push failed", "user_id", t.UserID, "error", err)
		}
	}
}

func (s *Service) send(ctx context.Context, t Target, payload []byte) error {
	sub := &webpush.Subscription{
		Endpoint: t.Endpoint,
		Keys: webpush.Keys{
			P256dh: t.P256dh,
			Auth:   t.Auth,
		},
	}
	resp, err := webpush.SendNotificationWithContext(ctx, payload, sub, &webpush.Options{
		Subscriber:      s.cfg.VAPIDSubject,
		VAPIDPublicKey:  s.cfg.VAPIDPublicKey,
		VAPIDPrivateKey: s.cfg.VAPIDPrivateKey,
		TTL:             86400,
	})
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusGone || resp.StatusCode == http.StatusNotFound {
		_ = s.repo.DeleteByEndpoint(ctx, t.Endpoint)
	}
	return nil
}

func stringsTrimRight(s string) string {
	return strings.TrimRight(s, "/")
}
