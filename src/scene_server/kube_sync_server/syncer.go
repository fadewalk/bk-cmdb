package kube_sync_server

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/util/wait"
	kubeinformers "k8s.io/client-go/informers"
	coreinformers "k8s.io/client-go/informers/core/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/cache"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/util/workqueue"
)

type podMapping struct {
	ID  int64
	UID string
}

type Syncer struct {
	cfg            Config
	kube           kubernetes.Interface
	cmdb           *cmdbClient
	pods           coreinformers.PodInformer
	nodes          coreinformers.NodeInformer
	namespaces     coreinformers.NamespaceInformer
	queue          workqueue.RateLimitingInterface
	ready          atomic.Bool
	lastErr        atomic.Value
	retryExhausted atomic.Int64
	mu             sync.Mutex
	podMappings    map[string]podMapping
}

func NewSyncer(cfg Config, kube kubernetes.Interface) *Syncer {
	factory := kubeinformers.NewSharedInformerFactoryWithOptions(kube, cfg.SyncInterval)
	s := &Syncer{cfg: cfg, kube: kube, cmdb: newCMDBClient(cfg), pods: factory.Core().V1().Pods(), nodes: factory.Core().V1().Nodes(), namespaces: factory.Core().V1().Namespaces(), queue: workqueue.NewNamedRateLimitingQueue(workqueue.DefaultControllerRateLimiter(), "cmdb-kube-sync"), podMappings: map[string]podMapping{}}
	for _, informer := range []cache.SharedIndexInformer{s.pods.Informer(), s.nodes.Informer(), s.namespaces.Informer()} {
		informer.AddEventHandler(cache.ResourceEventHandlerFuncs{
			AddFunc:    func(obj interface{}) { s.enqueue(obj) },
			UpdateFunc: func(_, obj interface{}) { s.enqueue(obj) },
			DeleteFunc: func(obj interface{}) { s.enqueueDelete(obj) },
		})
	}
	return s
}

func (s *Syncer) enqueue(obj interface{}) {
	s.enqueueWithMode(obj, false)
}

func (s *Syncer) enqueueDelete(obj interface{}) {
	s.enqueueWithMode(obj, true)
}

func (s *Syncer) enqueueWithMode(obj interface{}, deleting bool) {
	var key string
	var err error
	switch value := obj.(type) {
	case cache.DeletedFinalStateUnknown:
		deleting = true
		key, err = tombstoneKey(value.Key, value.Obj)
		obj = value.Obj
	case *cache.DeletedFinalStateUnknown:
		deleting = true
		key, err = tombstoneKey(value.Key, value.Obj)
		obj = value.Obj
	default:
		key, err = cache.MetaNamespaceKeyFunc(obj)
	}
	if err != nil {
		return
	}
	var resourcePrefix string
	switch obj.(type) {
	case *corev1.Namespace:
		resourcePrefix = "namespace:"
	case *corev1.Node:
		resourcePrefix = "node:"
	case *corev1.Pod:
		resourcePrefix = "pod:"
	default:
		return
	}
	if deleting && resourcePrefix == "pod:" {
		pod, ok := obj.(*corev1.Pod)
		if !ok || pod.UID == "" {
			return
		}
		key += "@" + string(pod.UID)
	}
	if deleting {
		resourcePrefix = "delete:" + resourcePrefix
	}
	s.queue.Add(resourcePrefix + key)
}

func tombstoneKey(key string, obj interface{}) (string, error) {
	if key != "" {
		return key, nil
	}
	return cache.MetaNamespaceKeyFunc(obj)
}

func (s *Syncer) Run(ctx context.Context) error {
	go s.pods.Informer().Run(ctx.Done())
	go s.nodes.Informer().Run(ctx.Done())
	go s.namespaces.Informer().Run(ctx.Done())
	if !cache.WaitForCacheSync(ctx.Done(), s.pods.Informer().HasSynced, s.nodes.Informer().HasSynced, s.namespaces.Informer().HasSynced) {
		return fmt.Errorf("kubernetes informer cache did not sync")
	}
	s.ready.Store(true)
	for i := 0; i < s.cfg.WorkerCount; i++ {
		go wait.UntilWithContext(ctx, s.worker, time.Second)
	}
	<-ctx.Done()
	s.queue.ShutDown()
	return nil
}

func (s *Syncer) worker(ctx context.Context) {
	for s.processNext(ctx) {
	}
}

