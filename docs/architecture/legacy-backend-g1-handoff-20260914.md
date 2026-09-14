# G1 交接：老前端与后端真实对接优先

> 交接日期：2026-09-14
> 当前分支：`standalone-docker`
> 当前远端：`fadewalk/standalone-docker`
> 当前 HEAD：`7b0ba52cb0`
> 项目阶段：**G1 legacy/backend 对接验收优先**

## 0. 阶段目标变更

从本交接开始，项目不再继续新增或完善 ui-v3 功能。

当前优先级切换为：

> **先完成老前端 `src/ui` 与后端真实 API 的完整对接验收；G1 通过后，再进行 G1 + 新前端的第二次开发完善。**

后续称呼：

- **G1**：老前端—后端真实对接验收；
- **G1+**：G1 通过后，新前端第二轮补齐、视觉 parity 和生产化完善。

除非是阻断已有核心流程的修复，不要新增 ui-v3 页面、额外 wrapper 或新业务功能。

## 1. 当前不能宣称已完成

当前不能宣称：

- 老前端所有 API、页面、权限、异常和写回都已真实验收；
- 老前端所有云主机、物理机、K8s、全文检索和 collector 能力都已生产可用；
- 所有老版接口都已逐项完成 method/payload/response/read-back 对账；
- 真实 IAM/OIDC、多用户资源授权和审计已通过；
- standalone 默认配置可以直接用于多用户生产；
- 新前端已完全替代老前端。

当前最准确口径：

```text
ui-v3 核心迁移与部分真实 E2E：完成
K8s 单集群 → CMDB 初始同步：真实单环境通过，但生命周期仍需继续硬化
物理机 Excel 初始化/补录：真实通过
老前端—后端完整 G1 对接：未完成
真实云虚拟机同步：未验收
真实物理机 Agent 持续采集：未接入
真实 IAM/OIDC：未验收
生产放行：未通过
旧前端下线：不允许
```

## 2. 已完成的相关工作

### 2.1 老前端 API 和后端静态盘点

已有报告：

```text
docs/architecture/ui-v3-api-parity-report-20260913.md
scripts/ui-v3/audit-parity.cjs
scripts/ui-v3/api-migration-manifest.cjs
```

当前静态 manifest 口径：

```text
legacyDefinitions:           335
legacyUniqueMethodEndpoints: 306
v3Exports:                   249
v3ExportsWithCallers:        204
v3UnusedExports:              45
v3RouteGaps:                   0
v3GenericProxyMatches:        18
```

这些只是静态证据，不能替代 G1 的真实 method、payload、response、权限、异常和读回验收。

### 2.2 已完成的核心迁移批次

B38~B47 已有专项实现和 E2E/mock 证据，包括：

- 主机详情真实 API 路径修正；
- 路由、权限和错误状态；
- 拓扑/服务实例/HostApply 深链；
- 模型、实例、关联、字段模板；
- 导入/导出部分契约；
- IAM mock deny/申请矩阵；
- K8s/ES/collector 阻塞态和 mock contract；
- 结构化 regression report。

不能将 B38~B47 的通过解释为全部老前端功能真实通过。

### 2.3 P48~P50 新增工作

最近新增的部分不是老前端原有功能，而是为补数据链路/迁移缺口增加的能力：

- `cmdb_kube_syncserver`：Kubernetes → CMDB 初始同步器；
- K8s informer/workqueue/Host 映射；
- P49 生命周期基础硬化；
- P50 HostList Excel 导入真实 E2E；
- ui-v3 HostList 导入解包修复。

这些工作要保留，但从现在开始不继续扩展新前端功能，先回到 G1。

## 3. G1 验收定义

每个老前端功能必须具备以下证据，才能标记为 G1 通过：

```text
老前端页面/调用者
→ 后端 route/service 注册
→ HTTP method
→ URL 前缀(/api/v3、/host/v3、根路径等)
→ request payload
→ response envelope/shape
→ 成功交互
→ 错误/权限/空态
→ 写入后的数据库/API read-back
→ 清理/回滚
→ 机器可读测试报告
```

G1 不接受以下替代证据：

- 只看到路径存在；
- 只看到 v3 wrapper；
- 只打开页面；
- mock 返回成功；
- 阻塞页存在；
- 静态 `apiGaps=0`；
- 一次空数据 E2E；
- 仅截图没有请求和读回。

## 4. G1 优先领域顺序

### G1-A：老前端 API manifest 真实化

先建立老前端真实契约清单，来源固定为：

```text
src/ui/src/api/index.js
src/ui/src/store/modules/api/**
src/ui/src/service/**
src/ui/src/views/**
src/scene_server/**
src/source_controller/**
docs/apidoc/**
```

每条记录至少包含：

```text
legacy file/caller
route
method
transport/root prefix
payload fields/defaults
response shape
permission metadata
error codes
write/read-back expectation
external dependency
current evidence
G1 status
```

状态只允许：

```text
未盘点
仅静态
mock 已验证
本地真实已验证
外部依赖阻塞
G1 通过
生产阻断
```

### G1-B：物理机 Host 后端对接

优先验证老前端已有能力，不新增 ui-v3 功能：

- 主机资源池列表；
- 主机详情；
- 主机新增；
- Excel 导入；
- Excel 导入编辑；
- 批量编辑；
- 主机转移；
- 资源池/业务/模块关系；
- 导出；
- 删除保护；
- Agent bind/unbind API ownership。

