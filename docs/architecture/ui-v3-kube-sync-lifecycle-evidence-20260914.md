# P49.1 生命周期硬化证据 — 2026-09-14

## 已完成

- Namespace/Node/Pod tombstone 使用 client-go 删除处理键；支持 value/pointer tombstone。
- 删除队列显式区分 `delete:`，未知 tombstone 不入队。
- Pod 删除 key 包含 `namespace/name@kubernetesUID`，只有内存中的同 UID 映射才调用 CMDB DELETE；防止同名重建误删。
- CMDB Pod DELETE contract 已测试：`DELETE /api/v3/deletemany/kube/pod`，body 为外层 `data:[{bk_biz_id,ids}]`。
- Namespace、Pods Workload、Node PUT contract 已测试：method/path、业务 ID、kind、ids、data 字段均断言。
- Pod 查询包含 `cluster_id + namespace_id + name`，减少跨 Namespace 同名碰撞。
- Container 必须有真实 runtime ID；不再生成 `kube-sync-<name>` 伪 ID。
- Pending Pod、NotReady Node、Host 映射缺失均 fail-closed 并进入 retry/error 计数。
- 启动严格拒绝 malformed Host map、zero workers、缺 API key/Host map。
- `/metrics` 输出 Prometheus 数值格式：ready、queue depth、retry exhausted。
- kube-sync Docker 支持 `TARGETARCH`；Compose API key 使用 Secret 文件，默认要求 HTTPS CMDB URL。

## 测试

```text
go test ./src/scene_server/kube_sync_server: passed
go build ./src/scene_server/kube_sync_server/cmd/kube-sync: passed
```

覆盖：

- normal resource queue keys；
- value/pointer tombstones；
- Container runtime UID；
- malformed host map；
- zero worker；
- existing-only host policy；
- Cluster create/read-back；
- Namespace/Workload/Node PUT contract；
- Pod DELETE contract。

## 仍未完成

- CMDB 没有公开 Pod update endpoint，Pod IP/labels/container image/UID 的完整更新收敛仍未实现；
- Namespace/Node/Workload PUT 已有 helper/contract，但仍需真实 Colima 更新回读；
- Namespace/Node/Workload/Cluster 自动删除仍受 CMDB 关联保护限制，未强删；
- retry exhaustion 尚无持久 dead-letter；
- 历史测试夹具曾产生业务归属异常，残留数据需受审计清理，不能直写 Mongo；
- P49.1 完整真实删除回归等待干净数据夹具。

## 生产边界

P49.1 只提高 K8s 同步器生命周期安全性，不改变生产总门禁：

- 物理机自动采集仍需 Agent/资产系统；
- 云虚拟机仍需真实 cloudserver/cloudsync、云凭据、secret manager；
- OIDC/IAM、TLS、NetworkPolicy、非 root/只读 rootfs、SBOM/签名、PITR 和 clean release 仍阻塞。
