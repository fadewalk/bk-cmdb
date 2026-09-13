package kube_sync_server

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config controls the single-cluster Kubernetes to CMDB synchronizer.
// HostPolicy is intentionally existing-only by default: a node is never
// silently turned into a new CMDB host.
type Config struct {
	Kubeconfig   string
	CMDBBaseURL  string
	CMDBAPIKey   string
	CMDBUser     string
	CMDBSupplier string
	CMDBAppCode  string
	BizID        int64
	ClusterName  string
	ClusterUID   string
	ListenAddr   string
	HostPolicy   string
	HostID       int64
	HostMap      map[string]int64
	SyncInterval time.Duration
	WorkerCount  int
	HTTPTimeout  time.Duration
}

func ConfigFromEnv() (Config, error) {
	bizID, err := strconv.ParseInt(envOr("CMDB_KUBE_SYNC_BIZ_ID", "0"), 10, 64)
	if err != nil || bizID <= 0 {
		return Config{}, errors.New("CMDB_KUBE_SYNC_BIZ_ID must be a positive integer")
	}
	apiKey, err := secretFromEnv("CMDB_KUBE_SYNC_API_KEY", "CMDB_KUBE_SYNC_API_KEY_FILE")
	if err != nil {
		return Config{}, err
	}
	workerValue := os.Getenv("CMDB_KUBE_SYNC_WORKERS")
	if workerValue != "" {
		workers, parseErr := strconv.Atoi(workerValue)
		if parseErr != nil || workers <= 0 {
			return Config{}, errors.New("CMDB_KUBE_SYNC_WORKERS must be positive")
		}
	}
	c := Config{
		Kubeconfig:   os.Getenv("CMDB_KUBE_SYNC_KUBECONFIG"),
		CMDBBaseURL:  envOr("CMDB_KUBE_SYNC_CMDB_URL", "http://127.0.0.1:8090"),
		CMDBAPIKey:   apiKey,
		CMDBUser:     envOr("CMDB_KUBE_SYNC_USER", "kube-sync"),
		CMDBSupplier: envOr("CMDB_KUBE_SYNC_SUPPLIER", "0"),
		CMDBAppCode:  envOr("CMDB_KUBE_SYNC_APP_CODE", "bk_cmdb_kube_sync"),
		BizID:        bizID,
		ClusterName:  envOr("CMDB_KUBE_SYNC_CLUSTER_NAME", "colima-k3s"),
		ClusterUID:   envOr("CMDB_KUBE_SYNC_CLUSTER_UID", "colima-k3s"),
		ListenAddr:   envOr("CMDB_KUBE_SYNC_LISTEN", "127.0.0.1:60014"),
		HostPolicy:   envOr("CMDB_KUBE_SYNC_HOST_POLICY", "existing-only"),
		HostID:       intOr64("CMDB_KUBE_SYNC_HOST_ID", 0),
		HostMap:      nil,
		SyncInterval: durationOr("CMDB_KUBE_SYNC_INTERVAL", 30*time.Second),
		WorkerCount:  intOr("CMDB_KUBE_SYNC_WORKERS", 1),
		HTTPTimeout:  durationOr("CMDB_KUBE_SYNC_HTTP_TIMEOUT", 10*time.Second),
	}
	var mapErr error
	c.HostMap, mapErr = hostMapFromEnv()
	if mapErr != nil {
		return Config{}, mapErr
	}
	if c.HostPolicy != "existing-only" {
		return Config{}, errors.New("only existing-only host policy is enabled in the first release")
	}
	if c.CMDBAPIKey == "" {
		return Config{}, errors.New("CMDB_KUBE_SYNC_API_KEY is required")
	}
	if c.WorkerCount <= 0 {
		return Config{}, errors.New("CMDB_KUBE_SYNC_WORKERS must be positive")
	}
	if c.HostID <= 0 && len(c.HostMap) == 0 {
		return Config{}, errors.New("CMDB_KUBE_SYNC_HOST_MAP or CMDB_KUBE_SYNC_HOST_ID is required")
	}
	return c, nil
}

func secretFromEnv(valueKey, fileKey string) (string, error) {
	value, file := os.Getenv(valueKey), os.Getenv(fileKey)
	if value != "" && file != "" {
		return "", fmt.Errorf("set only one of %s or %s", valueKey, fileKey)
	}
	if file != "" {
		data, err := os.ReadFile(file)
		if err != nil {
			return "", fmt.Errorf("read %s: %w", fileKey, err)
		}
		value = strings.TrimSpace(string(data))
	}
	if value == "" {
		return "", fmt.Errorf("%s or %s is required", valueKey, fileKey)
	}
	return value, nil
}

func hostMapFromEnv() (map[string]int64, error) {
	value := os.Getenv("CMDB_KUBE_SYNC_HOST_MAP")
	if value == "" {
		return map[string]int64{}, nil
	}
	var raw map[string]int64
	if err := json.Unmarshal([]byte(value), &raw); err != nil {
		return nil, fmt.Errorf("CMDB_KUBE_SYNC_HOST_MAP must be valid JSON: %w", err)
	}
	for node, hostID := range raw {
		if node == "" || hostID <= 0 {
			return nil, fmt.Errorf("invalid host mapping for node %q", node)
		}
	}
	return raw, nil
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func durationOr(key string, fallback time.Duration) time.Duration {
	if value := os.Getenv(key); value != "" {
		if parsed, err := time.ParseDuration(value); err == nil && parsed > 0 {
			return parsed
		}
	}
	return fallback
}

func intOr64(key string, fallback int64) int64 {
	if value := os.Getenv(key); value != "" {
		if parsed, err := strconv.ParseInt(value, 10, 64); err == nil && parsed > 0 {
			return parsed
		}
	}
	return fallback
}

func intOr(key string, fallback int) int {
	if value := os.Getenv(key); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil && parsed > 0 {
			return parsed
		}
	}
	return fallback
}
