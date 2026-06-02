package party

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/gachify/gachify/internal/platform/httpserver"
	"github.com/go-chi/chi/v5"
)

type State struct {
	TrackIDs   []string `json:"track_ids"`
	QueueIndex int      `json:"queue_index"`
	ProgressMs int      `json:"progress_ms"`
	IsPlaying  bool     `json:"is_playing"`
	UpdatedAt  int64    `json:"updated_at"`
}

type room struct {
	code      string
	hostToken string
	state     State
	subs      map[chan State]struct{}
	mu        sync.RWMutex
}

type Hub struct {
	rooms map[string]*room
	mu    sync.RWMutex
}

func NewHub() *Hub {
	return &Hub{rooms: make(map[string]*room)}
}

func (h *Hub) Create() (code, hostToken string, state State) {
	code = randomCode(6)
	hostToken = randomToken()
	state = State{UpdatedAt: time.Now().UnixMilli()}
	r := &room{code: code, hostToken: hostToken, state: state, subs: make(map[chan State]struct{})}
	h.mu.Lock()
	h.rooms[code] = r
	h.mu.Unlock()
	return code, hostToken, state
}

func (h *Hub) Get(code string) (State, bool) {
	h.mu.RLock()
	r, ok := h.rooms[code]
	h.mu.RUnlock()
	if !ok {
		return State{}, false
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.state, true
}

func (h *Hub) UpdateHost(code, hostToken string, state State) (State, bool) {
	h.mu.RLock()
	r, ok := h.rooms[code]
	h.mu.RUnlock()
	if !ok {
		return State{}, false
	}
	r.mu.Lock()
	if r.hostToken != hostToken {
		r.mu.Unlock()
		return State{}, false
	}
	state.UpdatedAt = time.Now().UnixMilli()
	r.state = state
	subs := make([]chan State, 0, len(r.subs))
	for ch := range r.subs {
		subs = append(subs, ch)
	}
	r.mu.Unlock()
	for _, ch := range subs {
		select {
		case ch <- state:
		default:
		}
	}
	return state, true
}

func (h *Hub) Subscribe(code string) (<-chan State, func(), bool) {
	h.mu.RLock()
	r, ok := h.rooms[code]
	h.mu.RUnlock()
	if !ok {
		return nil, nil, false
	}
	ch := make(chan State, 4)
	r.mu.Lock()
	r.subs[ch] = struct{}{}
	r.mu.Unlock()
	unsub := func() {
		r.mu.Lock()
		delete(r.subs, ch)
		close(ch)
		r.mu.Unlock()
	}
	return ch, unsub, true
}

type Handler struct {
	hub *Hub
}

func NewHandler(hub *Hub) *Handler {
	return &Handler{hub: hub}
}

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/", h.create)
	r.Get("/{code}", h.get)
	r.Put("/{code}", h.update)
	r.Get("/{code}/events", h.events)
	return r
}

type createResponse struct {
	Code      string `json:"code"`
	HostToken string `json:"host_token"`
	State     State  `json:"state"`
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	code, token, state := h.hub.Create()
	httpserver.JSON(w, http.StatusCreated, createResponse{Code: code, HostToken: token, State: state})
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	state, ok := h.hub.Get(code)
	if !ok {
		httpserver.Error(w, http.StatusNotFound, "not_found", "party not found")
		return
	}
	httpserver.JSON(w, http.StatusOK, map[string]any{"code": code, "state": state})
}

type updateInput struct {
	HostToken  string   `json:"host_token"`
	TrackIDs   []string `json:"track_ids"`
	QueueIndex int      `json:"queue_index"`
	ProgressMs int      `json:"progress_ms"`
	IsPlaying  bool     `json:"is_playing"`
}

func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	var in updateInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_json", "invalid body")
		return
	}
	if len(in.TrackIDs) > 100 {
		httpserver.Error(w, http.StatusBadRequest, "queue_too_long", "max 100 tracks")
		return
	}
	state, ok := h.hub.UpdateHost(code, in.HostToken, State{
		TrackIDs:   in.TrackIDs,
		QueueIndex: in.QueueIndex,
		ProgressMs: in.ProgressMs,
		IsPlaying:  in.IsPlaying,
	})
	if !ok {
		httpserver.Error(w, http.StatusForbidden, "forbidden", "invalid party or host token")
		return
	}
	httpserver.JSON(w, http.StatusOK, map[string]any{"state": state})
}

func (h *Handler) events(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	ch, unsub, ok := h.hub.Subscribe(code)
	if !ok {
		httpserver.Error(w, http.StatusNotFound, "not_found", "party not found")
		return
	}
	defer unsub()

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	flusher, ok := w.(http.Flusher)
	if !ok {
		httpserver.Error(w, http.StatusInternalServerError, "no_flush", "streaming unsupported")
		return
	}

	if initial, ok := h.hub.Get(code); ok {
		data, _ := json.Marshal(initial)
		_, _ = w.Write([]byte("event: state\ndata: "))
		_, _ = w.Write(data)
		_, _ = w.Write([]byte("\n\n"))
		flusher.Flush()
	}

	heartbeat := time.NewTicker(20 * time.Second)
	defer heartbeat.Stop()

	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case <-heartbeat.C:
			_, _ = w.Write([]byte(": ping\n\n"))
			flusher.Flush()
		case state, open := <-ch:
			if !open {
				return
			}
			data, _ := json.Marshal(state)
			_, _ = w.Write([]byte("event: state\ndata: "))
			_, _ = w.Write(data)
			_, _ = w.Write([]byte("\n\n"))
			flusher.Flush()
		}
	}
}

func randomCode(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)[:n]
}

func randomToken() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
