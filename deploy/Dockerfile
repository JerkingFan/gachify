# syntax=docker/dockerfile:1

FROM golang:1.25-alpine AS builder
RUN apk add --no-cache git ca-certificates
WORKDIR /src

# vendor/ is committed — no go mod download on slow VPS networks
ENV GOFLAGS=-mod=vendor

COPY go.mod go.sum ./
COPY vendor/ vendor/
COPY . .
RUN --mount=type=cache,target=/root/.cache/go-build \
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
# ffmpeg + Python MIR analyzer (venv — Alpine blocks system-wide pip per PEP 668)
RUN apk add --no-cache \
    ca-certificates ffmpeg \
    python3 python3-dev py3-pip \
    gcc g++ musl-dev gfortran openblas-dev libsndfile-dev
COPY gachi_analyzer /opt/gachify-analyzer/gachi_analyzer
COPY gachi_analyzer/run_analyze.py /opt/gachify-analyzer/run_analyze.py
COPY gachi_analyzer/requirements-worker.txt /opt/gachify-analyzer/requirements-worker.txt
RUN python3 -m venv /opt/gachify-analyzer/venv \
    && /opt/gachify-analyzer/venv/bin/pip install --upgrade pip \
    && /opt/gachify-analyzer/venv/bin/pip install --no-cache-dir \
      -r /opt/gachify-analyzer/requirements-worker.txt \
    && chmod +x /opt/gachify-analyzer/run_analyze.py
ENV PYTHONPATH=/opt/gachify-analyzer \
    GACHIFY_ANALYZER_ROOT=/opt/gachify-analyzer \
    GACHIFY_ANALYZER_PYTHON=/opt/gachify-analyzer/venv/bin/python3 \
    GACHIFY_ANALYZER_ENABLED=true
COPY --from=builder /out/gachify-worker /usr/local/bin/gachify-worker
ENTRYPOINT ["gachify-worker"]