已有真实证据：

```text
P50 HostList Excel op=1/op=2 + read-back
run-b16-batch-b.cjs
run-b31.cjs
run-route-smoke.cjs
```

仍需要：

- 老前端对应页面/API 的真实对照；
- multipart 失败矩阵；
- 重复 IP + cloud_id/资产唯一标识冲突；
- 失联/报废/下线语义；
- Agent 来源或明确外部 ownership。

证据：

```text
docs/architecture/physical-host-import-evidence-20260914.md
```

### G1-C：云虚拟机

老前端页面和后端能力包括：

```text
云账户
云区域
云资源发现/同步任务
cloudserver/cloudsync/HostSyncor
```

需要真实或 fake contract 两层：

1. 无凭据 fake/contract：
   - 账户 CRUD/verify；
   - 任务 CRUD；
   - VPC/region 映射；
   - HostSyncor add/update/destroy/idempotence；
   - task failed/stuck/retry；
   - 审计和历史。
2. 真实外部验收：
   - AWS/Tencent/Alibaba credentials；
   - 云 API 网络/DNS/TLS；
   - secret manager/bk-secrets；
   - Mongo change stream、Redis、ZK；
   - 真实 region/VPC/instance read-back。

没有真实凭据时只能标记“外部依赖阻塞”，不能宣称云虚拟机生产通过。

### G1-D：Kubernetes/BCS

老前端原有 K8s API/页面主要是查询已进入 CMDB 的 K8s 数据，不等于老前端自己采集 Kubernetes。

已有额外同步器：

```text
src/scene_server/kube_sync_server/
deploy/kube-sync/
```

真实单集群证据：

```text
docs/architecture/ui-v3-kube-sync-evidence-20260913.md
docs/architecture/ui-v3-kube-sync-lifecycle-evidence-20260914.md
```

G1 仍需区分：

```text
老前端 K8s API 页面
K8s → CMDB 数据采集
K8s Node → CMDB Host 绑定
Pod/Container 生命周期
```

不能用新同步器的通过结果替代老前端全部 K8s 对接验收。

### G1-E：全文检索/ES

老前端 `find/full_text` 真实链路依赖：

```text
Elasticsearch
Monstache
Mongo → ES index/alias
fullTextSearch=on
```

当前仅证明 ES 查询路由和空结果契约，Mongo→ES 真实索引同步尚未通过。

### G1-F：IAM/OIDC/权限/异常

必须在老前端上验证：

- 登录/logout/session expiry；
- 多用户 allow/deny；
- 资源级 IAM；
- 跨业务隔离；
- usercustom 隔离；
- API Key/身份头污染；
- 401/403/9900403/1306000；
- 管理面和普通 API 隔离。

当前只有本地内置账号、mock IAM 和身份清洗证据，真实 IdP/多用户仍阻塞。

## 5. 当前工作树和提交边界

下一会话开始先执行：

```bash
cd /Users/fadewalk/Documents/code/bk-cmdb
git status --short
git log -8 --oneline
```

工作树中有用户已有未提交文件、架构 HTML/截图和本地规则文件。严禁：

```bash
git add -A
git add .
```

只提交当前 G1 批次明确文件。

最近已推送提交：

```text
9f6f274c9f feat(kube-sync): sync Kubernetes resources into CMDB
e9f73126e6 fix(kube-sync): harden lifecycle and deletion safety
16af24cff3 fix(ui-v3): verify physical host import readback
7b0ba52cb0 docs: add ui-v3 next handoff
```

## 6. 下一会话的具体执行顺序

### 第一步：冻结新前端

- 不新增 ui-v3 页面；
- 不新增 ui-v3 wrapper；
- 不扩展新的前端业务功能；
- 只有 G1 验收发现的阻断性兼容修复才可改前端。

### 第二步：生成 G1 老前端 manifest

先不改业务代码，建立结构化清单和状态：

```text
legacy endpoint
legacy caller
backend registration
method/prefix
payload/response
permission/error
external dependency
G1 evidence
```

### 第三步：补老前端真实 contract tests

优先从以下无外部凭据领域开始：

1. Host import multipart op=1/op=2；
2. Host batch edit/transfer/read-back；
3. cloud account/task API error and validation；
4. 老前端 K8s API query contract；
5. full_text off/empty/error；
6. login/logout/session expiry；
7. 权限/错误状态矩阵。

### 第四步：再做外部依赖验收

外部资源到位后：

```text
真实云账号 → cloudsync
真实 Agent/资产系统 → 物理机
真实 IdP/IAM → 多用户权限
真实 ES/Monstache → full_text
真实 K8s/BCS → CMDB K8s 数据链路
```

### 第五步：G1 放行审查

只有以下内容全部有证据，才标记 G1 通过：

- 老前端可见页面和深链；
- API method/payload/response；
- 真实读写回；
- 权限/异常；
- 清理/恢复；
- 外部依赖状态；
- 干净环境回归；
- 生产安全门禁。

G1 通过后，再开始：

```text
G1 + 新前端第二次开发完善
```

## 7. 最终阶段口径

```text
当前阶段：G1 老前端—后端真实对接优先
新前端新增功能：冻结
老前端全部对接：未完成
本地核心 UI/API：部分完成
外部云/IAM/Agent/ES/K8s 依赖：分别验证，不能混写
G1 通过后：进入 G1+ 新前端第二次开发
```
