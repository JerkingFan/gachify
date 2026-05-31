package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/gachify/gachify/internal/config"
	migratepkg "github.com/gachify/gachify/internal/platform/migrate"
)

func main() {
	cmd := flag.String("cmd", envOr("GACHIFY_MIGRATE_CMD", "up"), "up | down | version | force")
	steps := flag.Int("steps", 0, "number of migrations for up/down (0 = all pending for up)")
	version := flag.Int("version", -1, "target version for force")
	migrationsPath := flag.String("path", "", "migrations directory")
	flag.Parse()

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	dir := *migrationsPath
	if dir == "" {
		dir = os.Getenv("GACHIFY_MIGRATIONS_PATH")
	}
	if dir == "" {
		dir = findMigrationsDir()
	}

	switch *cmd {
	case "up":
		if err := migratepkg.Up(cfg.DatabaseURL, dir, *steps); err != nil {
			log.Fatalf("migrate up: %v", err)
		}
		log.Println("migrate: up OK")
	case "down":
		if err := migratepkg.Down(cfg.DatabaseURL, dir, *steps); err != nil {
			log.Fatalf("migrate down: %v", err)
		}
		log.Println("migrate: down OK")
	case "version":
		v, dirty, err := migratepkg.Version(cfg.DatabaseURL, dir)
		if err != nil {
			log.Fatalf("migrate version: %v", err)
		}
		fmt.Printf("version=%d dirty=%v\n", v, dirty)
	case "force":
		if *version < 0 {
			log.Fatal("force requires -version N")
		}
		if err := migratepkg.Force(cfg.DatabaseURL, dir, *version); err != nil {
			log.Fatalf("migrate force: %v", err)
		}
		log.Printf("migrate: forced version %d", *version)
	default:
		log.Fatalf("unknown cmd %q", *cmd)
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func findMigrationsDir() string {
	if wd, err := os.Getwd(); err == nil {
		candidate := filepath.Join(wd, "migrations")
		if info, err := os.Stat(candidate); err == nil && info.IsDir() {
			return candidate
		}
	}
	return "migrations"
}
