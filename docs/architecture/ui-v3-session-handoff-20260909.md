# ui-v3 / standalone 交接文档（2026-09-09）

> 新会话必读。本文是 2026-09-09 的最新状态；旧文档 `ui-v3-session-handoff-20260908.md` 保留作为历史记录。
> 迁移矩阵：`docs/architecture/frontend-migration-matrix.md`
> IAM 设计：`docs/architecture/iam-open-source-design.md`

## 1. 当前基线

- 分支：`standalone-docker`
- 工作区：本次交接时干净
- 最新关键提交：
  - `1a9aae5b96` IAM OIDC client secret 编译修复
  - `804d007892` HostApply 未应用主机列表/批量规则操作
  - `90bc73e81d` HostApply 规则契约修复
  - `6e4b8085e6` 业务拓扑计数/空值/截图对齐
  - `b422fd260a` 首页搜索和业务上下文深链
  - `b5d500460d` 导航上下文和旧版深链兼容
  - `8516ec85dc` 云资源契约、主机 Excel 导入、旧版路由
  - `be6edfaac5` Casbin 策略管理 API
  - `31624775a9` OIDC 登录骨架 + Casbin 边缘授权骨架
  - `ec61c34f0a` 项目新建按钮阻断修复
- 前端目录：`src/ui-v3`
- 旧前端：`src/ui`，仅作为对照基线，暂不下线

## 2. Docker 运行方式：改用 Colima，不再依赖 Docker Desktop

Docker Desktop 已停止使用。当前可用 runtime：

- Colima profile：`colima-xwssd`
- Docker context：`colima-xwssd`
- Docker server：29.5.2
- Guest：Ubuntu 24.04.4 LTS
- 架构：arm64
- 外置盘：`/Volumes/xwssd`
- Colima VM 挂载：`/Volumes/xwssd` → guest
- Docker Desktop 的 `Docker.raw` 已删除；残留 macOS 受保护目录无需继续处理

### 2.1 当前 Colima 启动方式

```bash
colima start \
  --profile colima-xwssd \
  --runtime docker \
  --arch aarch64 \
  --vm-type vz \
  --mount /Volumes/xwssd:w \
  --mount-type virtiofs \
  --disk 100 \
  --cpu 4 \
  --memory 8 \
  --env HTTP_PROXY=http://host.lima.internal:7897 \
  --env HTTPS_PROXY=http://host.lima.internal:7897 \
  --env ALL_PROXY=socks5://host.lima.internal:7897
```

宿主机代理来源：`~/.zshrc` 中的 `js` alias 使用 `127.0.0.1:7897`；Colima VM 内必须改为 `host.lima.internal:7897`。

### 2.2 每次使用 Docker/Compose 前

旧 Docker Desktop 的 credential helper 已不在 PATH，必须使用干净的 Docker config：

```bash
mkdir -p /Volumes/xwssd/docker/colima/docker-config
printf '{"auths":{}}\n' > /Volumes/xwssd/docker/colima/docker-config/config.json

export DOCKER_HOST=unix:///Users/fadewalk/.colima/xwssd/docker.sock
export DOCKER_CONFIG=/Volumes/xwssd/docker/colima/docker-config
export DOCKER_CONTEXT=colima-xwssd
```

Compose 当前用独立命令：

```bash
docker-compose version
```

不要依赖 `docker compose`，本机 Docker CLI plugin 自动发现目前不稳定；`docker-compose` 5.5.1 可用。

### 2.3 构建和启动 standalone

```bash
cd /Volumes/xwssd/code/bk-cmdb

DOCKER_HOST=unix:///Users/fadewalk/.colima/xwssd/docker.sock \
DOCKER_CONFIG=/Volumes/xwssd/docker/colima/docker-config \
docker-compose -f deploy/standalone/docker-compose.yml up -d --build
```

查看容器：

```bash
docker ps
curl -I http://localhost:8090/
```

验证 cmdb 内 13 个服务：

```bash
docker exec cmdb sh -c 'ps -eo args= | grep -oE "\\./cmdb_[a-z]+" | sort -u'
```

期望包含：`adminserver/apiserver/cloudserver/coreservice/cacheservice/toposerver/hostserver/procserver/eventserver/taskserver/datacollection/operationserver/webserver`。

### 2.4 外置盘验证

```bash
docker run --rm -v /Volumes/xwssd:/mnt alpine:3.20 \
  sh -c 'echo external-mount-ok > /mnt/docker/colima/verify.txt && cat /mnt/docker/colima/verify.txt'
```

镜像/容器数据主要在 Colima VM 的磁盘中；项目目录和显式挂载数据放在 `/Volumes/xwssd`。

## 3. 已完成的 UI / 后端工作

### 3.1 页面迁移和对齐

- 资源、业务、模型、运营、平台菜单页已逐页对齐旧版结构和主要交互
- 资源目录改为老版卡片瀑布流
- 业务拓扑已按截图对齐：
  - 根业务节点
  - 空闲机池在前
  - 节点主机计数（包括 0）
  - with_biz 真实模块/集群名称
  - Default Area[0]
  - 编辑/转移/追加/复制/更多/导出/收藏/筛选
  - 主机列排序和字段设置
- 项目新建阻断已修复：之前引用不存在的 `typeOptions`，现在使用 `projectTypeOptions`
- 项目新建已真实验证：创建 → `findmany/project` 回读 → 删除清理

### 3.2 真实契约修复

