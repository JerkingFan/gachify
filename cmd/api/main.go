package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/gachify/gachify/internal/app"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	application, err := app.New(ctx)
	if err != nil {
		log.Fatalf("bootstrap: %v", err)
	}

	if err := application.Run(ctx); err != nil {
		log.Fatalf("run: %v", err)
	}
}
