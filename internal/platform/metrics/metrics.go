package metrics

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
	httpDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "gachify_http_request_duration_seconds",
		Help:    "HTTP request latency in seconds.",
		Buckets: prometheus.DefBuckets,
	}, []string{"method", "route", "status"})

	transcodeDuration = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "gachify_transcode_duration_seconds",
		Help:    "End-to-end transcode job duration in seconds.",
		Buckets: []float64{5, 15, 30, 60, 120, 300, 600, 1200},
	})

	queueDepth = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "gachify_queue_depth",
		Help: "Transcode queue depth by queue name.",
	}, []string{"queue"})

	readyGauge = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "gachify_ready",
		Help: "1 when all API dependencies are up, 0 when degraded.",
	})

	transcodeDLQTotal = promauto.NewCounter(prometheus.CounterOpts{
		Name: "gachify_transcode_dlq_total",
		Help: "Total transcode jobs moved to the dead-letter queue.",
	})
)

func Handler() http.Handler {
	return promhttp.Handler()
}

func Middleware() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
			next.ServeHTTP(ww, r)
			route := chiRoutePattern(r)
			httpDuration.WithLabelValues(
				r.Method,
				route,
				strconv.Itoa(ww.Status()),
			).Observe(time.Since(start).Seconds())
		})
	}
}

func ObserveTranscode(d time.Duration) {
	transcodeDuration.Observe(d.Seconds())
}

func SetQueueDepth(name string, depth float64) {
	queueDepth.WithLabelValues(name).Set(depth)
}

func SetReady(up bool) {
	if up {
		readyGauge.Set(1)
		return
	}
	readyGauge.Set(0)
}

func IncTranscodeDLQ() {
	transcodeDLQTotal.Inc()
}

func chiRoutePattern(r *http.Request) string {
	if rc := chi.RouteContext(r.Context()); rc != nil {
		if pattern := rc.RoutePattern(); pattern != "" {
			return pattern
		}
	}
	if r.URL != nil {
		return r.URL.Path
	}
	return "unknown"
}
