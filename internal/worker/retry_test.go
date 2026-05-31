package worker

import (
	"testing"
	"time"

	"github.com/gachify/gachify/internal/platform/queue"
)

func TestRetryDelayUsedByHandleFailure(t *testing.T) {
	base := 10 * time.Second
	if queue.RetryDelay(base, 1) != 10*time.Second {
		t.Fatal("expected linear base delay for first attempt")
	}
	if queue.RetryDelay(base, 4) != 80*time.Second {
		t.Fatal("expected exponential backoff")
	}
}
