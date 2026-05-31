# syntax=docker/dockerfile:1

FROM golang:1.24-alpine AS builder
RUN apk add --no-cache git ca-certificates
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /out/gachify-api ./cmd/api && \
    CGO_ENABLED=0 go build -ldflags="-s -w" -o /out/gachify-worker ./cmd/worker

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
