package kube_sync_server

import (
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/tools/cache"
)

func fakeKube() kubernetes.Interface { return fake.NewSimpleClientset() }

func TestQueueKeysKeepResourceIdentity(t *testing.T) {
	cfg := Config{SyncInterval: 0, WorkerCount: 1}
	s := NewSyncer(cfg, fakeKube())
	s.enqueue(&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "same"}})
	s.enqueue(&corev1.Node{ObjectMeta: metav1.ObjectMeta{Name: "same"}})
	s.enqueue(&corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "same", Namespace: "ns"}})
	got := map[string]bool{}
	for i := 0; i < 3; i++ {
		item, shutdown := s.queue.Get()
		if shutdown {
			t.Fatal("queue unexpectedly shut down")
		}
		got[item.(string)] = true
		s.queue.Done(item)
	}
	for _, key := range []string{"namespace:same", "node:same", "pod:ns/same"} {
		if !got[key] {
			t.Fatalf("missing queue key %q: %#v", key, got)
		}
	}
}

func TestQueueKeysHandleTombstoneByResourceType(t *testing.T) {
	cfg := Config{SyncInterval: 0, WorkerCount: 1}
	s := NewSyncer(cfg, fakeKube())
	s.enqueue(cache.DeletedFinalStateUnknown{Key: "same", Obj: &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "same", UID: "ns-uid"}}})
	s.enqueue(&cache.DeletedFinalStateUnknown{Key: "same", Obj: &corev1.Node{ObjectMeta: metav1.ObjectMeta{Name: "same", UID: "node-uid"}}})
	s.enqueue(cache.DeletedFinalStateUnknown{Key: "ns/same", Obj: &corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "same", Namespace: "ns", UID: "pod-uid"}}})
	got := map[string]bool{}
	for i := 0; i < 3; i++ {
		item, shutdown := s.queue.Get()
		if shutdown {
			t.Fatal("queue unexpectedly shut down")
		}
		got[item.(string)] = true
		s.queue.Done(item)
	}
	for _, key := range []string{"delete:namespace:same", "delete:node:same", "delete:pod:ns/same@pod-uid"} {
		if !got[key] {
			t.Fatalf("missing tombstone key %q: %#v", key, got)
		}
	}
}

func TestContainerUIDRequiresRuntimeID(t *testing.T) {
	if _, err := findContainerUID([]corev1.ContainerStatus{{Name: "app"}}, "app"); err == nil {
		t.Fatal("expected missing runtime ID to fail")
	}
	uid, err := findContainerUID([]corev1.ContainerStatus{{Name: "app", ContainerID: "docker://abc"}}, "app")
	if err != nil || uid != "docker://abc" {
		t.Fatalf("uid=%q err=%v", uid, err)
	}
}

func TestConfigRejectsMalformedHostMap(t *testing.T) {
	t.Setenv("CMDB_KUBE_SYNC_BIZ_ID", "2")
	t.Setenv("CMDB_KUBE_SYNC_API_KEY", "key")
	t.Setenv("CMDB_KUBE_SYNC_HOST_MAP", "not-json")
	if _, err := ConfigFromEnv(); err == nil {
		t.Fatal("expected malformed host map to fail")
	}
}

func TestConfigRejectsZeroWorkers(t *testing.T) {
	t.Setenv("CMDB_KUBE_SYNC_BIZ_ID", "2")
	t.Setenv("CMDB_KUBE_SYNC_API_KEY", "key")
	t.Setenv("CMDB_KUBE_SYNC_HOST_ID", "75")
	t.Setenv("CMDB_KUBE_SYNC_WORKERS", "0")
	if _, err := ConfigFromEnv(); err == nil {
		t.Fatal("expected zero workers to fail")
	}
}

func TestExistingOnlyHostPolicyRejectsUnmappedNode(t *testing.T) {
	cfg := Config{HostPolicy: "existing-only", SyncInterval: 0, WorkerCount: 1}
	s := NewSyncer(cfg, fakeKube())
	err := s.syncNode(t.Context(), 1, &corev1.Node{ObjectMeta: metav1.ObjectMeta{Name: "node-a"}})
	if err == nil {
		t.Fatal("expected unmapped node to fail closed")
	}
}
