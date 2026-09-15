# `src/ui-v3` 替换进度与最终门禁快照 — 2026-09-16

## 总目标

本项目的最终目标是由 `src/ui-v3` 替换 `src/ui`。`src/ui` 仍是页面、交互、接口和文案事实源；强蓝鲸生态外部系统不在 CMDB 内重造，但 v3 必须保留入口、权限、参数、申请/跳转、错误和阻塞态。

## 当前已落地批次

```text
P0 replacement parity baseline
P1 version log
P1 archived business deep link
P1 HostApply stage deep links
P2 business topology set/module rename
P2 service instance labels/create/clone payloads
P2 field-template bind/sync deep links
P2 K8s Pod/Container detail + topology path
P2 service-instance module filter + label aggregation
P2 model association detail caller / field group move
P3 dependency boundary audit
P3 dependency/API failures no longer render as empty in core pages
```

近期提交已按批次推送到 `fadewalk/standalone-docker`，包括：

- P0 parity baseline；
- P1 version log/deep links；
- P2 field template、service instance、K8s detail、model association；
- P3 boundary gate/error-state fixes。

## 当前机器快照

生成命令：

```bash
node scripts/ui-v3/replacement-parity-matrix.cjs > /tmp/final-replacement-matrix.json
node scripts/ui-v3/validate-replacement-parity.cjs /tmp/final-replacement-matrix.json > /tmp/final-replacement-summary.json
node scripts/ui-v3/api-migration-manifest.cjs > /tmp/final-api-manifest.json
node scripts/ui-v3/audit-replacement-boundaries.cjs > /tmp/final-boundaries.json
node scripts/ui-v3/audit-g1-production-gate.cjs > /tmp/final-production-gate.json
```

结果：

```text
legacy view files: 299
v3 view files: 65
legacy route records: 78
v3 route inventory: 488
route: direct=14, redirect=57, dependency-blocked=7, missing=0(static heuristic)
menu text coverage: 25/28
v3 wrappers: 252
v3 wrappers with caller: 215
v3 wrappers without caller: 37
v3 route gaps: 0(static)
generic proxy-only: 20
```

`replacementReady=false`，因为工作树 dirty、仍有 redirect/依赖边界/未使用 wrapper，且机器报告明确声明静态匹配不等于完整替换。

## 当前仍未完成的非生态替换项

- 组织架构/department 字段选择器和复杂字段控件；
- 业务层级是否属于最终可见功能需确认后补齐或明确下线；
- HostApply 多阶段的逐主机冲突/失败详情；
- 字段模板编辑三步完整 legacy 语义（`edit/:id/binding` 当前为上下文承接）；
- BusinessTopo 服务实例标签的单条编辑/聚合筛选仍需继续与独立服务实例页统一；
- 37 个无 caller wrapper 需要逐条接 UI 或登记兼容残留删除理由；
- 版本日志真实后端 read-back（mock 和页面已通过）；
- 视觉 parity 自动化 diff 门禁尚未建立。

## 明确外部/生态阻塞

- K8s 真实集群和生命周期完整 read-back；
- ES/Monstache Mongo→ES 非空索引和恢复；
- AWS/Tencent 真实云发现与 HostSyncor；
- Collector/Nodeman/Agent ownership；
- 外部 OIDC、多用户、资源级 IAM、usercustom 隔离；
- 组织架构/department 若依赖蓝鲸外部目录；
- 生产 Secret Manager、TLS、容器 hardening、SBOM/signature、PITR/restore、kill/restart。

这些功能有 mock/blocked boundary，但不能以 mock 通过标记为替换完成。

## 最终下线门禁

在以下全部通过前，不下线 `src/ui`：

1. legacy route/menu/deep-link matrix 中非生态能力无 missing；
2. direct/redirect/embedded 都有真实行为等价证据；
3. 非生态 wrapper 全部有 caller或删除理由；
4. 核心写流程有 method/payload/response/read-back/cleanup；
5. K8s/ES/cloud/IAM 依赖有真实证据或正式阻塞决策；
6. old/new 视觉和状态矩阵完成；
7. clean release commit/image/dist hash 可追溯；
8. 生产安全 gate 不再 blocked。

当前 production gate 仍为：

```text
status: blocked
releaseDecision: do not release; do not retire legacy src/ui
```

因此当前阶段是“继续完善 v3 替换”，不是“旧前端已退役”。
