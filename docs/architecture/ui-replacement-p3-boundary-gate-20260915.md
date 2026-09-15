# P3 第一批：dependency-boundary UI/gate 检查

> 日期：2026-09-15
> 范围：`src/ui-v3` 当前视图、stores、capability probes、permission/session、router，以及仓库内已有外部链路证据。
> 性质：只读静态 gate；不修改配置、不调用外部服务、不部署、不重启。

## 1. 目的与输出

本批只增加一个机器审计入口：

```bash
node scripts/ui-v3/audit-replacement-boundaries.cjs \
  > /tmp/ui-replacement-p3-boundary-gate.json
```

脚本 stdout 是 `schemaVersion: 1` 的 JSON 报告，报告包含：

- 五个外部域：`k8s`、`es/monstache`、`cloud-vendor`、`collector/nodeman`、`iam/oidc`；
- 每个域的 `pageEntry`、`capabilityProbe`、`blockedErrorState`、`realEvidence`、`externalOwner`；
- 页面路由的 direct / redirect / blocked / 动态 blocked 证据；
- dependency/API 异常是否会清空列表并落入 `el-empty` 或 table empty presentation；
- 证据文件路径、源码行号、文件 SHA-256；
- `readOnly`、`sideEffects`、排除路径和最终 `status` / `blockers`。

脚本仅读取工作树文件和已有文档，不写入报告文件。通过 shell 重定向写入 `/tmp` 不属于仓库写入。

## 2. 当前机器报告结果

本批执行结果为 **blocked**，这是预期的 gate 结果，不代表脚本执行失败：

```text
domains: 5
capability probes: 3 / 5
explicit blocked/error states: 5 / 5
dependency/API -> empty findings: 8
route direct/blocked check: passed (含 IAM 动态 permission 视图)
real evidence boundary: attention
```

最终阻断原因：

1. 多个依赖/API `catch` 分支把集合重置为空数组或总数置零，而页面仍存在空表/`el-empty` 展示，失败与“没有数据”无法稳定区分；
2. 外部依赖证据仍有 `real-partial`、`blocked-no-real-provider` 或 `mock-only`，不能据此批准完整替换或下线 `src/ui`。

## 3. 五个外部域边界矩阵

| 外部域 | Page entry | Capability probe | Blocked/error state | Real evidence path | External owner | Route gate |
|---|---|---|---|---|---|---|
| `k8s` | `src/ui-v3/src/views/KubePods.vue`，Pod 列表/详情 | `src/ui-v3/src/stores/capabilities.js` 的 `probeK8s()`，调用 `searchKubePods` | `KubePods.vue` 在 `capabilities.k8s.healthy` 为 false 时渲染 `DependencyBlocked(kind="pod")` | `docs/architecture/ui-v3-external-integration-evidence-20260913.md`；`docs/architecture/ui-v3-kube-sync-evidence-20260913.md`；`docs/architecture/ui-v3-kube-sync-lifecycle-evidence-20260914.md` | Kubernetes 平台与 kube-sync/collector 运维方；负责集群访问、informer 新鲜度、Node→Host 映射和生命周期收敛 | `direct-and-blocked`；同时保留旧 Pod 深链 redirect |
| `es/monstache` | `src/ui-v3/src/views/FullTextSearch.vue` | `capabilities.js` 的 `probeEs()`，以合法非空 filter 调用 `searchFullText` | `FullTextSearch.vue` 在 ES 不健康时渲染 `DependencyBlocked(kind="es")` | `docs/architecture/ui-v3-external-integration-evidence-20260913.md`；`docs/architecture/ui-v3-production-parity-handoff-20260912.md` | Elasticsearch 与 Monstache/索引运维方；负责 ES、alias、Mongo→ES 同步及插件/索引健康 | `direct-and-blocked` |
| `cloud-vendor` | `CloudDiscover.vue`，并由 `CloudAccount.vue` / `CloudArea.vue` 支撑账户、区域、VPC | **未发现专用 provider capability probe**；通过账户、地域、VPC 请求失败观察连通性 | 页面有请求失败清空、toast 和账户连通性提示，但没有专用云厂商 `DependencyBlocked` 路由 | `docs/architecture/ui-v3-next-handoff-20260914.md`；`docs/architecture/ui-v3-external-integration-evidence-20260913.md`；`docs/architecture/ui-v3-kube-sync-evidence-20260913.md` | 云厂商凭据/cloudserver/cloudsync 运维方；负责 provider API、凭据、DNS/TLS、secret manager、调度和读回 | `direct-only`；`cloud-resource` 是 redirect；provider 失败在页面内部处理 |
| `collector/nodeman` | `src/ui-v3/src/views/NetworkCollectBlocked.vue` | **未发现 probe**；页面明确不伪造 collector 注册或设备数据 | 显式 `DependencyBlocked(kind="network")`，文案指出需接入 collector | `docs/architecture/ui-v3-external-integration-evidence-20260913.md`；`docs/architecture/ui-v3-production-parity-handoff-20260912.md` | collector 与 bk-nodeman 运维方；负责采集器注册、Agent/设备清单和属性数据链路 | `blocked-only` |
| `iam/oidc` | `PermissionStatus.vue`、session/permission stores；路由 guard 负责原位 permission | session `userinfo`、`auth/verify`、`verifyResource` 和 router guard；真实 IdP 探针不在本扫描内 | `http.js` 发出 session-expired / permission-denied；router 使用动态 `meta.view = 'permission'`；`PermissionStatus.vue` 提供申请入口 | `docs/architecture/ui-v3-external-integration-evidence-20260913.md`；`docs/architecture/ui-v3-production-parity-handoff-20260912.md`；`docs/architecture/ui-v3-session-handoff-20260909.md` | OIDC IdP 与 IAM policy owner；负责登录/session、默认 deny、资源决策和审计 | `direct-and-dynamic-blocked`；静态 route 有 direct，guard 动态降级 permission |

