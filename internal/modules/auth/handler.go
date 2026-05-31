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
	users  *users.Repository
	cfg    config.Config
}

func NewHandler(svc *Service, users *users.Repository, cfg config.Config) *Handler {
	return &Handler{svc: svc, users: users, cfg: cfg}
}

func (h *Handler) Routes(tokens *platformauth.TokenService, rl *ratelimit.Limiter) chi.Router {
	r := chi.NewRouter()
	r.With(rl.Middleware("auth:register", h.cfg.RateLimit.AuthRegister, time.Minute, ratelimit.ByIP)).Post("/register", h.register)
	r.With(rl.Middleware("auth:login", h.cfg.RateLimit.AuthLogin, time.Minute, ratelimit.ByIP)).Post("/login", h.login)
	r.Post("/refresh", h.refresh)
	r.Post("/logout", h.logout)

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
