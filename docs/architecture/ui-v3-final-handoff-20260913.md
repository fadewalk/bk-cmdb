# bk-cmdb ui-v3 最终交接文档

> 交接日期：2026-09-13  
> 当前分支：`standalone-docker`  
> 当前 HEAD：由最后一次交接提交更新  
> 适用目录：`/Users/fadewalk/Documents/code/bk-cmdb`
> 最新回归：38/38 scripts passed（报告：`/tmp/final-handoff-regression.json`；served bundle：`index-_4x5F78S.js`）

## 0. 给下一位会话的结论

**本地可完成的 UI/API 迁移、核心 E2E、mock 契约、启动门禁、备份恢复演练均已完成。剩余工作主要依赖真实外部资源，不能用 mock 伪装成生产完成。**

当前可以宣称：

- `src/ui-v3` 已覆盖主要核心页面和核心写流程；
- 关键 API 契约已经从老版源码和后端注册中校对；
- B38~B47 有专项 E2E、mock contract、结构化 regression report；
- 内置账号登录、logout、session 失效、IAM deny/申请动作已有本地证据；
- K8s/ES/网络采集在无外部资源时有真实契约的 mock 测试和明确阻塞页；
- Mongo 备份和恢复演练已在本机完成。

不能宣称：

- Vue3 已完全 1:1 替代 Vue2；
- 所有老版 API、payload、response、权限和异常分支都已真实验证；
- K8s、ES、collector、真实云同步、外部 IAM 已生产可用；
- standalone 当前配置可以直接对外多用户生产；
- 旧前端可以下线。

## 1. 新会话启动步骤

严格按以下顺序：

```bash
cd /Users/fadewalk/Documents/code/bk-cmdb
```

1. 读取本文件；
2. 读取 `AGENTS.md`；
3. 读取 `docs/architecture/ui-v3-api-parity-report-20260913.md`；
4. 读取 `docs/architecture/ui-v3-production-parity-handoff-20260912.md`；
5. 读取 `docs/architecture/standalone-security-boundary.md`；
6. 读取 `docs/architecture/standalone-reliability-runbook.md`；
7. 检查：

```bash
git status --short
git log -12 --oneline
node scripts/ui-v3/audit-parity.cjs >/tmp/ui-v3-api-audit.json
node scripts/ui-v3/api-migration-manifest.cjs >/tmp/ui-v3-api-manifest.json
```

## 2. 当前提交和工作树边界

### 本轮核心提交

```text
B38  50b31121f1  fix(ui-v3): replace dead endpoints with real backend contracts
B39  c442c0b329  feat(ui-v3): full router guard and error-state parity
B40  020068edfd  feat(ui-v3): restore topo node/tab contract and service-instance deep links
B41  8bc12d23ae  feat(ui-v3): instance association tab and model depth flows
B42/B43/B44  c5cd70b6c0  dependency-blocked gates, backup drill and B44 tooling
B45  8208470cf2  assoc topo/fullscreen, import exists marker, export password rules
B45 fix  748dd5dd52  suppress benign ResizeObserver loop noise
API evidence  bd55bfe61d  legacy-v3 API parity report
Core domains  b18e839d98  IAM/K8s/ES/advanced API surfaces
Core evidence  b4d2a73838  API migration manifest
Mock contracts 420ad0378e  core-domain mock contracts
Mock errors   cd1f866d64  mock error matrix and shared helpers
B46/B47       492dd66041, cf24ea5e83  structured runner and API evidence
B31 fix       bacb92fda3  host name default column
Login        0b358a1c77  built-in account login/logout/session fixes
Restore       051d7d3907  Mongo backup/restore drill evidence
```

以上提交已推送到：

```text
fadewalk/standalone-docker
```

### 当前工作树

仓库里可能存在用户原有的未提交文件，例如本地规则、审计文档或旧版组件修改。不要用：

```bash
git add -A
git add .
```

只提交当前批次明确文件。

## 3. API 迁移进度口径

### 老版静态盘点

```text
Vuex API modules:                  51
Vuex endpoint definitions:         311
service-layer definitions:         148
combined definitions:              459
approx unique method+endpoint:     381
```

老版 API 分散于：

```text
src/ui/src/api/index.js
src/ui/src/store/modules/api/**
src/ui/src/service/**
src/ui/src/views/** callers
```

### 新版当前 manifest

以：

```bash
node scripts/ui-v3/api-migration-manifest.cjs
```

为准，当前口径是：

