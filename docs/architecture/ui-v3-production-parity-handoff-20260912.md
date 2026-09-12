# ui-v3 全量替代与生产化交接计划

> 交接日期：2026-09-12  
> 当前分支：`standalone-docker`  
> 目标：让 `src/ui-v3` 真正替代 `src/ui`，不仅页面可见或主流程可用，而是达到旧版页面、深链、交互、真实 API 读写、权限/异常和生产运维门禁。

## 0. 新会话先读什么

新会话开始时按以下顺序读取：

1. 本文：`docs/architecture/ui-v3-production-parity-handoff-20260912.md`
2. `AGENTS.md`
3. `docs/architecture/frontend-migration-matrix.md`
4. `docs/architecture/standalone-security-boundary.md`
5. `docs/architecture/standalone-reliability-runbook.md`
6. `src/ui-v3/src/views/Roadmap.vue`
7. 当前 `git status`、`git log -8 --oneline`

`src/ui` 永远是 UI、交互和 API 契约事实源。不要根据截图臆造行为，也不要把“有路由/有页面/一次 E2E 通过”写成完整替代。

## 1. 当前结论：不能生产放行

当前新版适合：

- 本机开发；
- 隔离网络联调；
- 单管理员验收；
- 已知依赖条件下的功能演示。

当前不满足：

- 多用户生产；
- 对外网暴露；
- 正式登录与用户责任追踪；
- 资源级 IAM；
- 老前端全部深度交互 1:1 替代；
- 可验证备份恢复和版本回滚。

### 生产阻断原因

1. standalone 默认 `skip-login + admin + auth disabled`，8090 可暴露；
2. v3 HTTP 层固定发送 `X-Bkcmdb-User: admin`、supplier `0`；
3. Web 身份头使用追加语义，存在客户端同名头污染真实身份/审计主体的风险；
4. Casbin/权限目前不是持久化、默认 deny、资源级、可审计的正式 IAM；
5. standalone 是 nohup 多进程单容器，子进程退出后容器可能仍显示 Up；
6. Mongo/Redis/ZK/Session/云凭据仍有默认密码、无认证或 TLS 校验关闭问题；
7. 没有完成 Mongo PITR、恢复演练、原子发布和可验证回滚；
8. Pod/K8s、ES 全文检索和真实云同步分别受外部数据链路阻塞；
9. 多个老版深交互被压成 query、抽屉或工作台，尚未完全恢复。

**结论：旧前端不得下线；新前端不得对外宣称全量生产替代。**

## 2. 当前已交付基线

最近的已推送提交：

- `1101946087`：资源列表表格、字段配置抽屉、usercustom、排序/分页契约（B31）；
- `c3aac7d743`：资源侧栏动态收藏，恢复截图中的 8 项入口（B36）；
- `0fd9e9f938`：全局配置起始 ID 标签/数字三列对齐；
- `cdd38a082c`：菜单基线与 E2E 汇总（B35）。

当前 8090 的验证基线曾确认：

- 资源菜单：资源目录、项目、业务集、业务、主机、管控区域、云账户、云资源发现；
- HostList：资源池目录数量、scope/directory、列配置、排序、分页；
- Business/Project/BizSet：表格列配置与 usercustom；
- GlobalConfig：起始 ID 三列数字字段坐标统一；
- 关键脚本：B7、B9、B24、B28、B30、B31、B32、B35、route-smoke 等。

这些只证明对应批次通过，不证明全量生产就绪。

## 3. 统一“完整替代”定义

每项能力必须同时达到以下 10 个维度：

1. **页面**：旧版可见页面、标题、文案、图标和布局有新版等价物；
2. **交互**：点击、悬停、抽屉、弹窗、确认、取消、拖拽、轮询、重试时机一致；
3. **深链**：旧 URL 可打开，刷新/复制新会话/后退/返回链不丢 `bizId`、`node`、`topo_path`、`tab`、`scope`、`directory`、`filter`、`page`、`sort` 等；
4. **API**：路径、method、前缀（`/api/v3` 或 Web Server 根路径）、payload 和 response shape 与老版/后端注册一致；
5. **写回**：创建/编辑/转移/同步/导入/导出/删除有真实读回；
6. **权限**：页面、父子权限、relation、按钮和后端 401/403 都正确；
7. **异常**：loading、default/search/permission/error 空态、失败/部分失败/取消/重试、未保存离开完整；
8. **视觉**：1440×900 旧/新截图和 DOM 尺寸探针对照；
9. **E2E**：专门脚本使用真实 API/夹具，不因零数据跳过关键能力；
10. **部署**：`/tmp` 构建、部署、restart、served bundle hash、健康检查和回滚证据齐全。

