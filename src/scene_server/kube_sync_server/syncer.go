package kube_sync_server

import (
	"context"
	"fmt"
	"net/http"
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

type Syncer struct {
	cfg        Config
	kube       kubernetes.Interface
	cmdb       *cmdbClient
	pods       coreinformers.PodInformer
	nodes      coreinformers.NodeInformer
	namespaces coreinformers.NamespaceInformer
	queue      workqueue.RateLimitingInterface
	ready      atomic.Bool
	lastErr    atomic.Value
	once       sync.Once
}

func NewSyncer(cfg Config, kube kubernetes.Interface) *Syncer {
	factory := kubeinformers.NewSharedInformerFactoryWithOptions(kube, cfg.SyncInterval)
	s := &Syncer{cfg: cfg, kube: kube, cmdb: newCMDBClient(cfg), pods: factory.Core().V1().Pods(), nodes: factory.Core().V1().Nodes(), namespaces: factory.Core().V1().Namespaces(), queue: workqueue.NewNamedRateLimitingQueue(workqueue.DefaultControllerRateLimiter(), "cmdb-kube-sync")}
	for _, informer := range []cache.SharedIndexInformer{s.pods.Informer(), s.nodes.Informer(), s.namespaces.Informer()} {
		informer.AddEventHandler(cache.ResourceEventHandlerFuncs{
			AddFunc:    func(obj interface{}) { s.enqueue(obj) },
			UpdateFunc: func(_, obj interface{}) { s.enqueue(obj) },
			DeleteFunc: func(obj interface{}) { s.enqueue(obj) },
		})
	}
	return s
}

func (s *Syncer) enqueue(obj interface{}) {
	key, err := cache.MetaNamespaceKeyFunc(obj)
	if err != nil {
		return
	}
	prefix := ""
	switch obj.(type) {
	case *corev1.Namespace:
		prefix = "namespace:"
	case *corev1.Node:
		prefix = "node:"
	case *corev1.Pod, cache.DeletedFinalStateUnknown:
		prefix = "pod:"
	default:
		return
	}
	s.queue.Add(prefix + key)
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
			s.queue.Forget(item)
		}
		return true
	}
	s.queue.Forget(item)
	return true
}

func (s *Syncer) reconcile(ctx context.Context, key string) error {
	kind := ""
	switch {
	case len(key) > 9 && key[:10] == "namespace:":
		kind, key = "namespace", key[10:]
	case len(key) > 5 && key[:5] == "node:":
		kind, key = "node", key[5:]
	case len(key) > 4 && key[:4] == "pod:":
		kind, key = "pod", key[4:]
	default:
		return fmt.Errorf("unsupported queue key %q", key)
	}
	namespace, name, err := cache.SplitMetaNamespaceKey(key)
	if kind == "namespace" {
		name = key
	} else if err != nil {
		return err
	}
	deadline, cancel := contextWithTimeout(ctx, s.cfg.HTTPTimeout)
	defer cancel()
	clusterID, err := s.cmdb.cluster(deadline, s.cfg)
	if err != nil {
		return err
	}
	if kind == "namespace" {
		if namespace, err := s.namespaces.Lister().Get(name); err == nil {
			return s.syncNamespace(deadline, clusterID, namespace)
		}
		return nil
	}
	if kind == "node" {
		if node, err := s.nodes.Lister().Get(name); err == nil {
			return s.syncNode(deadline, clusterID, node)
		}
		return nil
	}
	if pod, err := s.pods.Lister().Pods(namespace).Get(name); err == nil {
		return s.syncPod(deadline, clusterID, pod)
	}
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
			for _, address := range nodeObj.Status.Addresses {
				if address.Type == corev1.NodeInternalIP {
					ips = append(ips, address.Address)
				}
			}
			nodeID, err = s.cmdb.node(ctx, s.cfg, clusterID, hostID, nodeObj.Name, nodeObj.Name, ips, nodeObj.Labels)
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
		containers = append(containers, map[string]interface{}{"name": c.Name, "container_uid": string(findContainerUID(pod.Status.ContainerStatuses, c.Name)), "image": c.Image, "args": c.Args})
	}
	return s.cmdb.pod(ctx, s.cfg, clusterID, nsID, nodeID, hostID, workloadID, pod.Name, pod.Spec.NodeName, pod.Status.PodIP, pod.Labels, containers)
}

func findContainerUID(statuses []corev1.ContainerStatus, name string) typesUID {
	for _, status := range statuses {
		if status.Name == name {
			return typesUID(status.ContainerID)
		}
	}
	return typesUID("kube-sync-" + name)
}

type typesUID string

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