说明：`real evidence` 是证据索引，不等于当前环境已满足生产验收。特别是 ES 查询可用不等于 Monstache 已同步业务文档，K8s read-back 可用不等于全部生命周期收敛，IAM mock 通过不等于真实多用户 OIDC/IAM 通过。

## 4. dependency error → empty 检查

当前报告发现 8 个需要后续修正或明确标记的风险点：

| 文件与行 | 异常后的状态重置 | 可能出现的空态 |
|---|---|---|
| `src/ui-v3/src/views/FullTextSearch.vue:34` | `hits.value = []`，无错误状态 | `:7` 的“未搜索到结果” |
| `src/ui-v3/src/views/KubePods.vue:39` | `pods.value = []`，无错误状态 | `:16` 的“暂无 Pod” |
| `src/ui-v3/src/views/cloud/CloudAccount.vue:223` | `rows.value = []`、`total.value = 0`，无错误状态 | `:57` 的“暂无数据” |
| `src/ui-v3/src/views/cloud/CloudAccount.vue:321` | `detailTasks.value = []`，无错误状态 | 详情表的空展示 |
| `src/ui-v3/src/views/cloud/CloudDiscover.vue:326` | `rows.value = []`、`total.value = 0`，无错误状态 | `:60` 的“暂无数据” |
| `src/ui-v3/src/views/cloud/CloudDiscover.vue:338` | `accounts.value = []`，无错误状态 | 账户选择/列表的空展示 |
| `src/ui-v3/src/views/cloud/CloudDiscover.vue:414` | `vpcRegions.value = []`，仅 toast | VPC 地域空列表 |
| `src/ui-v3/src/views/cloud/CloudDiscover.vue:431` | `vpcList.value = []`，仅 toast | VPC 表格的 empty-text |

这项检查是静态风险检查，不擅自修改本批之外的页面。`FullTextSearch` 与 `KubePods` 是最直接的依赖错误伪装为空结果案例；云账户/云发现项还需要产品确认“无数据”和“provider 不可达”是否必须使用不同状态组件。后续应优先保留 error/dependency 状态，再允许用户看到空结果。

## 5. 路由 direct / blocked 检查

脚本从 `src/ui-v3/src/router/index.js` 建立静态路由清单，并额外识别 router guard 动态写入的 permission/error 视图：

```text
k8s              direct-and-blocked
es/monstache      direct-and-blocked
cloud-vendor      direct-only
collector/nodeman blocked-only
iam/oidc          direct-and-dynamic-blocked
```

含义：

- K8s、ES 既有可达页面入口，也有明确依赖阻塞态；
- collector/nodeman 目前只允许进入明确阻塞页，不伪造数据链路；
- 云资源发现可以直接进入账户/任务 UI，但没有统一 provider blocked route，失败主要在页面内部处理；
- IAM 的 permission 是 router guard 动态写入 `meta.view`，不能只靠 route 字面量扫描判断。

## 6. 修改边界与验证

本批只新增：

```text
/Users/fadewalk/Documents/code/bk-cmdb/scripts/ui-v3/audit-replacement-boundaries.cjs
/Users/fadewalk/Documents/code/bk-cmdb/docs/architecture/ui-replacement-p3-boundary-gate-20260915.md
```

明确未修改字段模板/服务实例文件：

```text
src/ui-v3/src/views/model/FieldTemplate.vue
src/ui-v3/src/views/service/ServiceInstance.vue
```

未做以下操作：

- 未改配置文件；
- 未改 `src/ui` 或页面实现；
- 未调用外部 API；
- 未构建、部署或重启容器；
- 未写入仓库内机器报告文件。

验证命令：

```bash
node --check scripts/ui-v3/audit-replacement-boundaries.cjs
node scripts/ui-v3/audit-replacement-boundaries.cjs \
  > /tmp/ui-replacement-p3-boundary-gate.json
```

该 gate 只负责把 dependency boundary 机器化并暴露风险，不改变当前生产结论：在真实 OIDC/IAM、多用户 session、云厂商凭据/同步、collector/Nodeman、Monstache 业务索引和 clean release gate 完成前，不得把 `src/ui-v3` 宣称为完整替换，也不得下线 `src/ui`。
