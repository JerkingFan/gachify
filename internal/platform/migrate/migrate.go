package migrate

import (
	"errors"
	"fmt"
	"net/url"
	"path/filepath"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
)

func New(databaseURL, migrationsDir string) (*migrate.Migrate, error) {
	abs, err := filepath.Abs(migrationsDir)
	if err != nil {
		return nil, fmt.Errorf("migrations path: %w", err)
	}
	source := (&url.URL{Scheme: "file", Path: filepath.ToSlash(abs)}).String()
	m, err := migrate.New(source, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("migrate init: %w", err)
	}
	return m, nil
}

func Up(databaseURL, migrationsDir string, steps int) error {
	m, err := New(databaseURL, migrationsDir)
	if err != nil {
		return err
	}
	defer m.Close()

	var runErr error
	if steps > 0 {
		runErr = m.Steps(steps)
	} else {
		runErr = m.Up()
	}
	if runErr != nil && !errors.Is(runErr, migrate.ErrNoChange) {
		return runErr
	}
	return nil
}

func Down(databaseURL, migrationsDir string, steps int) error {
	m, err := New(databaseURL, migrationsDir)
	if err != nil {
		return err
	}
	defer m.Close()

	if steps <= 0 {
		steps = 1
	}
	if err := m.Steps(-steps); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return err
	}
	return nil
}

func Version(databaseURL, migrationsDir string) (uint, bool, error) {
	m, err := New(databaseURL, migrationsDir)
	if err != nil {
		return 0, false, err
	}
	defer m.Close()
	return m.Version()
}

func Force(databaseURL, migrationsDir string, version int) error {
	m, err := New(databaseURL, migrationsDir)
	if err != nil {
		return err
	}
	defer m.Close()
	return m.Force(version)
}
