package auth

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/gachify/gachify/internal/domain"
	platformauth "github.com/gachify/gachify/internal/platform/auth"
	"github.com/gachify/gachify/internal/modules/users"
	"github.com/gachify/gachify/internal/platform/email"
	"github.com/gachify/gachify/internal/platform/validate"
	"github.com/google/uuid"
)

type Service struct {
	repo          *Repository
	users         *users.Repository
	tokens        *platformauth.TokenService
	accessTTL     time.Duration
	mailer        email.Mailer
	frontendURL   string
}

func NewService(repo *Repository, users *users.Repository, tokens *platformauth.TokenService, accessTTL time.Duration, mailer email.Mailer, frontendURL string) *Service {
	return &Service{repo: repo, users: users, tokens: tokens, accessTTL: accessTTL, mailer: mailer, frontendURL: frontendURL}
}

func (s *Service) Register(ctx context.Context, in domain.RegisterInput) (domain.TokenResponse, error) {
	email := strings.TrimSpace(strings.ToLower(in.Email))
	handle := strings.TrimSpace(strings.ToLower(in.Handle))
	if email == "" || len(in.Password) < 8 || handle == "" {
		return domain.TokenResponse{}, ErrInvalidLogin
	}
	display := strings.TrimSpace(in.DisplayName)
	if display == "" {
		display = handle
	}

	hash, err := platformauth.HashPassword(in.Password)
	if err != nil {
		return domain.TokenResponse{}, err
	}

	u, err := s.repo.CreateUserWithAuth(ctx, email, hash, handle, display)
	if err != nil {
		return domain.TokenResponse{}, err
	}
	_ = s.repo.CreateDefaultPlaylists(ctx, u.ID)
	out, err := s.issueTokens(ctx, u)
	if err != nil {
		return domain.TokenResponse{}, err
	}
	s.sendVerificationEmail(ctx, u.ID)
	return out, nil
}

func (s *Service) Login(ctx context.Context, in domain.LoginInput) (domain.TokenResponse, error) {
	email := strings.TrimSpace(strings.ToLower(in.Email))
	u, hash, err := s.repo.GetByEmail(ctx, email)
	if err != nil {
		return domain.TokenResponse{}, err
	}
	if hash == "" || !platformauth.CheckPassword(hash, in.Password) {
		return domain.TokenResponse{}, ErrInvalidLogin
	}
	return s.issueTokens(ctx, u)
}

func (s *Service) Refresh(ctx context.Context, refreshToken string) (domain.TokenResponse, error) {
	userID, err := s.repo.UserIDForRefreshToken(ctx, refreshToken)
	if err != nil {
		return domain.TokenResponse{}, err
	}
	if _, err := s.tokens.Parse(refreshToken, platformauth.TokenRefresh); err != nil {
		return domain.TokenResponse{}, ErrInvalidRefresh
	}
	u, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return domain.TokenResponse{}, ErrInvalidRefresh
	}
	_ = s.repo.RevokeRefreshToken(ctx, refreshToken)
	return s.issueTokens(ctx, u)
}

func (s *Service) Logout(ctx context.Context, refreshToken string) error {
	if refreshToken == "" {
		return nil
	}
	return s.repo.RevokeRefreshToken(ctx, refreshToken)
}

func (s *Service) IssueTokensForUser(ctx context.Context, u domain.User) (domain.TokenResponse, error) {
	return s.issueTokens(ctx, u)
}

func (s *Service) ForgotPassword(ctx context.Context, emailAddr string) error {
	raw, _, err := s.repo.CreatePasswordReset(ctx, strings.TrimSpace(strings.ToLower(emailAddr)), 24*time.Hour)
	if err != nil || raw == "" {
		return err
	}
	if s.mailer != nil {
		body := email.PasswordResetBody(s.frontendURL, raw)
		_ = s.mailer.Send(emailAddr, "Reset your Gachify password", body)
	}
	return nil
}

func (s *Service) ResetPassword(ctx context.Context, token, password string) error {
	if err := validate.Password(password); err != nil {
		return err
	}
	hash, err := platformauth.HashPassword(password)
	if err != nil {
		return err
	}
	return s.repo.ResetPassword(ctx, token, hash)
}

