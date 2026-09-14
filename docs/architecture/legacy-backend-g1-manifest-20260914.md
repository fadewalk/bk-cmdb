# 老前端 G1 API Manifest 静态基线 — 2026-09-14

## 目的

本批次建立老前端 `src/ui` 与后端真实对接验收的**静态事实基线**。它服务于 G1-A，不代表接口已经真实可用，也不替代请求追踪、权限矩阵、错误分支、写回读回或清理测试。

## 生成命令

在仓库根目录执行：

```bash
node scripts/ui-v3/legacy-g1-manifest.cjs > /tmp/legacy-g1-manifest.json
node scripts/ui-v3/validate-legacy-g1-manifest.cjs /tmp/legacy-g1-manifest.json > /tmp/legacy-g1-manifest-summary.json
```

不传文件参数时，校验器会直接执行生成器；也可以用环境变量指定输入：

```bash
G1_LEGACY_MANIFEST_PATH=/tmp/legacy-g1-manifest.json \
  node scripts/ui-v3/validate-legacy-g1-manifest.cjs
```

生成结果默认写 stdout，不把含有 `generatedAt` 和当前工作树状态的完整 manifest 提交到仓库。

## 当前静态计数

在提交 `6d93206826`、分支 `standalone-docker` 的当前工作树上生成：

| 指标 | 数量 |
| --- | ---: |
| HTTP records | 440 |
| Vuex action records | 311 |
| service HTTP records | 129 |
| 有静态 caller 的 records | 171 |
| 动态 endpoint/selector records | 213 |
| 直接后端路由匹配 | 372 |
| 仅 generic proxy 匹配 | 68 |
| 未匹配 | 0 |
| 仅静态 | 368 |
| 外部依赖阻塞 | 72 |
| G1 通过 | 0 |

计数会随源码和当前提交变化，应以命令输出为准。

## Manifest 结构

顶层字段：

- `schemaVersion`、`reportKind`、`generatedAt`：报告身份与版本。
- `git`：commit、branch、工作树 dirty 状态。
- `sources`：老前端、后端和文档事实源。
- `counts`：来源、动态 selector、后端匹配、状态和外部依赖的汇总。
- `records`：逐条静态契约记录。
- `notes`：静态提取边界。

每条 `records[]` 至少包含：

- `source`：`vuex-action` 或 `service-http`、文件、行号、符号、namespace 和原始调用表达式。
- `callers`：view 中的 dispatch/service caller；找不到时保留 `definition-only`。
- `http`：method、原始 endpoint 模板、归一化路径、运输方式、path 参数、动态 selector 和后端 route match。
- `request`：payload/config/pagination 的源码线索；不会猜测运行时默认值。
- `response`：默认 `$http` envelope 解包规则和源码中发现的 adapter 线索。
- `permissions`、`errors`：权限、租户、错误码的静态提示；运行时状态保持 unknown/static-hints。
- `relations`：内部 dispatch、service selector、并行请求和分页编排线索。
- `externalDependencies`：cloud、collector、kubernetes、elasticsearch/Monstache、IAM/OIDC 等保守分类。
- `evidence`、`status`：当前证据与 G1 状态。

## 状态边界

脚本支持 handoff 定义的完整状态枚举：

```text
未盘点
仅静态
mock 已验证
本地真实已验证
外部依赖阻塞
G1 通过
生产阻断
```

本静态生成器只会产生：

- `仅静态`：有老前端源码记录，但还没有运行时 contract 证据；
- `外部依赖阻塞`：源码明确涉及云、采集、Kubernetes、ES/Monstache、IAM/OIDC 或其他外部系统。

它不会把路径匹配、页面打开、mock 成功或空数据结果标记为 `G1 通过`。

## 后端匹配含义

- `direct-route-match`：源码路径与静态扫描到的后端注册路由分段匹配；不证明 method、payload 或 response 一致。
- `generic-proxy-only`：没有定位到专用 handler，只能看到通用代理兜底。
- `unmatched`：当前静态扫描未找到兼容注册；需要人工核对动态注册、文档或运行时路由。

## 校验器

`validate-legacy-g1-manifest.cjs` 使用 Node 内置结构校验，不引入 JSON Schema 依赖。缺少顶层字段、记录必需字段、非法状态或错误类型时以非零退出，并输出错误到 stderr；成功时输出摘要 JSON，包括：

- 按来源、状态、route match 分类；
- 动态 selector、unknown 权限和 response adapter 计数；
- 下一批 contract tests 的优先记录；
- 是否仍只处于静态/外部阻塞状态。

最小单元检查：

```bash
node scripts/ui-v3/test-legacy-g1-manifest.cjs
```

## 已知限制

1. `src/ui/src/api/index.js` 是 HTTP 运行时，不会单独产生完整业务 endpoint；主要记录来自 Vuex action 和 service 层。
2. JavaScript 动态拼接、条件 selector、service registry 和 view 间接 dispatch 只能保留源码线索，不能静态还原全部 payload 变体。
3. GET/DELETE 的 `config.data`、FormData、`transformData:false`、分页/并发适配已做线索标记，但仍需请求级证据。
4. 后端 route 扫描是注册提示，不证明权限、错误码、数据库写回或跨业务隔离。
5. `docs/apidoc/**` 已列为事实源范围，但本脚本不把文档文本当作已验证运行时契约。
6. 外部依赖分类是文件名/endpoint 的保守启发式，必须在真实环境验收时替换为凭据、网络、服务和读回证据。

## 下一批真实 contract tests

按 G1 handoff 的顺序，下一批不新增 ui-v3 功能，优先补：

1. 老前端 Host import multipart `op=1/op=2`；
2. Host 批量编辑、转移、删除保护和 read-back；
3. 云账户/任务校验、失败、重试和权限矩阵；
4. 老前端 K8s API 查询；
5. `full_text` off/empty/error；
6. login/logout/session expiry；
7. 401/403/9900403/1306000 和多用户隔离。

只有这些运行时证据、清理/回滚、干净环境回归和生产门禁全部收口后，才能把对应记录提升为 G1 通过。