func (s *Syncer) processNext(ctx context.Context) bool {
	item, shutdown := s.queue.Get()
	if shutdown {
		return false
	}
	defer s.queue.Done(item)
	key, ok := item.(string)
	if !ok {
		s.queue.Forget(item)
		return true
	}
	if err := s.reconcile(ctx, key); err != nil {
		s.lastErr.Store(err.Error())
		if s.queue.NumRequeues(key) < 8 {
			s.queue.AddRateLimited(key)
		} else {
			s.retryExhausted.Add(1)
			s.queue.Forget(item)
		}
		return true
	}
	s.queue.Forget(item)
	return true
}

func parseQueueKey(rawKey string) (kind string, deleting bool, key string, err error) {
	prefixes := []struct {
		prefix string
		kind   string
		delete bool
	}{
		{"delete:namespace:", "namespace", true}, {"delete:node:", "node", true}, {"delete:pod:", "pod", true},
		{"namespace:", "namespace", false}, {"node:", "node", false}, {"pod:", "pod", false},
	}
	for _, item := range prefixes {
		if strings.HasPrefix(rawKey, item.prefix) {
			key = strings.TrimPrefix(rawKey, item.prefix)
			if key == "" {
				return "", false, "", fmt.Errorf("empty %s queue key", item.kind)
			}
			return item.kind, item.delete, key, nil
		}
	}
	return "", false, "", fmt.Errorf("unsupported queue key %q", rawKey)
}

func (s *Syncer) reconcile(ctx context.Context, rawKey string) error {
	kind, deleting, key, err := parseQueueKey(rawKey)
	if err != nil {
		return err
	}
	namespace, name, err := cache.SplitMetaNamespaceKey(key)
	if kind == "namespace" {
		name = key
	} else if err != nil {
		return err
	}
	deadline, cancel := contextWithTimeout(ctx, s.cfg.HTTPTimeout)
	defer cancel()
	if deleting {
		if kind == "pod" {
			return s.deletePodIfMapped(deadline, key)
		}
		return nil
	}
	clusterID, err := s.cmdb.cluster(deadline, s.cfg)
	if err != nil {
		return err
	}
	if kind == "namespace" {
		if obj, err := s.namespaces.Lister().Get(name); err == nil {
			return s.syncNamespace(deadline, clusterID, obj)
		}
		return nil
	}
	if kind == "node" {
		if obj, err := s.nodes.Lister().Get(name); err == nil {
			return s.syncNode(deadline, clusterID, obj)
		}
		return nil
	}
	if obj, err := s.pods.Lister().Pods(namespace).Get(name); err == nil {
		return s.syncPod(deadline, clusterID, obj)
	}
	return nil
}

func (s *Syncer) deletePodIfMapped(ctx context.Context, key string) error {
	baseKey, uid := key, ""
	if idx := strings.LastIndex(key, "@"); idx > 0 {
		baseKey, uid = key[:idx], key[idx+1:]
	}
	s.mu.Lock()
	mapping, ok := s.podMappings[baseKey]
	s.mu.Unlock()
	if !ok || uid == "" || mapping.UID != uid {
		return nil
	}
	if err := s.cmdb.deletePod(ctx, s.cfg, mapping.ID); err != nil {
		return err
	}
	s.mu.Lock()
	current, stillCurrent := s.podMappings[baseKey]
	if stillCurrent && current == mapping {
		delete(s.podMappings, baseKey)
	}
	s.mu.Unlock()
	return nil
}

func (s *Syncer) syncNamespace(ctx context.Context, clusterID int64, ns *corev1.Namespace) error {
	_, err := s.cmdb.namespace(ctx, s.cfg, clusterID, ns.Name, ns.Labels)
	return err
}

func (s *Syncer) syncNode(ctx context.Context, clusterID int64, node *corev1.Node) error {
	hostID, ok := s.cfg.HostMap[node.Name]
	if !ok {
		hostID = s.cfg.HostID
	}
	if hostID <= 0 {
		return fmt.Errorf("node %s unresolved: existing-only policy requires CMDB_KUBE_SYNC_HOST_MAP or CMDB_KUBE_SYNC_HOST_ID", node.Name)
	}
	internal := make([]string, 0, len(node.Status.Addresses))
	hostname := node.Name
	for _, address := range node.Status.Addresses {
		if address.Type == corev1.NodeInternalIP {
			internal = append(internal, address.Address)
		}
		if address.Type == corev1.NodeHostName {
			hostname = address.Address
		}
	}
	_, err := s.cmdb.node(ctx, s.cfg, clusterID, hostID, node.Name, hostname, internal, node.Labels)
	return err
}

