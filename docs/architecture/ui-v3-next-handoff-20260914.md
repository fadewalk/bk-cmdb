# bk-cmdb 下一会话交接：生产主机管理与外部链路

> 交接日期：2026-09-14
> 当前分支：`standalone-docker`
> 当前 HEAD：`16af24cff3 fix(ui-v3): verify physical host import readback`
> 远端：`fadewalk/standalone-docker`
> 工作目录：`/Users/fadewalk/Documents/code/bk-cmdb`

## 1. 当前结论

当前新前端和后端的真实能力分成四层：

```text
Vue3 核心主机管理页面/写回：已通过主要本地真实 E2E
K8s 单集群 → CMDB Host/Node/Pod/Container：P48 真实链路通过，P49 正在硬化生命周期
物理机 Excel 初始化/补录：P50 真实 op=1/op=2 + 读回通过
云虚拟机真实同步：等待真实云账号/cloudserver/cloudsync/secret manager
完整生产放行：未通过
```

不能宣称：

- 物理机已有持续 Agent/资产自动采集；
- 云虚拟机已完成真实云厂商同步；
- kube-sync 已经是完整生产级生命周期同步器；
- standalone 默认配置可对外多用户生产；
- OIDC/IAM、TLS、Secret Manager、SBOM/签名、PITR 已通过；
- 旧前端可以下线。

## 2. 最近已提交提交

```text
16af24cff3 fix(ui-v3): verify physical host import readback
  - 修复 HostList 导入结果解包和空数组误显示
  - 新增 run-host-import.cjs
  - 使用真实 host template、multipart op=1/op=2、Host 读回和清理

e9f73126e6 fix(kube-sync): harden lifecycle and deletion safety
  - tombstone/删除队列基础硬化
  - existing-only Host policy
  - runtime Container UID fail-closed
  - Prometheus 格式 metrics
  - Secret 文件/API key、TARGETARCH

9f6f274c9f feat(kube-sync): sync Kubernetes resources into CMDB
  - 独立 cmdb_kube_syncserver
  - client-go informer/workqueue
  - Cluster/Namespace/Workload/Node/Pod/Container 初始同步
  - fake client、CMDB contract test、Docker/Compose/RBAC

e9343023b7 fix(ui-v3): validate full text external integration contract
```

## 3. 当前会话仍未提交的明确变更

以下文件是本会话 P49 生命周期硬化的继续修改，已经通过：

```bash
go test ./src/scene_server/kube_sync_server
go build -o /tmp/cmdb_kube_syncserver ./src/scene_server/kube_sync_server/cmd/kube-sync
```

当前只包含本批同步器/部署文件，不包含用户已有架构文档和截图：

```text
deploy/kube-sync/Dockerfile
deploy/kube-sync/README.md
deploy/kube-sync/docker-compose.yml
src/scene_server/kube_sync_server/cmd/kube-sync/main.go
src/scene_server/kube_sync_server/cmdb.go
src/scene_server/kube_sync_server/config.go
src/scene_server/kube_sync_server/syncer.go
src/scene_server/kube_sync_server/syncer_test.go
docs/architecture/ui-v3-kube-sync-evidence-20260913.md
```

下一会话第一步：

```bash
git status --short
git diff --check -- <以上明确文件>
go test ./src/scene_server/kube_sync_server
go build -o /tmp/cmdb_kube_syncserver ./src/scene_server/kube_sync_server/cmd/kube-sync
```

审查通过后，只提交这些明确文件；不要使用 `git add -A`，不要提交用户已有未提交文件。

## 4. P48：真实 K8s → CMDB 已验证

环境：

- Colima profile `xwssd`
- K3s `v1.35.0+k3s1`
- node `colima-xwssd` Ready
- standalone CMDB `web=200`, `healthz=200`
- 测试 Host `bk_host_id=75`，IP `192.0.2.42`
- Host 先进入业务 2 空闲模块，才允许绑定 K8s Node

真实 K3s Pod：

```text
cmdb-kube-sync-real-probe
image: busybox:1.37
node: colima-xwssd
```

成功读回：

```text
Cluster:   id=2, uid=colima-k3s-p48
Namespace: id=3, name=default
Workload:  id=5
Node:      id=407, bk_host_id=75, bk_cluster_id=2
Pod:       id=5, bk_host_id=75, bk_node_id=407
Container: id=5, bk_pod_id=5, image=busybox:1.37
```

证据：

```text
docs/architecture/ui-v3-kube-sync-evidence-20260913.md
```

重要真实发现：

- K8s Node 不能代替 CMDB Host；Node 必须绑定已有、且属于同一业务的 Host；
- 初次错误夹具曾暴露 Cluster `bk_biz_id=0`，P49 已加入创建后按业务+UID读回校验；
- 历史测试夹具存在残留，公开删除接口受关联保护，没有执行 Mongo 直删；需要受审计清理任务后才能宣称数据库干净。

## 5. P49 当前状态和下一步

P49 已完成的安全/生命周期基础：

- `DeletionHandlingMetaNamespaceKeyFunc` 方向和 tombstone 分类；
- value/pointer tombstone 测试；
- 删除队列使用 `delete:` 前缀；
- Pod 删除 contract：