状态只允许：

```text
未迁移 / 部分迁移 / 核心流程 / 完整替代 / 依赖阻塞 / 生产阻断
```

## 4. 迁移批次路线（新会话从 B37 开始）

### B37：安全身份与生产启动门禁（P0）

先做，没完成不能谈生产。

- 移除 v3 `http.js` 固定 admin/supplier；接入可信 session/userinfo/config；
- Web 入口删除外部同名身份头，认证成功后 `Header.Set` 重建；拒绝多值身份头和伪造 inner-request；
- 顶栏显示真实当前用户；实现真实 logout、session 过期和重新登录；
- 非开发 profile 禁止 `skip-login + auth disabled + 外部监听`；API Key 缺失/错误均 401；
- OIDC/OAuth2 或受信 API Key 真实 E2E；默认 deny；
- admin/migrate API 独立管理面、网络和审计；
- Mongo/Redis/ZK/Session/云凭据外置、随机化、轮换；TLS 校验不能默认关闭；
- 增加身份污染、跨用户 usercustom、无权限、退出、过期测试。

**B37 门禁：**真实登录、logout、身份头清洗、API fail-closed 未通过，不得部署到共享/生产。

### B38：前后端 API 契约清理（P0/P1）

- 删除 `searchHostDetail` 对未注册 `/host/search` 的首请求，改真实 `/findmany/hosts/search/{with_biz|resource|noauth}`；
- 处理/删除未注册 `/hosts/snapshot/:id`；
- 修复字段分组移动/删除路径：`/update/objectattgroupproperty` 和后端要求的 owner/object/property/group delete 路径；
- 清理/修复 `searchHostInstAssoc` 死接口；把 `getLabelHistory` 改为 aggregation 或补真实 history；
- 清除 supplier/owner 固定 `0`，统一可信环境来源；
- ModelManage 导入/导出移除原生 fetch 的 admin header，统一 HTTP、超时、错误、取消、权限；
- 建 API 注册扫描：v3 每个导出 API 对应后端注册；标注 `/api/v3` 与根路径接口；
- 每个写 API 有 contract test（路径、method、payload、response、错误码、读回）。

### B39：路由、权限、错误状态完整替代（P0/P1）

- 将老版 `auth.view/superView/relation/checkAvailable` 映射到 v3 route meta/beforeEach；
- 复刻业务/业务集 interceptor：默认业务、无业务、未授权、业务不存在、切换 reload、bizId 规范化；
- 统一 `/404`、`/error`、`/no-business`、permission 视图；403 不能变空表；
- 接入 Vue `app.config.errorHandler`、`onErrorCaptured`、`window.onerror`、`unhandledrejection`；
- 逐页复核 relation/按钮权限与 disabled/hidden 语义；
- 更新菜单与迁移矩阵，清理“完成”与事实冲突。

### B40：主机/拓扑/服务实例深交互

- 主机详情补属性、服务实例、Pod、关联（列表/拓扑/新增/全屏）、变更历史及多上下文返回链；
- HostApply 恢复 `stage` 深链（配置/预览/冲突/执行/失败/重试/主机状态）；
- HostTransfer 恢复副作用预览 tab（服务实例新增/删除、移空闲、属性自动应用、冲突解决）；
- 服务实例恢复 create/clone 深链、主机选择、模板进程预填、bind_info、无进程校验、主动修改提交语义；
- 业务/业务集拓扑恢复 `node/topo_path/tab`、容器懒加载、统计 pending/error、创建后树刷新。

### B41：模型/字段模板/详情关联深度

- 项目、业务集、通用模型实例详情补关联 tab、列表/拓扑、内置保护、历史；
- 自定义字段补导入、导出、分组/字段拖拽、跨组移动、editable/required/placeholder；
- 字段模板补绑定/同步第三步确认、字段/唯一差异、冲突、paused、权限、结果和深链；
- 模型导入导出复刻须知→上传→确认→设置→结果/重试，逐行失败、关联排除、密码/过期；
- 模型详情字段/关系/唯一校验逐项 CRUD 读回和内置保护。

