package auth

import (
	"context"
	"strings"
	"time"

	"github.com/gachify/gachify/internal/domain"
	platformauth "github.com/gachify/gachify/internal/platform/auth"
	"github.com/gachify/gachify/internal/modules/users"
)

type Service struct {
	repo      *Repository
	users     *users.Repository
	tokens    *platformauth.TokenService
	accessTTL time.Duration
}

func NewService(repo *Repository, users *users.Repository, tokens *platformauth.TokenService, accessTTL time.Duration) *Service {
	return &Service{repo: repo, users: users, tokens: tokens, accessTTL: accessTTL}
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
	return s.issueTokens(ctx, u)
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
