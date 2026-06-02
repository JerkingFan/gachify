package share

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"html"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func (h *Handler) trackOGImage(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.NotFound(w, r)
		return
	}
	t, err := h.catalog.GetByID(r.Context(), id)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	title := html.EscapeString(t.Title)
	if len(title) > 80 {
		title = title[:77] + "…"
	}
	c1, c2 := gradientFromID(t.ID.String())
	w.Header().Set("Content-Type", "image/svg+xml; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=86400")
	fmt.Fprintf(w, `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs><linearGradient id="g" x1="0%%" y1="0%%" x2="100%%" y2="100%%">
<stop offset="0%%" stop-color="#%s"/><stop offset="100%%" stop-color="#%s"/>
</linearGradient></defs>
<rect width="1200" height="630" fill="url(#g)"/>
<rect width="1200" height="630" fill="#000" opacity="0.35"/>
<text x="80" y="120" fill="#1ed760" font-family="system-ui,sans-serif" font-size="36" font-weight="700">Gachify ♂</text>
<text x="80" y="320" fill="#ffffff" font-family="system-ui,sans-serif" font-size="64" font-weight="800">%s</text>
<text x="80" y="400" fill="#b3b3b3" font-family="system-ui,sans-serif" font-size="32">Deep dark fantasy remix</text>
</svg>`, c1, c2, title)
}

func gradientFromID(id string) (string, string) {
	sum := sha256.Sum256([]byte(id))
	h := hex.EncodeToString(sum[:6])
	if len(h) < 12 {
		h = h + "282828282828"
	}
	return h[:6], h[6:12]
}