- 项目 `updatemany/deletemany` 的 ids 必须数字 `id`，不是 `bk_project_id` hash
- 项目描述字段是 `bk_project_desc`
- 业务创建必须传 `language: "1"`
- 资源池删除主机 `/hosts/batch` 需要顶层 `{bk_host_id, bk_supplier_account}`，不能再包 `data`
- 业务集属性查询使用 `bk_biz_set_obj` + `/find/objectattr/web`
- 关联实例使用带 `object/:obj/inst_id/:id/.../web` 路由
- Excel/table 路由挂根路径，不能默认使用 `/api/v3`
- webserver 导出全部空条件 bug 已修复并固化进镜像

### 3.3 HostApply

已完成并提交：

- 模块/模板规则查询
- 三步配置 → 预览 → 执行轮询
- 未应用主机列表：复用 preview plans 展示主机、变更字段、冲突
- 批量删除：先查询真实 rule IDs，再按后端契约删除
- 批量编辑复用真实 preview/run
- additional_rules 使用数值属性 ID，并补目标模块/服务模板 ID
- 模板查询补 `bk_biz_id`
- 删除 body nesting 修复

注意：后端任务 status 只有任务级结果，没有旧版按主机失败原因的完整结果，所以不能宣称完全复刻 failed-list 的每主机失败原因。

### 3.4 IAM 当前状态

提交：

- `31624775a9`：OIDC 登录骨架 + Casbin 边缘授权骨架
- `be6edfaac5`：Casbin 策略管理 API
- `1a9aae5b96`：OIDC 编译修复

已有：

- OIDC Authorization Code + PKCE
- state/nonce/verifier Redis session
- `/login/oidc/start`
- `/login/oidc/callback`
- OIDC 用户写入现有 session
- opaque `bk_token` cookie 兼容当前登录校验
- Casbin path/object/action 边缘授权
- 默认 bootstrap admin
- `/iam/me/permissions`
- `/iam/policies`
- `/iam/groupings`
- `/iam/policy/reload`

默认配置仍关闭：

```yaml
webServer:
  oidc:
    enabled: false
  auth:
    enabled: false
```

所以当前 standalone 仍是 `skip-login`，不需要 IdP 即可运行。

尚未完成：

- Casbin MongoDB 持久化
- 资源级实例过滤
- 权限管理前端
- 测试 IdP OIDC E2E
- 替换 `ac/iam`/蓝鲸 ESB IAM 的资源级决策

## 4. 当前明确剩余事项

### P1：HostApply 深度收口

- 批量编辑目前复用当前节点向导，下一步应支持多目标分别组装 `additional_rules`
- 未应用列表已能展示 plans，但需要验证执行时从列表直接应用的用户体验
- 失败列表目前无法按主机精确显示失败原因，后端没有足够结果接口

### P1：Pod/Container

旧版有 Pod/Container 详情和主机详情相关 tab；ui-v3 目前没有完整 K8s 数据链路，继续标记依赖阻塞。不要为了“看起来完成”伪造数据。

### P1/P2：首页全文检索

依赖 ES。当前首页全文检索 tab 是禁用态并提示未开启，等 ES 数据链路和部署 profile 明确后再做。

### P2：IAM 资源级权限

建议顺序：

1. Casbin 策略 Mongo 持久化
2. `ListAuthorizedResources` 等资源级接口
3. 业务域过滤
4. 创建者自动授权
5. ui-v3 权限指令/按钮态
6. 测试 IdP E2E

### P3：旧版低频交互

- 业务拓扑“追加至”目前外观是 dropdown，但实际直接打开追加对话框；核心功能可用，后续可修成真正菜单
- 首页页脚外部链接已补
- ModelManage “更多详情”仍需决定外链地址

## 5. 验证命令

### 前端

```bash
cd /Volumes/xwssd/code/bk-cmdb/src/ui-v3
npm run build
```

### E2E（需要 Colima standalone 运行在 8090）

```bash
cd /Volumes/xwssd/code/bk-cmdb/src/ui-v3/e2e
node run-all.cjs
node run-route-smoke.cjs
```

### Go IAM focused tests

```bash
cd /Volumes/xwssd/code/bk-cmdb
go test -vet=off -tags=disable_crypto \
  ./src/web_server/middleware/authorization \
  ./src/web_server/middleware/user/plugins/method/oidc \
  ./src/web_server/middleware \
  ./src/web_server/service
```

### Docker/Colima

```bash
export DOCKER_HOST=unix:///Users/fadewalk/.colima/xwssd/docker.sock
export DOCKER_CONFIG=/Volumes/xwssd/docker/colima/docker-config
export DOCKER_CONTEXT=colima-xwssd
cd /Volumes/xwssd/code/bk-cmdb
DOCKER_HOST=$DOCKER_HOST DOCKER_CONFIG=$DOCKER_CONFIG \
  docker-compose -f deploy/standalone/docker-compose.yml up -d --build
```

## 6. 新会话建议开工顺序

1. 先确认 Colima：`docker info`、`docker ps`、`curl -I http://localhost:8090/`
2. 跑 `run-all.cjs`，若固定测试数据缺失，优先将测试改成动态选择真实业务/模块，不伪造数据
3. 完成 HostApply 多目标批量编辑体验
4. 进入 IAM 资源级权限和策略持久化
5. 最后再评估 Pod/K8s、ES 全文检索和旧前端下线

## 7. 注意事项

- 不要再使用 Docker Desktop；当前只用 Colima profile `colima-xwssd`
- 不要把管理员密码写入命令、文档、环境变量或提交
- 不要 `git add -A`；每批按功能文件显式 add
- 不要把 `.playwright-mcp/`、临时 png、测试输出文件提交
- Docker 构建时如果遇到 `docker-credential-osxkeychain`，使用 `/Volumes/xwssd/docker/colima/docker-config` 的空 auth config
- Docker Desktop 残留的 macOS 受保护目录无需继续处理，不影响 Colima