func (s *Syncer) syncPod(ctx context.Context, clusterID int64, pod *corev1.Pod) error {
	hostID, ok := s.cfg.HostMap[pod.Spec.NodeName]
	if !ok {
		hostID = s.cfg.HostID
	}
	if hostID <= 0 {
		return fmt.Errorf("pod %s unresolved: existing-only policy requires CMDB_KUBE_SYNC_HOST_MAP or CMDB_KUBE_SYNC_HOST_ID", pod.Name)
	}
	if pod.Spec.NodeName == "" {
		return fmt.Errorf("pod %s is pending: nodeName is empty", pod.Name)
	}
	nsID, err := s.cmdb.namespace(ctx, s.cfg, clusterID, pod.Namespace, nil)
	if err != nil {
		return err
	}
	workloadID, err := s.cmdb.workload(ctx, s.cfg, clusterID, nsID, pod.Name, pod.Labels)
	if err != nil {
		return err
	}
	var nodeID int64
	if pod.Spec.NodeName != "" {
		if node, err := s.nodes.Lister().Get(pod.Spec.NodeName); err == nil {
			nodeObj := node
			ips := []string{}
			hostname := nodeObj.Name
			ready := false
			for _, condition := range nodeObj.Status.Conditions {
				if condition.Type == corev1.NodeReady && condition.Status == corev1.ConditionTrue {
					ready = true
				}
			}
			if !ready {
				return fmt.Errorf("node %s is not Ready", nodeObj.Name)
			}
			for _, address := range nodeObj.Status.Addresses {
				if address.Type == corev1.NodeInternalIP {
					ips = append(ips, address.Address)
				}
				if address.Type == corev1.NodeHostName {
					hostname = address.Address
				}
			}
			nodeID, err = s.cmdb.node(ctx, s.cfg, clusterID, hostID, nodeObj.Name, hostname, ips, nodeObj.Labels)
			if err != nil {
				return err
			}
		}
	}
	if nodeID == 0 {
		return fmt.Errorf("pod %s unresolved: node %s is not ready", pod.Name, pod.Spec.NodeName)
	}
	containers := make([]map[string]interface{}, 0, len(pod.Spec.Containers))
	for _, c := range pod.Spec.Containers {
		uid, uidErr := findContainerUID(pod.Status.ContainerStatuses, c.Name)
		if uidErr != nil {
			return uidErr
		}
		containers = append(containers, map[string]interface{}{"name": c.Name, "container_uid": string(uid), "image": c.Image, "args": c.Args})
	}
	podID, err := s.cmdb.pod(ctx, s.cfg, clusterID, nsID, nodeID, hostID, workloadID, pod.Name, pod.Spec.NodeName, string(pod.UID), pod.Status.PodIP, pod.Labels, containers)
	if err != nil {
		return err
	}
	s.mu.Lock()
	s.podMappings[pod.Namespace+"/"+pod.Name] = podMapping{ID: podID, UID: string(pod.UID)}
	s.mu.Unlock()
	return nil
}

func findContainerUID(statuses []corev1.ContainerStatus, name string) (typesUID, error) {
	for _, status := range statuses {
		if status.Name == name {
			if status.ContainerID == "" {
				return "", fmt.Errorf("container %s has no runtime ID yet", name)
			}
			return typesUID(status.ContainerID), nil
		}
	}
	return "", fmt.Errorf("container %s has no status yet", name)
}

type typesUID string

func (s *Syncer) QueueDepth() int { return s.queue.Len() }

func (s *Syncer) RetryExhausted() int64 { return s.retryExhausted.Load() }

func (s *Syncer) Ready() bool { return s.ready.Load() }
func (s *Syncer) LastError() string {
	if value := s.lastErr.Load(); value != nil {
		return value.(string)
	}
	return ""
}

func kubeConfig(path string) (*rest.Config, error) {
	if path != "" {
		return clientcmd.BuildConfigFromFlags("", path)
	}
	return rest.InClusterConfig()
}

func NewKubernetesClient(cfg Config) (kubernetes.Interface, error) {
	config, err := kubeConfig(cfg.Kubeconfig)
	if err != nil {
		return nil, err
	}
	return kubernetes.NewForConfig(config)
}

var _ runtime.Object = (*corev1.Pod)(nil)
var _ = metav1.NamespaceAll
var _ = http.MethodGet