```text
legacyDefinitions:           335
legacyUniqueMethodEndpoints: 306
v3Exports:                   249
v3ExportsWithCallers:        204
v3UnusedExports:              45
v3RouteGaps:                   0
v3GenericProxyMatches:        18
v3StaticCallerOnly:          204
```

注意：这些数字表示静态证据，不等于生产完成。`v3GenericProxyMatches` 必须单独看，通用代理不等于每个 endpoint 都有专用后端 handler。

报告：

```text
docs/architecture/ui-v3-api-parity-report-20260913.md
```

静态扫描：

```text
scripts/ui-v3/audit-parity.cjs
```

manifest：

```text
scripts/ui-v3/api-migration-manifest.cjs
```

## 4. 重要已完成领域

### B38 API 契约

- 主机详情改为真实：

```text
POST /findmany/hosts/search/with_biz
POST /findmany/hosts/search/resource
POST /findmany/hosts/search/noauth
```

- 移除死接口：

```text
/host/search
/hosts/snapshot/:id
/findmany/inst/association
```

- 字段分组移动使用：

```text
PUT /update/objectattgroupproperty
```

- 模型导入/导出走 web_server root path，并保留 multipart/blob/timeout。

### B39 路由和权限状态

- `StatusError`；
- `/error`、`/no-business`；
- 原位 permission/error 视图；
- business ID 规范化；
- 业务不存在、无业务权限、业务集不存在状态；
- `9900403`、`1306000`、401、HTML session-expiry；
- Vue errorHandler、window error、unhandledrejection、chunk reload。

### B40 深交互

- topology `node` / legacy `tab`；
- 服务实例 create/clone 深链；
- HostApply stage 深链；
- 主机详情返回历史链；
- 模板进程预填。

### B41/B45 模型和实例

- 实例关联列表/拓扑/新增/取消；
- 唯一校验只读详情和内置/模板保护；
- 字段模板 difference/conflict/task polling；
- 字段跨组移动/分组排序；
- 导入“已存在不可导入”；
- 导出密码强度和二次确认；
- 主机关联拓扑/全屏。

## 5. 当前核心 API 六域状态

| 领域 | 当前实现 | mock/真实证据 | 外部阻塞 |
|---|---|---|---|
| IAM | `auth/verify`、resource metadata、permission status、`auth/skip_url` | `run-iam.cjs` 通过 | 真实 IdP、多用户、资源级正式 IAM |
| K8s | KubePods 页面、Pod wrapper、能力探测、阻塞双态 | core-domain mock 通过；本机无 K8s | K8s 数据链路/collector |
| ES | FullTextSearch、`find/full_text`、能力探测、阻塞双态 | core-domain mock/empty/error 通过；本机 ES off | Elasticsearch + index/Monstache |
| 网络采集 | 老版 collector API wrapper、明确阻塞页 | mock 阻塞契约通过；老版无实际页面 caller | collector 服务和设备数据 |
| 服务实例高级 | create/delete preview、template unbind 接线 | service mock 解绑/readback 通过 | 高级流程完整真实数据 fixture |
| 模板生命周期 | 字段差异/冲突/轮询；集群模板主流程 | B41/B45 + mock 通过 | 真实任务失败/重试/暂停数据 |

## 6. Mock 测试和真实测试

### Mock 正常/错误矩阵

```bash
cd src/ui-v3/e2e
node run-iam.cjs
node run-core-domains-mock.cjs
node run-core-domains-errors.cjs
```

Mock 覆盖：

- IAM deny、`auth/skip_url`、网络失败；
- K8s healthy/empty/500；
- ES healthy/empty/500；
- 服务实例解绑请求体与列表读回；
- 网络 collector 阻塞页。

### 真实本地流程

```bash
cd src/ui-v3/e2e
node run-b38.cjs
node run-b39.cjs
node run-b40.cjs
node run-b41.cjs
node run-b45.cjs
node run-login.cjs
```

### 全量结构化回归

```bash
cd src/ui-v3/e2e
UI_V3_REGRESSION_REPORT=/tmp/ui-v3-regression-report.json node run-all.cjs
```

报告字段包括：

- script/testKind；
- 两次 attempt；
- 首跑失败；
- failureClass；
- exitCode；
- duration；
- Mongo quiet window；
- Git commit；
- served bundle；
- manifest evidence。

最近一次完整回归证据：

```text
38/38 scripts passed
```

## 7. 本地部署验证

必须使用 `/tmp/ui-v3-build`：

