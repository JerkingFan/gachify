.PHONY: dev up down build run test tidy web web-install api seed check

# Windows: prefer .\scripts\dev.ps1
dev: up
	@echo "Run: go run ./cmd/api  (terminal 1)"
	@echo "Run: make web         (terminal 2)"
	@echo "Run: powershell ./scripts/seed.ps1"

check:
	powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/check-prereqs.ps1

seed:
	powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/seed.ps1

api:
	go run ./cmd/api

worker:
	go run ./cmd/worker

web-install:
	cd apps/web && npm install

web:
	cd apps/web && npm run dev

up:
	docker compose up -d --wait

down:
	docker compose down

build:
	go build -o bin/gachify-api ./cmd/api

build-web:
	cd apps/web && npm run build

run: build
	./bin/gachify-api

test:
	go test ./...

tidy:
	go mod tidy
