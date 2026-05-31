package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gachify/gachify/internal/config"
	"github.com/gachify/gachify/internal/domain"
	platformauth "github.com/gachify/gachify/internal/platform/auth"
	"github.com/gachify/gachify/internal/modules/users"
	"github.com/gachify/gachify/internal/platform/httpserver"
	"github.com/redis/go-redis/v9"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

const oidcStatePrefix = "gachify:oidc:state:"

type OIDCService struct {
	repo   *Repository
	users  *users.Repository
	tokens *platformauth.TokenService
	auth   *Service
	redis  *redis.Client
	cfg    config.Config
	oauth  *oauth2.Config
}

func NewOIDCService(repo *Repository, users *users.Repository, auth *Service, tokens *platformauth.TokenService, redis *redis.Client, cfg config.Config) *OIDCService {
	svc := &OIDCService{repo: repo, users: users, auth: auth, tokens: tokens, redis: redis, cfg: cfg}
	if cfg.GoogleClientID != "" && cfg.GoogleClientSecret != "" {
		svc.oauth = &oauth2.Config{
			ClientID:     cfg.GoogleClientID,
			ClientSecret: cfg.GoogleClientSecret,
			RedirectURL:  cfg.GoogleRedirectURL,
			Scopes:       []string{"openid", "email", "profile"},
			Endpoint:     google.Endpoint,
		}
	}
	return svc
}

func (s *OIDCService) Enabled() bool {
	return s.oauth != nil
}

func (s *OIDCService) Providers() []map[string]any {
	if !s.Enabled() {
		return nil
	}
	return []map[string]any{{
		"id":            "google",
		"name":          "Google",
		"enabled":       true,
		"authorize_url": "/api/v1/auth/oidc/google/start",
	}}
}

func (s *OIDCService) StartGoogle(w http.ResponseWriter, r *http.Request) {
	if !s.Enabled() {
		httpserver.Error(w, http.StatusNotImplemented, "oidc_not_configured", "Google OAuth is not configured")
		return
	}
	state, err := randomState()
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "oidc_error", "could not start OAuth")
		return
	}
	if err := s.redis.Set(r.Context(), oidcStatePrefix+state, "1", 10*time.Minute).Err(); err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "oidc_error", "could not store OAuth state")
		return
	}
	authURL := s.oauth.AuthCodeURL(state, oauth2.AccessTypeOnline)
	http.Redirect(w, r, authURL, http.StatusFound)
}

func (s *OIDCService) CallbackGoogle(w http.ResponseWriter, r *http.Request) {
	if !s.Enabled() {
		httpserver.Error(w, http.StatusNotImplemented, "oidc_not_configured", "Google OAuth is not configured")
		return
	}
	if errParam := r.URL.Query().Get("error"); errParam != "" {
		s.redirectError(w, r, "oauth_denied")
		return
	}
	state := r.URL.Query().Get("state")
	code := r.URL.Query().Get("code")
	if state == "" || code == "" {
		httpserver.Error(w, http.StatusBadRequest, "invalid_callback", "missing code or state")
		return
	}
	n, err := s.redis.Exists(r.Context(), oidcStatePrefix+state).Result()
	if err != nil || n == 0 {
		httpserver.Error(w, http.StatusBadRequest, "invalid_state", "OAuth state invalid or expired")
		return
	}
	_ = s.redis.Del(r.Context(), oidcStatePrefix+state).Err()

	tok, err := s.oauth.Exchange(r.Context(), code)
	if err != nil {
		httpserver.Error(w, http.StatusBadGateway, "token_exchange_failed", "Google token exchange failed")
		return
	}
	profile, err := fetchGoogleProfile(r.Context(), tok.AccessToken)
	if err != nil {
		httpserver.Error(w, http.StatusBadGateway, "profile_fetch_failed", "could not load Google profile")
		return
	}
	email := strings.TrimSpace(strings.ToLower(profile.Email))
	if email == "" {
		httpserver.Error(w, http.StatusBadRequest, "email_required", "Google account has no email")
		return
	}

	u, err := s.repo.FindOrCreateGoogleUser(r.Context(), profile.Sub, email, profileName(profile))
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "login_failed", "could not sign in with Google")
		return
	}

	out, err := s.auth.IssueTokensForUser(r.Context(), u)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "token_failed", "could not issue session")
		return
	}

	redirect := s.frontendCallbackURL(out)
	http.Redirect(w, r, redirect, http.StatusFound)
}

type googleProfile struct {
	Sub           string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	GivenName     string `json:"given_name"`
}

func fetchGoogleProfile(ctx context.Context, accessToken string) (googleProfile, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://www.googleapis.com/oauth2/v3/userinfo", nil)
	if err != nil {
		return googleProfile{}, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return googleProfile{}, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return googleProfile{}, fmt.Errorf("google userinfo: %s", res.Status)
	}
	var p googleProfile
	if err := json.NewDecoder(res.Body).Decode(&p); err != nil {
		return googleProfile{}, err
	}
	return p, nil
}

func profileName(p googleProfile) string {
	if n := strings.TrimSpace(p.Name); n != "" {
		return n
	}
	if n := strings.TrimSpace(p.GivenName); n != "" {
		return n
	}
	return "Gachify User"
}

func (s *OIDCService) frontendCallbackURL(out domain.TokenResponse) string {
	base := strings.TrimRight(s.cfg.FrontendURL, "/")
	q := url.Values{}
	q.Set("access_token", out.AccessToken)
	q.Set("refresh_token", out.RefreshToken)
	q.Set("expires_in", fmt.Sprintf("%d", out.ExpiresIn))
	return base + "/auth/callback/google?" + q.Encode()
}

func (s *OIDCService) redirectError(w http.ResponseWriter, r *http.Request, code string) {
	base := strings.TrimRight(s.cfg.FrontendURL, "/")
	http.Redirect(w, r, base+"/login?oauth_error="+url.QueryEscape(code), http.StatusFound)
}

func randomState() (string, error) {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}