```bash
rm -rf /tmp/ui-v3-build && mkdir -p /tmp/ui-v3-build
git archive HEAD src/ui-v3 | tar -x -C /tmp/ui-v3-build
# cp 当前批次工作树文件到 /tmp 镜像
cd /tmp/ui-v3-build/src/ui-v3
npm ci --no-audit --no-fund
npm run build

docker --context colima-xwssd cp dist/. cmdb:/data/cmdb/cmdb_webserver/web
docker --context colima-xwssd restart cmdb
curl -fsS http://localhost:8090/ | grep -o 'index-[A-Za-z0-9_-]*\.js' | head -1
curl -s -o /dev/null -w 'web=%{http_code}\n' http://localhost:8090/
curl -s -o /dev/null -w 'healthz=%{http_code}\n' http://localhost:8090/healthz
```

当前环境曾验证过：

```text
web=200
healthz=200
cmdb_webserver running
```

## 8. Colima/K8s/ES 真实集成现状

当前检查结果：

```text
colima: not running
Kubernetes context exists but API server refused
localhost:9200: unavailable
```

因此：

- 不要把当前 K8s/ES mock pass 写成真实集成 pass；
- 如果要做真实 K8s：先 `colima start --kubernetes`，再确认 `kubectl get nodes`，再建立 CMDB 需要的数据填充链路；
- 如果要做真实 ES：启动 ES 以后还需要 `fullTextSearch: on` 和 Mongo→ES 索引同步，单独有 ES Pod 不够；
- 网络采集需要 collector 服务，单独 wrapper 不等于能力完成。

## 9. 内置账号登录

开发默认仍是 skip-login。强制内置账号登录：

```bash
CMDB_LOGIN_VERSION=opensource \
CMDB_SESSION_USERINFO='ops:强密码1,dev:强密码2' \
docker compose -f deploy/standalone/docker-compose.yml up -d
```

契约：

- 未登录访问 → `/login`；
- 错误账号显示后端模板错误；
- 正确账号 → `c_url` 回跳；
- `/userinfo` 返回会话用户；
- `/logout` 真实清 session；
- `login.version` 由 adminserver/ZooKeeper 配置中心生效，单改容器 `web.yaml` 不够。

修复过的真实 bug：

- `LogOutUser` 缺少 `session.Save()`；
- 身份清洗顺序晚于 `RequestIDMiddleware`，误拦服务端 `from-web` 标记；
- 容器中部署 webserver 必须 `GOOS=linux GOARCH=arm64`，不能直接部署 macOS 编译产物。

## 10. Mongo 备份恢复演练

脚本：

```text
deploy/standalone/scripts/backup-mongo.sh
deploy/standalone/scripts/restore-mongo.sh
```

本地演练已通过：

```text
备份 220KB
创建恢复标记
停 cmdb 写入窗口
restore --drop
重启 cmdb
标记消失
分类/业务/主机读写正常
web/healthz 200
```

生产注意：`restore-mongo.sh` 是全量覆盖，必须先停写并完成审批；生产还需要 PITR、异地存储、加密和定期 restore drill。

## 11. 不要做的事

- 不要删除或停用 `src/ui`；
- 不要把 `apiGaps=0` 解释成全部 API contract 已验证；
- 不要把 mock contract pass 解释成真实 K8s/ES/IAM/collector 生产通过；
- 不要把阻塞页解释成依赖能力已完成；
- 不要在没有真实 IAM/secret/TLS/干净环境证据时做生产切流；
- 不要使用 `git add -A`。

## 12. 下一步

如果外部资源到位，按此顺序推进：

1. `colima start --kubernetes`，建立 K8s 数据链路，跑真实 Pod/Container E2E；
2. 启动 Elasticsearch + Mongo→ES 同步，打开 `fullTextSearch`，跑真实 `find/full_text`；
3. 接入真实 collector，验证网络设备/属性 CRUD 和采集任务；
4. 配置真实 IAM/OIDC，多用户跑 allow/deny/cross-user 矩阵；
5. 生产级一进程一容器、TLS、secret manager、SBOM、签名、PITR；
6. 在固定 release commit、镜像 digest、dist hash、数据夹具的干净环境重新跑 B44 放行清单。

当前最准确状态：

```text
本地核心迁移：完成
Mock 契约：完成
本地真实核心 E2E：完成
真实 K8s/ES/collector/云/IAM：等待外部资源
生产放行：未通过
旧前端下线：不允许
```
