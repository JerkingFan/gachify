package seed

import (
	"github.com/gachify/gachify/internal/modules/catalog"
	"github.com/gachify/gachify/internal/modules/users"
	"github.com/go-chi/chi/v5"
)

type Handler struct {
	users   *users.Handler
	catalog *catalog.Handler
}

func NewHandler(users *users.Handler, catalog *catalog.Handler) *Handler {
	return &Handler{users: users, catalog: catalog}
}

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/users", h.users.Create)
	r.Post("/tracks", h.catalog.Create)
	return r
}
