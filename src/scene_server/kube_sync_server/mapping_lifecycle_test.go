package kube_sync_server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func TestParseQueueKey(t *testing.T) {
	cases := []struct {
		name, raw, kind, key string
		deleting, wantErr    bool
	}{
		{"delete namespace", "delete:namespace:prod", "namespace", "prod", true, false},
		{"delete node", "delete:node:worker", "node", "worker", true, false},
		{"delete pod", "delete:pod:prod/api@old", "pod", "prod/api@old", true, false},
		{"normal namespace", "namespace:prod", "namespace", "prod", false, false},
		{"normal pod", "pod:prod/api", "pod", "prod/api", false, false},
		{"empty", "delete:pod:", "", "", false, true},
		{"unknown", "bogus:key", "", "", false, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			kind, deleting, key, err := parseQueueKey(tc.raw)
			if (err != nil) != tc.wantErr {
				t.Fatalf("err=%v wantErr=%v", err, tc.wantErr)
			}
			if kind != tc.kind || deleting != tc.deleting || key != tc.key {
				t.Fatalf("got %q %v %q", kind, deleting, key)
			}
		})
	}
}

func TestDeletePodMappingLifecycle(t *testing.T) {
	var deletes atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			t.Fatalf("method=%s", r.Method)
		}
		deletes.Add(1)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"result":true,"bk_error_code":0,"data":null}`))
	}))
	defer srv.Close()
	s := &Syncer{cfg: Config{BizID: 2}, cmdb: &cmdbClient{baseURL: srv.URL, http: srv.Client()}, podMappings: map[string]podMapping{"prod/api": {ID: 55, UID: "old"}}}
	if err := s.deletePodIfMapped(context.Background(), "prod/api@old"); err != nil {
		t.Fatal(err)
	}
	if deletes.Load() != 1 {
		t.Fatalf("deletes=%d", deletes.Load())
	}
	if _, ok := s.podMappings["prod/api"]; ok {
		t.Fatal("mapping remained after successful delete")
	}
	if err := s.deletePodIfMapped(context.Background(), "prod/api@old"); err != nil {
		t.Fatal(err)
	}
	if deletes.Load() != 1 {
		t.Fatalf("second delete unexpectedly sent: %d", deletes.Load())
	}
}

func TestDeletePodMappingKeepsReplacement(t *testing.T) {
	var deletes atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		deletes.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"result":true,"bk_error_code":0,"data":null}`))
	}))
	defer srv.Close()
	s := &Syncer{cfg: Config{BizID: 2}, cmdb: &cmdbClient{baseURL: srv.URL, http: srv.Client()}, podMappings: map[string]podMapping{"prod/api": {ID: 66, UID: "new"}}}
	if err := s.deletePodIfMapped(context.Background(), "prod/api@old"); err != nil {
		t.Fatal(err)
	}
	if deletes.Load() != 0 {
		t.Fatalf("stale delete sent: %d", deletes.Load())
	}
	if got := s.podMappings["prod/api"]; got != (podMapping{ID: 66, UID: "new"}) {
		t.Fatalf("replacement mapping changed: %#v", got)
	}
}

func TestNormalDeleteEnqueuesPodDeleteKey(t *testing.T) {
	s := NewSyncer(Config{SyncInterval: 0, WorkerCount: 1}, fake.NewSimpleClientset())
	s.enqueueDelete(&corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "api", Namespace: "prod", UID: "pod-uid"}})
	item, shutdown := s.queue.Get()
	if shutdown {
		t.Fatal("queue shutdown")
	}
	s.queue.Done(item)
	if got := item.(string); got != "delete:pod:prod/api@pod-uid" {
		t.Fatalf("key=%q", got)
	}
}
