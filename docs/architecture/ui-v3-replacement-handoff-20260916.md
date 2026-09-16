# 交接：`src/ui-v3` 完整替换 `src/ui` 主线 — 2026-09-16

> 本文 supersede 早期“先完成 legacy/backend G1、冻结 ui-v3”的阶段性口径。当前主目标已切换为：**除强蓝鲸生态外部系统边界外，把旧前端可替换能力完整复刻到 `src/ui-v3`，最终切换并下线 `src/ui`。**

## 1. 当前工作点

```text
branch: standalone-docker
remote: fadewalk/standalone-docker
HEAD: dc59096c42 feat(ui-v3): complete HostApply related rule callers
```

当前工作树有用户已有未提交/未跟踪文件（架构文档、截图、本地规则、老前端已有修改等）。这些文件不属于本批交接，也不应使用 `git add -A`/`git add .`。

当前正在工作的未提交文件（不视为已交付）：

```text
src/ui-v3/src/views/host-apply/HostApply.vue
src/ui-v3/src/views/service/ServiceTemplate.vue
src/ui-v3/src/views/service/SetTemplateCreate.vue
src/ui-v3/src/views/service/SetTemplateDetails.vue
```

这些改动可能属于后续 HostApply/set-template caller 批次，下一会话必须先审查 diff，再决定保留、拆分、验证和提交；不能把它们直接带入新的批次。

## 2. 已推送的替换批次

按提交顺序，近期已完成并推送：

```text
P0  replacement parity baseline
P1  version log page/API/Header/secure markdown
P1  archived business deep link
P1  HostApply confirm/run/conflict/failed deep-link state
P2  business topology set/module rename caller
P2  service-instance labels/create/clone payload parity
P2  field-template bind/sync deep links and task/failure/id preservation
P2  K8s Pod/Container detail, properties, topology path, legacy deep-link
P2  service-instance module search, name search, label aggregation/selectors
P2  model association detail read-back / field-group move / model delete protection
P2  operation chart position persistence
P2  service process detail/by_ids and batch update contract
P2  set-template create/update/delete CRUD caller
P2  HostApply related rules/status/final-rules caller
P3  dependency boundary audit
P3  dependency/API failure no longer rendered as empty core pages
```

关键验证：

- Host 批量编辑、转移、删除保护：真实 read-back/cleanup 通过；
- 云 fake vendor/UI mock：离线 contract 通过，live cloud 明确 blocked；
- full_text off/empty/error：离线矩阵通过，Mongo→ES blocked；
- legacy K8s query mock：Pod/Node/Namespace/Workload/Container、count 双请求、path、attributes、500/403 通过；
- K8s Pod/Container detail mock：属性、Container tab、拓扑 path、旧深链、blocked 通过；
- session contract：login/c_url/userinfo/401/1306000/HTML/header sanitation 通过，logout 因 skip-login 自动复活 blocked；
- 字段模板 bind/sync：真实页面路由、diff、task ID 数组、`failure` 状态、字段后端 ID 通过构建/契约检查；
- AssociationType B46：真实详情请求/read-back/失败不打开抽屉通过；
- Operation B47：位置保存 body、成功/失败/read-back 通过；
- Model delete B48：实例保护、真实 delete、删除后 read-back、内置模型保护通过；
- K8s kube-sync 离线生命周期测试/build 通过，真实 K3s clean fixture blocked。

## 3. 当前 parity 快照

生成命令：

```bash
node scripts/ui-v3/replacement-parity-matrix.cjs > /tmp/handoff-replacement-matrix.json
node scripts/ui-v3/validate-replacement-parity.cjs /tmp/handoff-replacement-matrix.json > /tmp/handoff-replacement-summary.json
node scripts/ui-v3/api-migration-manifest.cjs > /tmp/handoff-api-manifest.json
node scripts/ui-v3/audit-replacement-boundaries.cjs > /tmp/handoff-boundaries.json
node scripts/ui-v3/audit-g1-production-gate.cjs > /tmp/handoff-production-gate.json
```

