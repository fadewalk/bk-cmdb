package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os/signal"
	"syscall"

	syncer "configcenter/src/scene_server/kube_sync_server"
)

func main() {
	cfg, err := syncer.ConfigFromEnv()
	if err != nil {
		log.Fatalf("invalid kube sync configuration: %v", err)
	}
	kube, err := syncer.NewKubernetesClient(cfg)
	if err != nil {
		log.Fatalf("create Kubernetes client: %v", err)
	}
	s := syncer.NewSyncer(cfg, kube)
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	go func() {
		if err := s.Run(ctx); err != nil && ctx.Err() == nil {
			log.Printf("syncer stopped: %v", err)
		}
	}()
	h := http.NewServeMux()
	h.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok\n"))
	})
	h.HandleFunc("/readyz", func(w http.ResponseWriter, _ *http.Request) {
		if !s.Ready() {
			http.Error(w, "informer cache is not ready", http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ready\n"))
	})
	h.HandleFunc("/metrics", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"ready": s.Ready(), "last_error": s.LastError()})
	})
	server := &http.Server{Addr: cfg.ListenAddr, Handler: h}
	go func() { <-ctx.Done(); _ = server.Shutdown(context.Background()) }()
	log.Printf("kube sync server listening on %s", cfg.ListenAddr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}
