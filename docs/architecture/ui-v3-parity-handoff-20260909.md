# ui-v3 / standalone 前端 parity 交接文档（2026-09-09）

> 本文记录本轮“新前端对齐旧前端交互、接口和 UI 风格”后的真实状态。
> 不把“页面存在”或“构建通过”误标为“完整替代”。
>
> 相关文档：
>
> - `docs/architecture/frontend-migration-matrix.md`
> - `docs/architecture/ui-v3-session-handoff-20260909.md`
> - `src/ui-v3/REPLACE_OLD_UI.md`

## 1. 当前基线

- 分支：`standalone-docker`
- 最新 parity 提交：`59eb261154 feat(ui-v3): restore host history and topology workbenches`
- 前置提交：
  - `30b2c291df fix(ui-v3): align legacy interaction contracts`
  - `7076032ada fix(ui-v3): complete host apply multi-target editing`
- 前端目录：`src/ui-v3`
- 旧前端：`src/ui`，仍保留作为交互和视觉基线

### 当前是否已经重新构建并启动？

> **2026-09-09 更新（业务导航 parity 批次后）**：`src/ui-v3` 已重新构建，最新 dist 已 `docker cp` 到容器 `/data/cmdb/cmdb_webserver/web`，容器内 `cmdb_webserver` 已重启，8090 已确认返回最新 index.html（哈希与本地 dist 一致）。本节以下原文描述的是更新前的状态，仅作历史记录。

1. **前端源码构建：已完成**
   ```bash
   cd /Volumes/xwssd/code/bk-cmdb/src/ui-v3
   npm run build
   ```
   结果：Vite 构建成功，2351 个模块转换完成。只有既有 `iconcool` 字体资源构建时无法解析的 warning，不影响构建结果。

2. **Standalone Docker 镜像/容器：本轮没有重新构建启动**
   - Colima 下的 `cmdb` 容器当前仍在运行，启动时间约 8 小时。
   - 本轮没有执行 `docker-compose up -d --build`。
   - 本轮没有把新生成的 `src/ui-v3/dist` 复制到容器。
   - 本轮没有重启容器内的 `cmdb_webserver`。
   - 因此，`localhost:8090` 当前不能自动视为已经提供本轮最新 dist。

> 如果要让浏览器/8090 使用本轮最新前端，必须按第 3 节重新构建或部署 dist，并重启容器内 `cmdb_webserver`。仅运行 `npm run build` 不会改变正在运行的容器内容。

## 2. 本轮已完成的 parity 工作

### 2.0 业务导航交互契约批次（2026-09-09 晚，commit 81d3239e2a / 5d115a0a4f）

业务一级导航下七个二级菜单（业务拓扑/服务模板/集群模板/服务分类/主机自动应用/动态分组/自定义字段）从"仅菜单同名"补齐为旧版交互契约：

- 规范 URL 恢复旧版语义：`/business/:bizId/index`、`/business/:bizId/service/template`、`/business/:bizId/set/template`、`/business/:bizId/service/cagetory`、`/business/:bizId/host-apply`、`/business/:bizId/custom-query`、`/business/:bizId/custom-fields`；旧平铺路径（`/business/topo` 等）由全局守卫补齐业务 ID（`?biz=` → localStorage `selectedBusiness` → 业务列表首个）后重定向。
- 复刻旧版 `business-interceptor`：业务视图间切换业务整页刷新；规范路由同步 biz store 与 localStorage。
- 新增 `BizMixSelector`（对齐旧版 `cmdb-business-mix-selector`）：业务+业务集混合下拉、`name (id)` 展示、业务集角标、收藏星标置顶（`POST /usercustom` 持久化，key `business_selector_collection`）、底部新建业务/业务集入口。切换业务(集)后落到对应拓扑页并整页刷新。
- 复刻旧版 `dynamic-navigation` 折叠交互：默认 260px；取消固定后 60px 仅图标，悬停展开、移开 300ms 收回；底部固定按钮按旧版 `navStick` localStorage 语义持久化。
- 标题栏对齐旧版 `dynamic-breadcrumbs`（commit 5d115a0a4f）：仅当前页名的单级标题栏，去掉"业务/X"两级面包屑；子页（模板详情/主机详情等）显示返回箭头回所属菜单规范页；删除服务模板/服务分类/资源目录页内可见 h1 的双重标题；业务同步等无菜单路由按 `meta.title` 显示标题栏，首页除外。
- 已知取舍：下拉未做旧版的滚动分页与拼音搜索（standalone 数据量小）；业务集列表经 `/findmany/biz_set` 读取。
- 页面布局对齐（commit 34c82514c9）：服务模板/集群模板拆为旧版同构独立页（去页内 tab），新建在左/筛选在右，列对齐旧版（服务分类显"一级/二级"、进程数量 0 显未配置）、列表 ID 待同步红点（svc `sync_status/biz` + `set_template_sync_status` 契约），集群模板同步/历史入口移入详情抽屉；修复动态分组页缺失 `useRoute` 导入导致的整页空白，工具栏对齐旧版（新建左/名称搜索右）；自定义字段页经截图核对结构与旧版一致（tips + 集群/模块/主机 tab + 分组卡片），未改动。

