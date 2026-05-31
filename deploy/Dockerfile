# syntax=docker/dockerfile:1

FROM golang:1.25-alpine AS builder
RUN apk add --no-cache git ca-certificates
WORKDIR /src

# Fallback mirrors help when storage.googleapis.com times out (common on some VPS)
ARG GOPROXY=https://proxy.golang.org,https://goproxy.io,direct
ENV GOPROXY=${GOPROXY}

COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    set -e; \
    for i in 1 2 3 4 5; do \
      go mod download && exit 0; \
      echo "go mod download attempt $i failed, retrying..."; \
      sleep 15; \
    done; \
    exit 1

COPY . .
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -ldflags="-s -w" -o /out/gachify-api ./cmd/api && \
    CGO_ENABLED=0 go build -ldflags="-s -w" -o /out/gachify-worker ./cmd/worker && \
    CGO_ENABLED=0 go build -ldflags="-s -w" -o /out/gachify-migrate ./cmd/migrate

FROM alpine:3.20 AS migrate
RUN apk add --no-cache ca-certificates
COPY --from=builder /out/gachify-migrate /usr/local/bin/gachify-migrate
COPY migrations /migrations
ENV GACHIFY_MIGRATIONS_PATH=/migrations
ENTRYPOINT ["gachify-migrate"]

FROM alpine:3.20 AS api
RUN apk add --no-cache ca-certificates wget
COPY --from=builder /out/gachify-api /usr/local/bin/gachify-api
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --retries=5 --start-period=20s \
  CMD wget -q -O - http://127.0.0.1:8080/health/ready >/dev/null || exit 1
ENTRYPOINT ["gachify-api"]

FROM alpine:3.20 AS worker
# ffprobe ships inside the ffmpeg package on Alpine
RUN apk add --no-cache ca-certificates ffmpeg
COPY --from=builder /out/gachify-worker /usr/local/bin/gachify-worker
ENTRYPOINT ["gachify-worker"]
