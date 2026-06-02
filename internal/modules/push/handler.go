package push

import (
	"encoding/json"
	"net/http"
	"strings"

	platformauth "github.com/gachify/gachify/internal/platform/auth"
	"github.com/gachify/gachify/internal/platform/httpserver"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) VAPIDPublicKey(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil || !h.svc.Enabled() {
		httpserver.JSON(w, http.StatusOK, map[string]any{"enabled": false, "public_key": ""})
		return
	}
	httpserver.JSON(w, http.StatusOK, map[string]any{
		"enabled":    true,
		"public_key": h.svc.PublicKey(),
	})
}

func (h *Handler) Subscribe(w http.ResponseWriter, r *http.Request) {
	uid, ok := platformauth.UserIDFromContext(r.Context())
	if !ok {
		httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "login required")
		return
	}
	if h.svc == nil || !h.svc.Enabled() {
		httpserver.Error(w, http.StatusServiceUnavailable, "unavailable", "web push not configured")
		return
	}
	var body struct {
		Endpoint string `json:"endpoint"`
		Keys     struct {
			P256dh string `json:"p256dh"`
			Auth   string `json:"auth"`
		} `json:"keys"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_json", "invalid body")
		return
	}
	if strings.TrimSpace(body.Endpoint) == "" || body.Keys.P256dh == "" || body.Keys.Auth == "" {
		httpserver.Error(w, http.StatusBadRequest, "invalid_input", "endpoint and keys required")
		return
	}
	if err := h.svc.Subscribe(r.Context(), uid, Subscription{
		Endpoint: body.Endpoint,
		P256dh:   body.Keys.P256dh,
		Auth:     body.Keys.Auth,
	}); err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to save subscription")
		return
	}
	httpserver.JSON(w, http.StatusOK, map[string]string{"status": "subscribed"})
}

func (h *Handler) Unsubscribe(w http.ResponseWriter, r *http.Request) {
	uid, ok := platformauth.UserIDFromContext(r.Context())
	if !ok {
		httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "login required")
		return
	}
	var body struct {
		Endpoint string `json:"endpoint"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if strings.TrimSpace(body.Endpoint) == "" {
		httpserver.Error(w, http.StatusBadRequest, "invalid_input", "endpoint required")
		return
	}
	if h.svc != nil {
		_ = h.svc.Unsubscribe(r.Context(), uid, body.Endpoint)
	}
	httpserver.JSON(w, http.StatusOK, map[string]string{"status": "unsubscribed"})
}
