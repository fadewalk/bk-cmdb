package kube_sync_server

import (
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/fake"
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

func TestExistingOnlyHostPolicyRejectsUnmappedNode(t *testing.T) {
	cfg := Config{HostPolicy: "existing-only", SyncInterval: 0, WorkerCount: 1}
	s := NewSyncer(cfg, fakeKube())
	err := s.syncNode(t.Context(), 1, &corev1.Node{ObjectMeta: metav1.ObjectMeta{Name: "node-a"}})
	if err == nil {
		t.Fatal("expected unmapped node to fail closed")
	}
}