func (s *Service) VerifyEmail(ctx context.Context, token string) error {
	return s.repo.VerifyEmail(ctx, token)
}

func (s *Service) ResendVerification(ctx context.Context, userID uuid.UUID) error {
	verified, err := s.repo.IsEmailVerified(ctx, userID)
	if err != nil {
		return err
	}
	if verified {
		return nil
	}
	s.sendVerificationEmail(ctx, userID)
	return nil
}

func (s *Service) UpdateProfile(ctx context.Context, userID uuid.UUID, in domain.UpdateProfileInput) (domain.AccountUser, error) {
	if in.Handle != nil {
		handle := strings.TrimSpace(strings.ToLower(*in.Handle))
		if err := validate.Handle(handle); err != nil {
			return domain.AccountUser{}, err
		}
		taken, err := s.users.IsHandleTaken(ctx, handle, userID)
		if err != nil {
			return domain.AccountUser{}, err
		}
		if taken {
			return domain.AccountUser{}, users.ErrHandleTaken
		}
		in.Handle = &handle
	}
	if in.DisplayName != nil {
		name := strings.TrimSpace(*in.DisplayName)
		if name == "" {
			return domain.AccountUser{}, fmt.Errorf("display_name is required")
		}
		in.DisplayName = &name
	}
	if in.ProfileBio != nil {
		bio := strings.TrimSpace(*in.ProfileBio)
		if len(bio) > 500 {
			return domain.AccountUser{}, fmt.Errorf("profile_bio must be at most 500 characters")
		}
		in.ProfileBio = &bio
	}
	if in.AvatarURL != nil {
		av := strings.TrimSpace(*in.AvatarURL)
		if av != "" && len(av) > 2048 {
			return domain.AccountUser{}, fmt.Errorf("avatar_url is too long")
		}
		in.AvatarURL = &av
	}
	if in.PushNotifications != nil {
		p := strings.TrimSpace(strings.ToLower(*in.PushNotifications))
		if p != "off" && p != "following" {
			return domain.AccountUser{}, fmt.Errorf("push_notifications must be off or following")
		}
		in.PushNotifications = &p
	}
	u, err := s.users.UpdateProfile(ctx, userID, in)
	if errors.Is(err, users.ErrHandleTaken) {
		return domain.AccountUser{}, ErrHandleTaken
	}
	return u, err
}

func (s *Service) ChangePassword(ctx context.Context, userID uuid.UUID, in domain.ChangePasswordInput) error {
	if err := validate.Password(in.NewPassword); err != nil {
		return err
	}
	hash, err := s.repo.GetPasswordHash(ctx, userID)
	if err != nil {
		return err
	}
	if hash != "" {
		if in.CurrentPassword == "" || !platformauth.CheckPassword(hash, in.CurrentPassword) {
			return ErrInvalidLogin
		}
	}
	newHash, err := platformauth.HashPassword(in.NewPassword)
	if err != nil {
		return err
	}
	return s.repo.UpdatePassword(ctx, userID, newHash)
}

func (s *Service) sendVerificationEmail(ctx context.Context, userID uuid.UUID) {
	if s.mailer == nil {
		return
	}
	addr, err := s.repo.UserEmail(ctx, userID)
	if err != nil || addr == "" {
		return
	}
	raw, err := s.repo.CreateEmailVerification(ctx, userID, 72*time.Hour)
	if err != nil {
		return
	}
	body := email.VerificationBody(s.frontendURL, raw)
	_ = s.mailer.Send(addr, "Verify your Gachify email", body)
}

func (s *Service) issueTokens(ctx context.Context, u domain.User) (domain.TokenResponse, error) {
	access, _, err := s.tokens.IssueAccess(u.ID)
	if err != nil {
		return domain.TokenResponse{}, err
	}
	refresh, exp, err := s.tokens.IssueRefresh(u.ID)
	if err != nil {
		return domain.TokenResponse{}, err
	}
	if err := s.repo.StoreRefreshToken(ctx, u.ID, refresh, exp); err != nil {
		return domain.TokenResponse{}, err
	}
	return domain.TokenResponse{
		AccessToken:  access,
		RefreshToken: refresh,
		ExpiresIn:    int64(s.accessTTL.Seconds()),
		TokenType:    "Bearer",
		User:         u,
	}, nil
}
