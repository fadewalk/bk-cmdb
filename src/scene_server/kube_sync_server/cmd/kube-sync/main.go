package main

import (
	"context"
	"log"
	"net/http"
	"os/signal"
	"strconv"
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
			w.Header().Set("Content-Type", "text/plain; version=0.0.4")
			ready := 0
			if s.Ready() { ready = 1 }
			_, _ = w.Write([]byte("# TYPE cmdb_kube_sync_ready gauge\ncmdb_kube_sync_ready " + strconv.Itoa(ready) + "\n# TYPE cmdb_kube_sync_queue_depth gauge\ncmdb_kube_sync_queue_depth " + strconv.Itoa(s.QueueDepth()) + "\n# TYPE cmdb_kube_sync_retry_exhausted counter\ncmdb_kube_sync_retry_exhausted " + strconv.FormatInt(s.RetryExhausted(), 10) + "\n"))
		})
	server := &http.Server{Addr: cfg.ListenAddr, Handler: h}
	go func() { <-ctx.Done(); _ = server.Shutdown(context.Background()) }()
	log.Printf("kube sync server listening on %s", cfg.ListenAddr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}