```json
{
  "data": [{"bk_biz_id": 2, "ids": [5]}]
}
```

- Pod 查询加入 cluster + namespace + name；
- 真实 Container runtime ID 未准备好时不写伪造 ID；
- Pending Pod、NotReady Node、无 Host 映射 fail-closed；
- malformed Host map、zero worker、缺 API key 拒绝启动；
- metrics 使用 Prometheus 数值：readiness、queue depth、retry exhausted；
- Compose API key 支持 Secret 文件；Dockerfile 支持 TARGETARCH。

仍未完成：

- Namespace/Node/Workload update convergence；
- Pod 本体没有公开 update API，不能伪造更新；
- Namespace/Node/Workload/Cluster 删除级联；
- dead-letter 持久化和完整失败恢复；
- 多进程/多副本分布式锁与唯一约束；
- 真实创建/更新/删除 K3s Pod 的完整生命周期回归。

下一步 P49.1：

1. 用已确认的 PUT contract 接入 Namespace/Node/Workload update；
2. 增加 CMDB `request()` 的 PUT/DELETE contract；
3. 完善 Pod UID 映射与 delete read-back；
4. 用真实 K3s Pod 更新 label、重启 container、删除 Pod，确认 CMDB 删除或安全 pending；
5. 不强删 Node/Namespace/Cluster，继续让 CMDB 关联保护兜底；
6. 修复 ready 语义和初始队列/CMDB 可用性检查；
7. 为 retry exhaustion 增加持久失败记录或可查询 dead-letter。

## 6. P50：物理机 Excel 初始化/补录已验证

证据：

```text
docs/architecture/physical-host-import-evidence-20260914.md
src/ui-v3/e2e/run-host-import.cjs
```

真实流程：

```text
POST /importtemplate/host
→ 生成官方模板 fixture
→ HostList setInputFiles
→ POST /hosts/import op=1
→ response data.association={}
→ POST /hosts/import op=2
→ data.success=[Excel 行号]
→ /findmany/hosts/search/resource 读回 Host
→ DELETE /hosts/batch 清理
```

通过输出：

```text
✓ HostList import op=1/op=2 and read-back passed host=78
✓ run-b16-batch-b.cjs
✓ run-b31.cjs
✓ run-route-smoke.cjs
```

HostList 修复：

- 不再读取错误的 `resp.data.info`；
- 兼容 `resp.success/error` 和 `resp.data.success/error`；
- 空数组显示“未解析到可导入数据”；
- 没有把 `op=1` 误改成真正写入。

生产边界：

Excel 只证明受审计初始化/补录链路，不证明物理机自动资产采集。下一步 P50.1：

- 用真实 Agent/资产源或审批 Excel fixture 验证唯一身份；
- 重复 IP + cloud_id/序列号冲突；
- 失联、报废、重装和状态变更；
- Agent bind/unbind ownership；
- 多用户导入权限和审计。

## 7. 云虚拟机生产验收阻塞

现有 cloudserver/cloudsync 具备：

- 云账户 CRUD/verify；
- region/VPC；
- cloud sync task；
- HostSyncor 新增、更新、销毁和同步历史。

但真实验收需要外部提供：

- AWS/Tencent/Alibaba credentials；
- 云 API 网络、DNS、TLS；
- bk-secrets/secret manager；
- Mongo Change Stream、Redis、ZK 服务发现；
- 真实 VPC/instance fixture。

仓库内下一步 P51（无需凭据）：

- fake vendor/Core/DB harness；
- HostSyncor 新增/更新/销毁/幂等；
- scheduler hash-ring、冷启动、重复投递；
- task failed/stuck/panic recovery；
- cloud area/VPC/sync history contract。

拿到真实凭据后才做云生产验收。

## 8. 生产放行门禁

目前继续阻断：

```text
OIDC/auth disabled in standalone default
TLS verification disabled in development config
API key/session secret not managed by external Secret Manager
standalone multi-process supervision incomplete
physical Agent/asset source absent
cloud credentials/cloudsync not validated
K8s lifecycle update/delete not fully convergent
Mongo/Redis/ZK TLS/PITR/restore/rotation incomplete
SBOM/image signing/provenance incomplete
clean release environment/B44 full gate not rerun
```

因此：

- 旧前端不下线；
- standalone 不对外暴露；
- kube-sync 不直接生产部署；
- 物理机/云虚拟机不宣称生产完成。

## 9. 推荐下一会话顺序

```text
P49.1  Namespace/Node/Workload update + Pod delete read-back
→ P49.2  kube-sync Deployment/Secret/NetworkPolicy/Prometheus 完整模板
→ P50.1  Host import 冲突/重复/失联/Agent ownership
→ P51    cloudsync/HostSyncor fake harness
→ 真实云账号/物理 Agent 到位后的外部验收
→ 真实 OIDC/IAM/TLS/Secret/PITR/SBOM/signature
→ clean environment B44 放行
```

每批都必须：

1. 只读事实源和真实契约；
2. 实现；
3. fake/contract test；
4. 真实读回；
5. `/tmp` 构建部署；
6. 记录首跑失败和清理结果；
7. 只提交明确文件；
8. 推送 `fadewalk standalone-docker`。