当前输出：

```text
legacy view files: 299
v3 view files: 65
legacy route records: 78
v3 route inventory: 486
direct: 14
redirect: 57
embedded: 0
dependency-blocked: 7
missing: 0 (static heuristic only)
unknown: 0
menu text coverage: 25/28
v3 wrappers: 252
v3 wrappers with callers: 225
v3 wrappers without callers: 27
v3 route gaps: 0 (static)
generic proxy-only: 19
```

27 个未使用 wrapper 不是自动缺口或自动完成，必须逐条接入 v3 UI 或登记兼容残留/删除理由。当前主要剩余类别：

```text
Host transfer/favorite/host-apply related
Cloud area helper
Field-template sync/update helper
Service-template detail
Netcollect/collector（外部蓝鲸生态）
Service-instance advanced helper
```

静态矩阵明确限制：route/path match 不证明 method、payload、response、权限、read-back 或视觉行为。

## 4. 外部生态边界

以下能力不能通过补一个 Vue 页面伪造完成，必须保留 v3 入口、参数、权限、错误和 blocked/申请态：

- 蓝鲸 IAM/IdP/OIDC/多用户资源级授权；
- bk-nodeman、Collector、ESB、外部 BCS/平台服务；
- 真实 AWS/Tencent 云供应商和 secret manager；
- K8s/BCS 真实集群采集环境；
- ES/Monstache Mongo→ES 运行链路。

CMDB 自身页面和契约仍要复刻；只有真实外部资源/外部平台状态标记为依赖阻塞，不能把 mock 通过当生产通过。

## 5. 当前生产门禁

`audit-g1-production-gate.cjs` 当前：

```text
status: blocked
blockers: 10
releaseDecision: do not release; do not retire legacy src/ui
```

阻断信号：

- 8090 运行端口不是 loopback；
- `STANDALONE_PROFILE=core` 但 runtime 仍运行 cloudserver；
- runtime `/run.sh` hash 与 checkout 不一致；
- healthz 500；
- checkout 未启用 OIDC、仍有 skip-login；
- TLS 校验不严格；
- root、可写 rootfs、capabilities 未 drop；
- worktree dirty。

Boundary gate 当前 `blocked`，并已发现过 API/dependency 失败直接被页面显示为 empty 的风险；FullText/K8s/CloudAccount/CloudDiscover 首批错误态已修复并构建通过。

## 6. 下一会话执行顺序

### 先处理当前未提交改动

1. 审查 `HostApply.vue`、`ServiceTemplate.vue`、`SetTemplateCreate.vue`、`SetTemplateDetails.vue` diff；
2. 按旧源码 payload/response 对账；
3. 运行 isolated build/E2E；
4. 只提交已验证文件；
5. 失败或外部依赖阻塞必须保留 blocked 报告。

### 随后继续替换主线

1. HostApply 相关 rules/status/final-rules wrapper callers；
2. set-template create/update/delete caller；
3. ServiceInstance/BusinessTopo 标签 aggregation 和高级查询收尾；
4. K8s/ES/cloud 页面真实依赖状态和错误重试；
5. 组织架构/department 字段控件边界确认；
6. 其余 27 个 wrapper 逐条接入或登记删除/生态边界；
7. route/deep-link 全矩阵、视觉 state matrix、真实 read-back；
8. clean release/canary/cutover gate。

## 7. 最终下线条件

在以下全部满足前，不删除或下线 `src/ui`：

```text
非生态 legacy route/menu/deep-link 无 missing
redirect/embedded 有真实行为等价证据
非生态 wrapper 全部有 caller 或明确删除理由
核心写流程有 payload/response/read-back/cleanup
K8s/ES/cloud/IAM 有真实证据或正式 blocked decision
视觉和错误态矩阵通过
OIDC/多用户/资源级 IAM 通过
clean commit/image/bundle hash 可追溯
生产安全/可靠性 gate 不再 blocked
```

当前正确结论：**v3 正在持续替换旧前端，但旧前端尚不能下线。**
