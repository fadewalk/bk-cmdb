# P48 K8s sync evidence — 2026-09-13

## Real integration result

Environment:

- Colima `xwssd`, K3s `v1.35.0+k3s1`, node `colima-xwssd` Ready;
- standalone CMDB `web=200`, `healthz=200`;
- isolated CMDB test Host `bk_host_id=75`, IP `192.0.2.42`, initially in resource pool then assigned to business 2 idle module;
- real K3s Pod `cmdb-kube-sync-real-probe`, image `busybox:1.37`, Running on `colima-xwssd`.

The new `cmdb_kube_syncserver` was started with:

```text
CMDB_KUBE_SYNC_BIZ_ID=2
CMDB_KUBE_SYNC_CLUSTER_UID=colima-k3s-p48
CMDB_KUBE_SYNC_HOST_MAP={"colima-xwssd":75}
CMDB_KUBE_SYNC_HOST_POLICY=existing-only
```

Successful CMDB read-back:

```text
Cluster:   id=2, uid=colima-k3s-p48, requested business=2
Namespace: id=3, name=default
Workload:  id=5, name=cmdb-kube-sync-real-probe
Node:      id=407, name=colima-xwssd, bk_host_id=75, bk_cluster_id=2
Pod:       id=5, name=cmdb-kube-sync-real-probe, bk_host_id=75, bk_node_id=407
Container: id=5, bk_pod_id=5, image=busybox:1.37
```

The ui-v3 real core smoke and B31 host management regression also passed while
this environment was running. This proves the real K3s → informer/workqueue →
CMDB API → ui-v3 read path for the isolated fixture.

## Important findings

1. The first implementation reused a Cluster UID without filtering by business,
   and an old test run exposed a Cluster with `bk_biz_id=0`. The synchronizer now
   queries by `bk_biz_id + uid` and fails closed if a returned Cluster belongs to
   a different business. Existing inconsistent data must be repaired through a
   reviewed CMDB migration/cleanup, not direct Mongo deletion.
2. CMDB Node creation correctly rejected a Host that was only in the resource
   pool. After moving Host 75 through the real `/hosts/modules/resource/idle`
   endpoint, Node creation succeeded. This confirms the required Host→business
   relation and prevents accidental cross-business binding.
3. The first delete attempts used guessed payloads and were rejected. The correct
   Pod delete contract is `data:[{bk_biz_id,ids}]`; other K8s delete contracts are
   resource-specific. P49 now sends Pod deletes only for tombstones with a known
   Kubernetes UID and a matching in-memory CMDB mapping. Namespace/Node/Workload/
   Cluster deletion remains guarded by CMDB association checks and is not forced.
   Residual P48/old test records require manual audited cleanup before a clean
   production database claim.
4. P49 rejects malformed host maps, zero workers and missing Host mappings at
   startup; refuses fake container IDs; requires scheduled Pods, Ready Nodes and
   runtime container IDs; and emits Prometheus-format readiness, queue depth and
   retry-exhausted metrics. Namespace/Node/Workload/Pod update convergence is not
   yet complete: existing records are still create-or-find for most fields and
   must not be called production-ready.

## Delivered implementation

- `src/scene_server/kube_sync_server/`
  - env configuration with mandatory CMDB API key;
  - existing-only Host policy and explicit node→Host map;
  - client-go kubeconfig/in-cluster client;
  - Namespace/Node/Pod informers and rate-limited queue;
  - CMDB API envelope client and dependency-order reconciliation;
  - `/healthz`, `/readyz`, `/metrics`;
  - fake-client queue/Host-policy tests and CMDB httptest contract.
- `deploy/kube-sync/`
  - non-root/read-only/cap-drop Dockerfile;
  - read-only Kubernetes RBAC for namespaces/nodes/pods;
  - development Compose file and operational README.

Validation:

```text
GOFLAGS=-mod=mod go test ./src/scene_server/kube_sync_server: passed
GOFLAGS=-mod=mod go build ./src/scene_server/kube_sync_server/cmd/kube-sync: passed
real K3s → CMDB Cluster/Namespace/Workload/Node/Pod/Container: passed
```

## Production boundary

This does not yet prove full production management of physical and cloud VMs:

- cloud VMs still require real cloud credentials, cloudserver/cloudsync and
  provider API validation;
- physical machines still require Agent/asset inventory/collector or reviewed
  import source;
- OIDC/IAM, secret manager, TLS verification, HA/restart recovery, SBOM/signing,
  PITR and clean-environment release gates remain blocking.
