package auth

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/gachify/gachify/internal/config"
	"github.com/gachify/gachify/internal/domain"
	platformauth "github.com/gachify/gachify/internal/platform/auth"
	"github.com/gachify/gachify/internal/modules/users"
	"github.com/gachify/gachify/internal/platform/httpserver"
	"github.com/gachify/gachify/internal/platform/ratelimit"
	"github.com/gachify/gachify/internal/platform/validate"
	"github.com/go-chi/chi/v5"
)

type Handler struct {
	svc    *Service
	oidc   *OIDCService
	users  *users.Repository
	cfg    config.Config
}

func NewHandler(svc *Service, oidc *OIDCService, users *users.Repository, cfg config.Config) *Handler {
	return &Handler{svc: svc, oidc: oidc, users: users, cfg: cfg}
}

func (h *Handler) Routes(tokens *platformauth.TokenService, rl *ratelimit.Limiter, blacklist *platformauth.TokenBlacklist) chi.Router {
	r := chi.NewRouter()
	r.With(rl.Middleware("auth:register", h.cfg.RateLimit.AuthRegister, time.Minute, ratelimit.ByIP)).Post("/register", h.register)
	r.With(rl.Middleware("auth:login", h.cfg.RateLimit.AuthLogin, time.Minute, ratelimit.ByIP)).Post("/login", h.login)
	r.Post("/refresh", h.refresh)
	r.Post("/logout", h.logout(blacklist, tokens))
	r.Post("/forgot-password", h.forgotPassword)
	r.Post("/reset-password", h.resetPassword)
	r.Post("/verify-email", h.verifyEmail)
	r.Get("/oidc/providers", h.oidcProviders)
	r.Mount("/oidc", h.OIDCRoutes())

	r.Group(func(pr chi.Router) {
		pr.Use(platformauth.Middleware(tokens, blacklist))
		pr.Get("/me", h.me)
	})
	return r
}

func (h *Handler) register(w http.ResponseWriter, r *http.Request) {
	var in domain.RegisterInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_json", "invalid request body")
		return
	}
	if err := validate.Email(in.Email); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_email", err.Error())
		return
	}
	if err := validate.Handle(in.Handle); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_handle", err.Error())
		return
	}
	if err := validate.Password(in.Password); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_password", err.Error())
		return
	}
	out, err := h.svc.Register(r.Context(), in)
	if errors.Is(err, ErrEmailTaken) || errors.Is(err, ErrHandleTaken) {
		httpserver.Error(w, http.StatusConflict, "conflict", err.Error())
		return
	}
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "register_failed", "could not register")
		return
	}
	httpserver.JSON(w, http.StatusCreated, out)
}

func (h *Handler) login(w http.ResponseWriter, r *http.Request) {
	var in domain.LoginInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_json", "invalid request body")
		return
	}
	if err := validate.Email(in.Email); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_email", err.Error())
		return
	}
	if in.Password == "" {
		httpserver.Error(w, http.StatusBadRequest, "invalid_password", "password is required")
		return
	}
	out, err := h.svc.Login(r.Context(), in)
	if errors.Is(err, ErrInvalidLogin) {
		httpserver.Error(w, http.StatusUnauthorized, "invalid_credentials", "invalid email or password")
		return
	}
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "login_failed", "login failed")
		return
	}
	httpserver.JSON(w, http.StatusOK, out)
}

func (h *Handler) refresh(w http.ResponseWriter, r *http.Request) {
	var in domain.RefreshInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_json", "invalid request body")
		return
	}
	out, err := h.svc.Refresh(r.Context(), in.RefreshToken)
	if errors.Is(err, ErrInvalidRefresh) {
		httpserver.Error(w, http.StatusUnauthorized, "invalid_refresh", "refresh token invalid or expired")
		return
	}
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "refresh_failed", "could not refresh session")
		return
	}
	httpserver.JSON(w, http.StatusOK, out)
}

func (h *Handler) logout(blacklist *platformauth.TokenBlacklist, tokens *platformauth.TokenService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var in domain.RefreshInput
		_ = json.NewDecoder(r.Body).Decode(&in)
		platformauth.RevokeAccessFromRequest(r.Context(), tokens, blacklist, r)
		_ = h.svc.Logout(r.Context(), in.RefreshToken)
		httpserver.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func (h *Handler) me(w http.ResponseWriter, r *http.Request) {
	userID, ok := platformauth.UserIDFromContext(r.Context())
	if !ok {
		httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}
	u, err := h.users.GetByID(r.Context(), userID)
	if errors.Is(err, users.ErrNotFound) {
		httpserver.Error(w, http.StatusNotFound, "not_found", "user not found")
		return
	}
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to load profile")
		return
	}
	httpserver.JSON(w, http.StatusOK, u)
}

func (h *Handler) oidcProviders(w http.ResponseWriter, _ *http.Request) {
	providers := []map[string]any{}
	if h.oidc != nil {
		providers = h.oidc.Providers()
	}
	httpserver.JSON(w, http.StatusOK, map[string]any{"providers": providers})
}

func (h *Handler) OIDCRoutes() chi.Router {
	r := chi.NewRouter()
	if h.oidc == nil {
		return r
	}
	r.Get("/google/start", h.oidc.StartGoogle)
	r.Get("/google/callback", h.oidc.CallbackGoogle)
	return r
}

func (h *Handler) forgotPassword(w http.ResponseWriter, r *http.Request) {
	var in domain.ForgotPasswordInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_json", "invalid body")
		return
	}
	if err := validate.Email(in.Email); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_email", err.Error())
		return
	}
	_ = h.svc.ForgotPassword(r.Context(), in.Email)
	httpserver.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) resetPassword(w http.ResponseWriter, r *http.Request) {
	var in domain.ResetPasswordInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_json", "invalid body")
		return
	}
	if err := h.svc.ResetPassword(r.Context(), in.Token, in.Password); err != nil {
		if errors.Is(err, ErrInvalidLogin) {
			httpserver.Error(w, http.StatusBadRequest, "invalid_token", "reset link invalid or expired")
			return
		}
		httpserver.Error(w, http.StatusBadRequest, "invalid_password", err.Error())
		return
	}
	httpserver.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) verifyEmail(w http.ResponseWriter, r *http.Request) {
	var in domain.VerifyEmailInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_json", "invalid body")
		return
	}
	if err := h.svc.VerifyEmail(r.Context(), in.Token); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_token", "verification link invalid or expired")
		return
	}
	httpserver.JSON(w, http.StatusOK, map[string]string{"status": "verified"})
}
