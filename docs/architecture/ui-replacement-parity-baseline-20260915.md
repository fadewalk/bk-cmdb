# P0 `src/ui` → `src/ui-v3` 替换基线 — 2026-09-15

## 目标

本基线以 `src/ui` 为事实源，面向最终让 `src/ui-v3` 替换旧前端，而不是只证明路径存在或页面可打开。生成器和校验器：

```bash
node scripts/ui-v3/replacement-parity-matrix.cjs \
  > /tmp/ui-replacement-parity-matrix.json
node scripts/ui-v3/validate-replacement-parity.cjs \
  /tmp/ui-replacement-parity-matrix.json \
  > /tmp/ui-replacement-parity-summary.json
node scripts/ui-v3/test-replacement-parity.cjs
```

完整替换条目必须有：

```text
旧 caller/页面
→ v3 route/page/interaction
→ method + URL prefix
→ payload + response envelope
→ loading/empty/error/permission/session
→ write/read-back/cleanup
→ old/new visual evidence
```

强蓝鲸生态边界（IAM/IdP、bk-nodeman、Collector、ESB、外部 BCS/平台服务）不在 CMDB 内重造，但必须保留 v3 入口、参数、权限、申请/跳转、错误和不可用态。Kubernetes、云厂商、ES/Monstache、Mongo/Redis/ZK 是 CMDB 自身后端能力的依赖，页面和契约仍需在环境可用时真实验收。

## 当前生成结果

当前 HEAD `9ffa135999` 工作树仍 dirty，因此本报告只是替换基线，不是 release gate：

```text
legacy view files: 299
v3 view files: 60
legacy route records: 78
v3 route inventory: 475
route status:
  direct: 13
  redirect: 58
  embedded: 0
  dependency-blocked: 7
  missing: 0 (static heuristic only)
  unknown: 0
legacy menu records: 28
menu text matches: 25 / 28
```

未匹配菜单文本：

```text
业务集拓扑
模型拓扑
业务层级
```

其中“模型拓扑”在 v3 菜单中收敛为“模型关系”，不能因为文字不一致就直接判缺失；“业务层级”需要确认旧版 available 过滤后的产品口径；“业务集拓扑”需要确认 v3 `BizSetTopo` 入口和动态菜单上下文。它们进入 P1/P2 逐项验收，而不是静态忽略。

### 重要解释

- `direct`：只有静态 path/template 匹配，不代表行为或 API 完成；
- `redirect`：v3 有 canonical/统一承接，需要单独验证交互等价、query 恢复、返回链、错误态；
- `embedded`：后续可用于记录被工作台/抽屉嵌入的旧页面；
- `dependency-blocked`：当前静态证据指向 K8s、cloud vendor 或 IAM/OIDC 等依赖，不代表功能已经完成；
- `missing: 0` 只表示本扫描器没有找到“普通字符串级 missing”，不能作为完整替代结论；
- `menu text coverage` 是文本匹配，不是视觉、权限或交互覆盖。

## P1/P2 实现队列

优先补非生态、可由 CMDB 自身完成的缺口：

1. 旧 `business/history` / `/resource/business/history` 归档深链；
2. HostApply `confirm/edit/run/conflict/failed` 独立状态、失败主机和返回链；
3. Pod/Container 详情、属性、拓扑 path 和返回链（真实 K8s 可用时 read-back，否则先保留清晰 blocked）；
4. 字段模板 `binding/bind/sync` 的独立 deep link、刷新和失败恢复；
5. 服务实例 create/clone 独立深链和真实保存；
6. 版本日志页面和 Header 入口；
7. 组织架构/department 字段：若确认属于强蓝鲸依赖，复刻 boundary；否则实现等价选择器；
8. 模型字段复杂类型（organization、foreignkey、enumquote、enummulti、objuser、table）；
9. 45 个 v3 无 caller wrapper：逐条接 UI 或登记删除理由；
10. generic proxy-only 记录：补 handler/method/payload/response/permission/read-back 证据。

## 替换门禁

在 P0 矩阵基础上，后续每批都必须同步：

- route status 和最终 hash/query；
- API caller/payload/response；
- error/permission/empty；
- read-back/cleanup；
- 视觉状态矩阵；
- 强生态依赖和真实环境阻塞。

只有当非生态旧可见功能无 missing、关键 redirect/embedded 已证明等价、外部依赖有真实证据或明确批准的阻塞决策，并且 clean release/security gate 通过，才可以下线 `src/ui`。在此前，不得把 `src/ui-v3/REPLACE_OLD_UI.md` 的早期批次列表当作替换批准。
