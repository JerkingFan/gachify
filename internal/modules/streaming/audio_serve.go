package streaming

import (
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/gachify/gachify/internal/platform/httpserver"
)

// ServeObjectAudio streams an object with optional HTTP Range support (MP3 seek).
func ServeObjectAudio(w http.ResponseWriter, r *http.Request, svc *Service, objectKey, contentType string) {
	objectKey = strings.TrimSpace(objectKey)
	if objectKey == "" {
		httpserver.Error(w, http.StatusNotFound, "no_audio", "source file not found")
		return
	}

	head, err := svc.HeadObject(r.Context(), objectKey)
	if err != nil {
		httpserver.Error(w, http.StatusNotFound, "not_found", "audio not found")
		return
	}
	totalSize := head.Size
	if totalSize <= 0 {
		httpserver.Error(w, http.StatusNotFound, "not_found", "audio not found")
		return
	}

	ct := contentType
	if ct == "" {
		ct = head.ContentType
	}

	w.Header().Set("Content-Type", ct)
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("Cache-Control", "private, max-age=120")

	rangeHdr := r.Header.Get("Range")
	if rangeHdr == "" {
		stream, err := svc.OpenObject(r.Context(), objectKey)
		if err != nil {
			httpserver.Error(w, http.StatusNotFound, "not_found", "audio not found")
			return
		}
		defer stream.Body.Close()
		w.Header().Set("Content-Length", fmt.Sprintf("%d", totalSize))
		w.WriteHeader(http.StatusOK)
		_, _ = io.Copy(w, stream.Body)
		return
	}

	br, ok := parseByteRange(rangeHdr, totalSize)
	if !ok {
		writeRangeNotSatisfiable(w, totalSize)
		return
	}

	stream, err := svc.OpenObjectRange(r.Context(), objectKey, br.start, br.end)
	if err != nil {
		httpserver.Error(w, http.StatusNotFound, "not_found", "audio not found")
		return
	}
	defer stream.Body.Close()

	partLen := br.end - br.start + 1
	w.Header().Set("Content-Length", fmt.Sprintf("%d", partLen))
	w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", br.start, br.end, totalSize))
	w.WriteHeader(http.StatusPartialContent)
	_, _ = io.Copy(w, stream.Body)
}
