package auth

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/gachify/gachify/internal/config"
	"github.com/gachify/gachify/internal/domain"
	platformauth "github.com/gachify/gachify/internal/platform/auth"
	"github.com/gachify/gachify/internal/modules/users"
	"github.com/gachify/gachify/internal/platform/httpserver"
	"github.com/go-chi/chi/v5"
)

type Handler struct {
	svc    *Service
	users  *users.Repository
	cfg    config.Config
}

func NewHandler(svc *Service, users *users.Repository, cfg config.Config) *Handler {
	return &Handler{svc: svc, users: users, cfg: cfg}
}

func (h *Handler) Routes(tokens *platformauth.TokenService) chi.Router {
	r := chi.NewRouter()
	r.Post("/register", h.register)
	r.Post("/login", h.login)
	r.Post("/refresh", h.refresh)
	r.Post("/logout", h.logout)
	r.Get("/oidc/providers", h.oidcProviders)

	r.Group(func(pr chi.Router) {
		pr.Use(platformauth.Middleware(tokens))
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

func (h *Handler) logout(w http.ResponseWriter, r *http.Request) {
	var in domain.RefreshInput
	_ = json.NewDecoder(r.Body).Decode(&in)
	_ = h.svc.Logout(r.Context(), in.RefreshToken)
	httpserver.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
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
	if h.cfg.GoogleClientID != "" {
		providers = append(providers, map[string]any{
			"id":          "google",
			"name":        "Google",
			"enabled":     true,
			"authorize_url": "/api/v1/auth/oidc/google/start",
		})
	}
	httpserver.JSON(w, http.StatusOK, map[string]any{"providers": providers})
}

// OIDC start placeholder — full OAuth flow wired when client credentials are set.
func (h *Handler) OIDCRoutes() chi.Router {
	r := chi.NewRouter()
	r.Get("/google/start", func(w http.ResponseWriter, _ *http.Request) {
		if strings.TrimSpace(h.cfg.GoogleClientID) == "" {
			httpserver.Error(w, http.StatusNotImplemented, "oidc_not_configured", "Google OIDC is not configured")
			return
		}
		httpserver.Error(w, http.StatusNotImplemented, "oidc_soon", "Google OIDC callback — configure GACHIFY_GOOGLE_* and implement callback handler")
	})
	return r
}
