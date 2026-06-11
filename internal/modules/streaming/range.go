package streaming

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

type byteRange struct {
	start int64
	end   int64
}

func parseByteRange(header string, size int64) (byteRange, bool) {
	if size <= 0 || !strings.HasPrefix(header, "bytes=") {
		return byteRange{}, false
	}
	spec := strings.TrimSpace(header[6:])
	if spec == "" {
		return byteRange{}, false
	}
	parts := strings.SplitN(spec, "-", 2)
	if len(parts) != 2 {
		return byteRange{}, false
	}

	var start, end int64
	var err error

	switch {
	case parts[0] != "" && parts[1] != "":
		start, err = strconv.ParseInt(parts[0], 10, 64)
		if err != nil || start < 0 {
			return byteRange{}, false
		}
		end, err = strconv.ParseInt(parts[1], 10, 64)
		if err != nil || end < start {
			return byteRange{}, false
		}
	case parts[0] != "":
		start, err = strconv.ParseInt(parts[0], 10, 64)
		if err != nil || start < 0 || start >= size {
			return byteRange{}, false
		}
		end = size - 1
	case parts[1] != "":
		suffix, err := strconv.ParseInt(parts[1], 10, 64)
		if err != nil || suffix <= 0 {
			return byteRange{}, false
		}
		if suffix >= size {
			start = 0
		} else {
			start = size - suffix
		}
		end = size - 1
	default:
		return byteRange{}, false
	}

	if end >= size {
		end = size - 1
	}
	if start > end {
		return byteRange{}, false
	}
	return byteRange{start: start, end: end}, true
}

func writeRangeNotSatisfiable(w http.ResponseWriter, size int64) {
	w.Header().Set("Content-Range", fmt.Sprintf("bytes */%d", size))
	w.WriteHeader(http.StatusRequestedRangeNotSatisfiable)
}