### 2.1 主机详情历史记录

文件：`src/ui-v3/src/views/hosts/HostDetail.vue`

已接入旧版 `cmdb-audit-history` 对应的真实链路：

- 日期范围筛选，默认当天。
- 操作账号筛选。
- 分页和分页大小切换。
- 历史记录表格：动作、账号、操作实例、操作时间。
- 点击记录打开详情抽屉。
- 详情展示操作元信息和字段前后值。
- 支持展开原始 `operation_detail` JSON。
- 旧版 `tab=history` 深链进入后自动加载。
- 资源池主机按旧版语义使用业务 ID `1` 查询审计。

API 新增：

- `GET /find/audit_dict`
- `POST /find/inst_audit`

### 2.2 服务实例独立页

文件：`src/ui-v3/src/views/service/ServiceInstance.vue`

已补齐旧版独立服务实例页的主要操作：

- 表格多选。
- 批量删除。
- 批量编辑标签。
- 复制选中实例的主机 IP。
- 全部展开 / 全部收起进程。
- 单行展开时真实查询该服务实例进程。
- 进程编辑、删除入口。
- 按 `service_template_id + bk_module_id` 分组执行模板同步。
- 保留单条删除、克隆、进程创建和进程更新。

接口契约修复：

- 服务实例删除改为 `DELETE /deletemany/proc/service_instance`。
- 进程查询统一使用 `searchProcessInstances(serviceInstanceId, page)`。
- 进程更新使用 `PUT /update/proc/process_instance/by_ids`。

### 2.3 业务集拓扑工作台

文件：`src/ui-v3/src/views/biz-set/BizSetTopo.vue`

新页面已从“业务集列表 + 通用业务列表”升级为真实业务集工作台：

- 左侧业务集搜索和选择。
- 真实业务集业务列表与拓扑树。
- 拓扑节点主机数/服务实例数统计。
- 右侧三个 Tab：主机、服务实例、节点信息。
- 主机列表按当前拓扑节点条件查询。
- 服务实例仅在模块节点上展示。
- 服务实例展开查询真实进程。
- loading/error/empty 状态完整。
- 不使用模拟业务、模拟主机或模拟服务实例数据。

新增专用 API：

- `/findmany/biz_set`
- `/find/biz_set/biz_list`
- `/find/biz_set/topo_path`
- `/count/topoinst/host_service_inst/biz_set/{id}`
- `/findmany/hosts/biz_set/{id}`
- `/findmany/proc/biz_set/{id}/service_instance`
- `/findmany/proc/biz_set/{id}/process_instance`

业务集主机查询会带当前节点条件，使用旧版对应的：

```json
{
  "condition": [
    {
      "bk_obj_id": "biz | set | module",
      "condition": [
        {
          "field": "bk_biz_id | bk_set_id | bk_module_id",
          "operator": "$eq",
          "value": 123
        }
      ]
    }
  ]
}
```

### 2.4 前置已完成的 HostApply parity

前一批提交已完成：

- 树多选。
- 多目标批量编辑。
- `additional_rules` 按目标展开。
- `remove_rule_ids`。
- 真实 `info` / `task_info` 响应解析。
- 任务超时不再伪装成成功。
- 批量删除和启用状态修复。

## 3. 如何让最新前端进入 standalone 容器

### 3.1 准备 Colima Docker 环境

```bash
mkdir -p /Volumes/xwssd/docker/colima/docker-config
printf '{"auths":{}}\n' > /Volumes/xwssd/docker/colima/docker-config/config.json

export DOCKER_HOST=unix:///Users/fadewalk/.colima/xwssd/docker.sock
export DOCKER_CONFIG=/Volumes/xwssd/docker/colima/docker-config
export DOCKER_CONTEXT=colima-xwssd
```

确认：

```bash
docker info
docker ps
```

### 3.2 重新构建并启动 standalone

```bash
cd /Volumes/xwssd/code/bk-cmdb
DOCKER_HOST=$DOCKER_HOST \
DOCKER_CONFIG=$DOCKER_CONFIG \
docker-compose -f deploy/standalone/docker-compose.yml up -d --build
```

确认 8090：

```bash
curl -I http://localhost:8090/
```

根路径返回 `/` 到 `/#/404` 的 302 属于当前 web_server 的无匹配路由行为，不等于容器未启动。浏览器应访问具体 hash 路由，例如：

