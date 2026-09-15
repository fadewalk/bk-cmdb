package kube_sync_server

import (
	"context"
	"errors"
	"net/http"
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/tools/cache"
	"k8s.io/client-go/util/workqueue"
)

// immediateRateLimiter makes retry-gate tests deterministic without sleeping.
type immediateRateLimiter struct {
	requeues map[interface{}]int
}

func (r *immediateRateLimiter) When(item interface{}) time.Duration {
	r.requeues[item]++
	return 0
}

func (r *immediateRateLimiter) Forget(item interface{}) {
	delete(r.requeues, item)
}

func (r *immediateRateLimiter) NumRequeues(item interface{}) int {
	return r.requeues[item]
}

func TestLifecycleGateTombstoneFallbackAndPodUIDGuard(t *testing.T) {
	pod := &corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "api", Namespace: "prod", UID: "pod-uid"}}
	key, err := tombstoneKey("", pod)
	if err != nil {
		t.Fatalf("tombstoneKey returned error: %v", err)
	}
	if key != "prod/api" {
		t.Fatalf("tombstoneKey=%q, want prod/api", key)
	}

	s := NewSyncer(Config{SyncInterval: 0, WorkerCount: 1}, fakeKube())
	s.enqueue(cache.DeletedFinalStateUnknown{
		Key: "prod/api",
		Obj: &corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "api", Namespace: "prod"}},
	})
	if got := s.QueueDepth(); got != 0 {
		t.Fatalf("pod tombstone without UID entered queue, depth=%d", got)
	}

	s.enqueue(cache.DeletedFinalStateUnknown{Key: "", Obj: pod})
	item, shutdown := s.queue.Get()
	if shutdown {
		t.Fatal("queue unexpectedly shut down")
	}
	s.queue.Done(item)
	if got, want := item.(string), "delete:pod:prod/api@pod-uid"; got != want {
		t.Fatalf("tombstone queue key=%q, want %q", got, want)
	}
}

func TestLifecycleGateDeletionGuardRequiresMatchingPodUID(t *testing.T) {
	s := &Syncer{
		cfg:  Config{BizID: 2},
		cmdb: &cmdbClient{baseURL: "http://127.0.0.1:1", http: http.DefaultClient},
		podMappings: map[string]podMapping{
			"prod/api": {ID: 55, UID: "old-uid"},
		},
	}

	if err := s.deletePodIfMapped(context.Background(), "prod/api@new-uid"); err != nil {
		t.Fatalf("stale UID deletion was not ignored: %v", err)
	}
	if err := s.deletePodIfMapped(context.Background(), "prod/missing@missing-uid"); err != nil {
		t.Fatalf("unmapped deletion was not ignored: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	err := s.deletePodIfMapped(ctx, "prod/api@old-uid")
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("matching UID did not enter CMDB delete path, err=%v", err)
	}
}

func TestLifecycleGateRetryExhaustionAfterEightRequeues(t *testing.T) {
	s := &Syncer{
		queue: workqueue.NewRateLimitingQueue(&immediateRateLimiter{requeues: map[interface{}]int{}}),
	}
	const key = "unsupported:lifecycle"
	s.queue.Add(key)

	for attempt := 0; attempt < 9; attempt++ {
		if !s.processNext(context.Background()) {
			t.Fatalf("processNext stopped on attempt %d", attempt+1)
		}
	}

	if got, want := s.RetryExhausted(), int64(1); got != want {
		t.Fatalf("RetryExhausted=%d, want %d", got, want)
	}
	if got := s.QueueDepth(); got != 0 {
		t.Fatalf("queue depth=%d after retry exhaustion, want 0", got)
	}
	if got, want := s.LastError(), `unsupported queue key "unsupported:lifecycle"`; got != want {
		t.Fatalf("LastError=%q, want %q", got, want)
	}
}