### B42：Pod/Kubernetes、全文检索、真实云依赖

- 有 Kubernetes 数据链路时迁移 Pod/Container 列表、动态字段、详情、深链回拓扑；没有时提供明确依赖阻塞页，不得 NotFound；
- ES 开启时实现全文结果类型、详情跳转、错误态；关闭时显示能力状态；
- 用真实测试云账号验证连通、地域/VPC、发现任务、轮询、失败/重试、自动建管控区域和删除约束；云密钥不入日志/前端。

### B43：可靠性、发布、灾备

- standalone 改一进程一容器/Pod，或 supervisor；子进程退出必须被感知/拉起；
- `/livez`、`/readyz`、依赖状态和 deadline；服务独立探针；
- Change Stream Retry/TokenExpired/FullRebuild/Ready 状态机、进度、主库缓存对账；去掉业务 Fatal；
- 锁 compare-delete、租约续期、fencing token；
- `npm ci`、镜像 digest、非 root、只读 rootfs、SBOM、扫描、签名；
- Mongo 全量+oplog/PITR、加密/异地/保留/restore drill；明确 Redis/ZK 可丢边界；
- 版本化静态目录、原子切换、健康门禁、自动回滚；数据库 migration forward/rollback 演练；
- PrometheusRule、Grafana、SLO、trace-log correlation、脱敏日志和告警。

### B44：旧前端下线前全量放行

在干净环境固定 release commit、镜像 digest、dist hash、数据夹具和外部依赖版本，完成：

- 老/新 route/menu/API manifest 逐项比较；
- 所有旧可见菜单和深链打开/刷新/后退；
- 每个写流程真实创建/回读/编辑/删除清理；
- 权限与错误矩阵；
- 1440×900 截图与 DOM 探针；
- API contract、E2E、Go unit/race/integration；
- 子进程 kill/restart、依赖故障、缓存重建、备份恢复；
- migration forward/rollback；
- SBOM/漏洞/签名/日志脱敏；
- served bundle hash 等于 release artifact。

以下任何一项未通过，旧前端不得下线：

```text
存在未迁移核心页面
存在未修复 P0/P1 API 契约
存在固定 admin/skip-login 生产路径
存在未验证权限/异常状态
存在未验证关键写回
存在未演练备份/回滚
外部依赖被伪装成已完成
全量回归非干净环境通过
```

## 5. 下一轮执行规则

新会话直接从 B37 开始，不要先继续做视觉细节：

1. 建立 `docs/architecture/ui-v3-parity-register.yaml`，逐项登记 legacy route、v3 route、页面、交互、API、回读、权限、异常、视觉、深链、E2E、依赖和证据；
2. 建立 `scripts/ui-v3/audit-parity.cjs` 扫描旧/新菜单、路由和 API 注册差异；
3. 每批只修改明确文件，不使用 `git add -A`，不混入并行会话/本地规则文件；
4. 每批走 `/tmp/ui-v3-build`，复制所有本批修改文件后构建；
5. 每批保留首跑失败原因，不用自动重跑掩盖环境问题；
6. B37/B38 完成前不进行生产宣传或旧前端下线；
7. B43 完成前不做正式生产切流；
8. B44 通过后才允许删除/停用旧前端。

## 6. 计划交付物

- 本交接文档；
- `docs/architecture/ui-v3-parity-register.yaml`；
- `scripts/ui-v3/audit-parity.cjs`；
- 各批真实数据夹具和回读报告；
- API 注册/契约扫描报告；
- 权限矩阵报告；
- 新旧截图/DOM 对照报告；
- 生产安全检查表；
- 备份恢复与回滚演练记录；
- release commit、镜像 digest、dist hash、回退版本。

## 7. 当前明确不可宣称的事项

- 不能宣称 Vue3 已全量替代 Vue2；
- 不能宣称已具备正式 IAM；
- 不能宣称 skip-login standalone 可安全生产；
- 不能宣称 Pod/K8s、ES 全文检索、真实云同步已完成；
- 不能把“路由存在、页面打开、空数据 E2E 通过”写成真实功能完成；
- 不能删除旧前端或停止保留旧路由。