- `http://localhost:8090/#/index`
- `http://localhost:8090/#/business/topo`
- `http://localhost:8090/#/biz-set/topo`
- `http://localhost:8090/#/resource/host`

### 3.3 若只更新 dist，不重建全部镜像

谨慎使用，仅适用于确认容器内 web 静态目录和项目部署约定未变化的情况：

```bash
cd /Volumes/xwssd/code/bk-cmdb/src/ui-v3
npm run build

# 先确认容器内静态目录，不要盲目覆盖未知目录
export DOCKER_HOST=unix:///Users/fadewalk/.colima/xwssd/docker.sock
export DOCKER_CONFIG=/Volumes/xwssd/docker/colima/docker-config
export DOCKER_CONTEXT=colima-xwssd

docker exec cmdb sh -c 'ps -eo args= | grep "./cmdb_webserver" | grep -v grep'
```

交接约束：如果采用 `docker cp` 更新 dist，必须重启容器内 `cmdb_webserver`，否则旧进程可能继续提供旧的 `index.html` 和 chunk。重启前先确认旧进程已退出，避免端口代理竞争。

## 4. 验证命令和结果

### 4.1 已通过

```bash
cd /Volumes/xwssd/code/bk-cmdb/src/ui-v3
npm run build
```

结果：通过。

```bash
cd /Volumes/xwssd/code/bk-cmdb/src/ui-v3/e2e
node run-route-smoke.cjs
```

结果：通过，包含旧版业务/业务集/主机/平台深链，无 pageerror/console.error。

```bash
cd /Volumes/xwssd/code/bk-cmdb
git diff --check
```

结果：通过。

### 4.2 完整 E2E 当前结果

```bash
cd /Volumes/xwssd/code/bk-cmdb/src/ui-v3/e2e
node run-all.cjs
```

当前失败点在 `run-b8.cjs` 的旧选择器：

```js
page.locator('.el-card .el-table .el-table__row')
```

该测试仍按旧版业务集页面结构查找业务行，而新版业务集页面已经改为：

- 左侧业务集列表。
- 中间拓扑树。
- 右侧主机/服务实例/节点信息工作台。

因此这是 **E2E 选择器/断言过期**，不是构建错误，也不是页面运行时错误。后续应把 `run-b8.cjs` 改为断言：

- `.bs-item` 业务集存在。
- `.topology-panel` 拓扑树/空态存在。
- `.detail-panel` 三个 Tab 存在。
- 后端有真实节点时断言拓扑节点、主机表或服务实例表。

不要通过放宽断言来掩盖真实数据链路问题。

## 5. 当前运行态结论

最近一次核对：

- 当前分支：`standalone-docker`
- `cmdb` 容器：运行中。
- `cmdb-redis`：healthy。
- `cmdb-zookeeper`：healthy。
- `cmdb-mongodb`：healthy。
- `curl -I http://localhost:8090/`：返回 302 到 `/#/404`。
- 本轮没有重新构建 Docker 镜像，也没有重启容器内 `cmdb_webserver`。
- 因此浏览器 8090 当前不应默认认为已加载本轮最新 dist。

## 6. 下一步建议

按优先级：

### P0：先完成部署验证

1. 执行第 3.2 节的 `docker-compose up -d --build`。
2. 确认 13 个 standalone 服务仍在容器内运行。
3. 打开具体 hash 路由确认新 dist 已生效。
4. 重新执行路由 smoke。

### P1：更新 B8 E2E

修改：`src/ui-v3/e2e/run-b8.cjs`

- 移除旧 `.el-card .el-table` 业务集断言。
- 改为新工作台 DOM 和真实 API 响应断言。
- 增加拓扑节点选择后主机请求 body 的节点条件断言。
- 增加模块节点服务实例和展开进程请求断言。

### P1：补充真实数据回归

在 standalone 上使用真实业务/业务集/模块/服务实例：

- 主机详情历史：验证列表、日期筛选、详情抽屉。
- 服务实例：验证两条实例批量删除、标签批量写入、模板同步、全部展开。
- 业务集拓扑：验证业务集→业务→集群→模块→主机/服务实例/进程链路。

### 依赖阻塞，暂不伪造

- Pod/Container：等待 Kubernetes 数据链路。
- 首页全文检索：等待 ES 数据链路。
- IAM：OIDC/Casbin 资源级持久化、实例过滤、按钮权限和 E2E 尚未完成。

## 7. 交接注意事项

- 不使用 Docker Desktop，只使用 `colima-xwssd`。
- 不使用 `git add -A`，按功能文件显式暂存。
- 不提交 `.playwright-mcp/`、截图、临时输出和构建临时文件。
- 修改 dist 后必须重启 `cmdb_webserver`，否则可能继续提供旧前端。
- 不能用空数组/全量列表冒充业务集节点过滤结果。
- 不能在 Pod、ES、IAM 依赖未就绪时伪造数据或宣称完整替代。
