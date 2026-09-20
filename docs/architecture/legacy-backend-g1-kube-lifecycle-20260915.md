# D.2 K8s lifecycle offline gate — 2026-09-15

## Scope

This gate covers only the currently safe-to-run `kube_sync_server` Go package tests and the `kube-sync` command build contract. It does not start K3s, write CMDB data, write Mongo data, or change existing business code.

Only these files are added by D.2:

- `src/scene_server/kube_sync_server/lifecycle_gate_test.go`
- `src/scene_server/kube_sync_server/mapping_lifecycle_test.go`
- `docs/architecture/legacy-backend-g1-kube-lifecycle-20260915.md`

Existing user modifications, local rules, screenshots, and unrelated files were not changed or staged.

## Offline assertions

The new pure tests exercise the current on-disk APIs without a Kubernetes cluster or CMDB/Mongo fixture:

| Area | Assertion |
| --- | --- |
| Tombstone fallback | An empty tombstone key falls back to `cache.MetaNamespaceKeyFunc`; a Pod tombstone without a UID is not queued. |
| UID identity | A Pod deletion queue key is `delete:pod:<namespace>/<name>@<uid>`, preserving replacement-Pod identity. |
| Deletion guard | Missing mappings and stale UIDs are ignored; a matching UID reaches the existing CMDB delete path. |
| Retry gate | An unsupported queue key is retried eight times, then increments `RetryExhausted`, records `LastError`, and leaves the queue empty. |
| Queue parsing | Normal and delete queue prefixes are parsed by named prefixes; delete namespace/node/pod keys no longer rely on incorrect hard-coded slice lengths. |
| Delete event mode | A normal informer `DeleteFunc` explicitly enqueues a delete key; Pod tombstones retain the UID suffix and missing UIDs remain fail-closed. |
| Mapping lifecycle | Matching UID deletes the CMDB Pod once and removes the base `<namespace>/<name>` mapping; stale replacement UID/missing mapping do not delete; CMDB delete failure retains mapping for retry. |

Existing package tests also remain in scope for resource-specific queue keys, value/pointer tombstones, runtime container IDs, existing-only host policy, configuration validation, and CMDB HTTP contracts.

The source-level boundary is now explicit: `deletePodIfMapped` stores mappings under `<namespace>/<name>` and, after a successful CMDB delete, removes that base key only when the current ID+UID still matches the deleted mapping. Stale replacement mappings remain protected. This batch proves the in-process mapping lifecycle offline; cross-process persistence, real K3s informer/CMDB read-back, and non-Pod deletions remain blocked.

## Commands and results

Run from `/Users/fadewalk/Documents/code/bk-cmdb`:

```text
go test ./src/scene_server/kube_sync_server
ok   configcenter/src/scene_server/kube_sync_server  1.119s

go build ./src/scene_server/kube_sync_server/cmd/kube-sync
passed (no output)
```

No OpenSSL or Go dependency/build failure was observed in the requested offline scope.

## Gate status

### offline passed

- `kube_sync_server` Go tests passed, including the D.2 lifecycle gate tests.
- `kube-sync` command build passed.
- No CMDB, Mongo, or K3s mutation was performed.

### infra K3s blocked

K3s was intentionally not started or queried, per the task boundary. Therefore there is no real informer/workqueue observation, Kubernetes Pod update/delete event, or K3s-to-CMDB read-back evidence in this gate.

### clean fixture blocked

No clean CMDB/Mongo fixture was created, reset, or written. A successful CMDB Pod DELETE/read-back lifecycle, replacement-Pod convergence, and post-delete mapping cleanup therefore remain blocked pending an approved isolated fixture and external services.

## Not claimed by D.2

- Real K3s lifecycle convergence.
- CMDB/Mongo write or read-back correctness.
- Namespace/Node/Workload/Cluster deletion behavior.
- Retry persistence or dead-letter storage.
- Production readiness or clean-environment acceptance.
