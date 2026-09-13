# kube-sync development service

This service is the first Kubernetes-to-CMDB adapter for standalone development.
It is deliberately **existing-only** for host resolution: it never creates a CMDB
host implicitly. Configure a JSON map from Kubernetes node name to an existing
CMDB host ID:

```bash
export CMDB_KUBE_SYNC_BIZ_ID=2
export CMDB_KUBE_SYNC_API_KEY='...'
export CMDB_KUBE_SYNC_HOST_MAP='{"colima-xwssd":1234}'
export CMDB_KUBE_SYNC_KUBECONFIG="$HOME/.kube/config"
```

The synchronizer watches Namespaces, Nodes and Pods with client-go informers and
writes the following dependency chain through `/api/v3`:

```text
Cluster → Namespace → Pod workload → Node (existing CMDB host) → Pod + Container
```

`CMDB_KUBE_SYNC_HOST_ID` is supported only for a single-node test fixture;
production or multi-node deployments must use `CMDB_KUBE_SYNC_HOST_MAP`.

## Local binary

```bash
GOFLAGS=-mod=mod go build -o /tmp/cmdb_kube_syncserver ./src/scene_server/kube_sync_server/cmd/kube-sync
CMDB_KUBE_SYNC_BIZ_ID=2 \
CMDB_KUBE_SYNC_API_KEY="$CMDB_API_KEY" \
CMDB_KUBE_SYNC_HOST_MAP='{"colima-xwssd":1234}' \
CMDB_KUBE_SYNC_KUBECONFIG="$HOME/.kube/config" \
/tmp/cmdb_kube_syncserver
```

Endpoints:

- `/healthz`: process is alive
- `/readyz`: informer caches have synchronized
- `/metrics`: compact readiness and last error JSON (replace with Prometheus metrics before production)

## Kubernetes deployment

Apply `rbac.yaml` and deploy the binary with a Secret-mounted kubeconfig and
CMDB API key. The RBAC is read-only for namespaces, nodes and pods. Add only
the minimum additional workload verbs when workload synchronization is enabled.

This component does not make physical-machine or cloud-VM inventory complete:
those require an Agent/asset source and cloud credentials respectively.
