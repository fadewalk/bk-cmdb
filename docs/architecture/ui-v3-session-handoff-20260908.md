# ui-v3 迁移会话交接（2026-09-08）

> 新会话必读。本文件记录 ui-v3 替代旧前端的当前状态、验证方式、剩余事项。
> 配套文档：`docs/architecture/frontend-migration-matrix.md`（全量迁移矩阵，状态权威来源）

## 项目状态总览

- **目标**：ui-v3 (Vue3+ElementPlus+Vite) 完全替代 `src/ui` 老前端，1:1 对齐页面/交互/UI，之后在此基础上演进新功能
- **分支**：standalone-docker；所有工作已提交（最新提交含到 `948c9da14c` 之后）
- **部署**：本地 Docker 容器 `cmdb`，web 端口 8090；老前端仍可访问 8091
- **E2E**：`src/ui-v3/e2e/run-all.cjs`（10 个脚本）全量通过；playwright 从 `/tmp/e2e` 加载，必须带 no-cache 路由钩子

## 已完成（全部经真实数据/浏览器验证）

1. **全量菜单页对齐**（23 页爬虫对比 + 交互验证）：资源 8 页、业务 7 页、模型 4 页、运营 2 页、平台 1 页、首页
2. **旧版深链兼容**（在 `src/ui-v3/src/router/index.js`）：
   - `business/:bizId/index`、`business/:bizId/host/:id`、`resource/host/:id`、`resource/host/:business/:id`
   - `business-set/:bizSetId/{index,host/:id}`、`host-landing/:ip/:cloudId?` → `/resource/host?ip=...&cloudId=...`
   - `business/:bizId/service/template/{create,details/:id,edit/:id}`、`operational/template/:id?` → details
   - `business/:bizId/host-apply/:rest(.*)*` → `?mode=module|template`
   - `business/:bizId/set/{template,sync}` 系列 → `?action=create|details|sync|history&templateId=`
   - `business/:bizId/synchronous/module/:t/:m` → `/business/sync?template=&modules=`
   - `business/details/:bizId` → `/resource/business/details/:bizId`
   - `platform-management/global-config` → `/platform/global-config`（tab query 兼容老版命名）
   - `resource/instance/:objId/:instId` → `?instId=`
3. **页面级 CRUD 打通**（契约均 curl 探测 + 回读验证）：
   - 业务：新建(table/biz/0 根路径!)/编辑/归档/恢复/彻底删除；详情(属性/关联/变更历史)
   - 业务集：create `{bk_biz_set_attr, bk_scope}` / update `{bk_biz_set_ids, data:{bk_biz_set_attr}}` / delete `{bk_biz_set_ids}`
   - 项目：createmany `{data:[...]}`（类型枚举来自 bk_project 模型属性）/ update `{ids, data}` / delete `{ids}`；bk_project_id 是字符串 hash
   - 模型实例：列表/搜索/分页/增删改/批量删除(`{delete:{inst_ids}}`)/变更历史(/find/inst_audit 需 resource_type=model_instance)/列配置(localStorage)/Excel 导入导出
   - 云账户：create(需 bk_secret_id/key，密钥不回显)/列表/删除
4. **云功能进核心**：cmdb_cloudserver 编译(linux/arm64, `-tags=disable_crypto`)部署进容器，`--enable-auth=false --enable-cryptor=false`；Dockerfile core targets 与 run.sh(13 进程) 已更新
5. **服务模板详情双 tab**（进程配置/模块实例），模块实例带 need_sync 红点（契约 `/findmany/proc/service_template/sync_status/biz/{id}`，参数 `{bk_module_ids, service_template_id}`，返回 `[{bk_inst_id,status,last_time,fail_tips}]`）
6. **服务实例克隆**：业务拓扑实例行「克隆」→ 目标模块 + 进程照搬（createServiceInstance）
7. **进程模板动态全量字段**（21 属性，枚举/bool/int 控件），覆盖式更新 as_default_value 语义
8. **全局配置**：三 tab、未保存确认、tab query 兼容、**保存必须读全量→改→交全量**（局部提交被后端全量校验拒绝）
9. **修复的系统性 bug**（老版同类问题全部排查）：
   - web_server excel/table 路由挂**根路径**而非 /api/v3：hosts/import、hosts/export、insts/object/*/export、importtemplate/*、table/biz/*、table/update/instance/*（axios 需 `{baseURL:''}`）
   - 关联实例裸路径 `/findmany/inst/association` 是 404，正确契约 `/findmany/inst/association/object/{obj}/inst_id/{id}/offset/{start}/limit/{limit}/web`
   - web_server 导出"导出全部"空 `$in` 条件 bug 已修（param.go），**已随 2026-09-08 镜像重建固化**（镜像 standalone-cmdb:latest，13 服务含 cloudserver；导出全部空条件闭环已在新镜像验证）
   - 资源目录页重做为老版卡片瀑布流；主机/业务拓扑 ID 列在**首位**蓝色链接（Playwright 抓表格列时 fixed 列 DOM 顺序有欺骗性，以截图为准）

## 关键实现文件

- API 层：`src/ui-v3/src/api/cmdb.js`（全部契约注释了形状）
- 业务上下文：`src/ui-v3/src/stores/biz.js`（Pinia，bizId 全局共享）
- 迁移矩阵：`docs/architecture/frontend-migration-matrix.md`（批次 1-11 记录）

## 剩余事项（按优先级，2026-09-08 收口后）

1. ~~服务实例标签批量编辑~~ ✅ 已完成
2. ~~业务集/项目列配置~~ ✅ 已完成（54d36dda62，含数字 id 契约陷阱修复）
3. ~~Docker 镜像重建~~ ✅ 已完成（镜像 standalone-cmdb:latest 含 cloudserver 与导出修复）
4. ~~动态分组条件编辑器/云账户补全/主机与业务批量编辑/自定义字段对齐/bind_info 多行/删除历史页/首页搜索落地~~ ✅ A/B/C/D 批全部完成（db1efd378b、306749b3d8、6f0af7911d 及 D 批提交），矩阵已全面修正为最新状态
5. **首页全文检索**：依赖 ES；前端 tab 已有禁用态+提示，ES 部署后需实现结果页（依赖阻塞）
6. **Pod/容器**：依赖 K8s 数据链路（kube），矩阵标依赖阻塞
7. **IAM 开源方案**：用户指示**放最后做**；立项设计已就绪 → `docs/architecture/iam-open-source-design.md`（Casdoor + Casbin 边缘鉴权，P0 登录→P2 资源域）
8. **旧前端下线**：矩阵中除依赖阻塞与 IAM 外已全为"核心流程"；满足"完整替代"门禁 + 观察期后执行

## 最新提交（本会话增量，截至 cbd7c3289a）

- 24f27b1405 资源目录页 1:1 卡片瀑布流重做
- a5a19f4040 六个菜单页(业务集/项目/管控区域/云账户/动态分组/集群模板)布局列对齐
- 8199bbcecc 自定义字段 3-tab 业务维度对齐
- 1b29f35a68 主机/云资源发现页对齐
- e2b420e115 主机/业务拓扑 ID 列位修正(首列蓝色链接——注意 Playwright 抓 fixed 列 DOM 顺序有欺骗性,以截图为准)
- 94168aa96b 云功能纳入 core profile(cloudserver 部署+云账户 CRUD+降级提示移除)
- 948c9da14c 服务模板同步红点(双 tab)/实例克隆/关联契约修正(findmany/inst/association 裸路径是 404)
- cbd7c3289a 服务实例批量标签编辑

## 环境注意事项

- 重启 webserver（**完整命令，flag 缺一不可**）：
  ```bash
  docker exec cmdb sh -c 'kill $(pgrep -f "cmdb_webserver --addrport")'
  sleep 5
  docker exec -d cmdb sh -c 'cd /data/cmdb/cmdb_webserver && nohup ./cmdb_webserver --addrport=0.0.0.0:8090 --regdiscv=zookeeper:2181 --deployment-method=open_source --config=/data/cmdb/cmdb_webserver/web.yaml --log-dir=/data/cmdb/logs/webserver --v=3 --register-ip=127.0.0.1 > web.log 2>&1 &'
  ```
  （`--addrport` 必须是 `0.0.0.0:8090` 完整 host:port 形式，只给端口会报 "wrap server info failed"；与容器 /run.sh 第 129-132 行一致）
- 容器内禁止 `kill $(ps|grep cmdb_webserver)`——grep 会匹配到自身 shell 导致自杀（exit 143）
- 部署：`docker cp src/ui-v3/dist/. cmdb:/data/cmdb/cmdb_webserver/web/` + 重启 webserver
- Go 交叉编译：`CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -tags=disable_crypto -o out configcenter/src/<server>`
- 老前端 8091 有版本日志弹层挡页面，脚本需先 Escape/点关闭
- curl 测接口：web_server 根路径路由（excel/table）不带 /api/v3；topo 接口带 /api/v3
- 测试数据要清理（业务 bk_biz_id=3 已删、bk_switch 实例已清、项目/业务集已清）

## 验证基线命令

```bash
cd src/ui-v3 && npm run build          # 构建
docker cp dist/. cmdb:/data/cmdb/cmdb_webserver/web/  # 部署
# 重启 webserver（见上）
cd src/ui-v3/e2e && node run-all.cjs   # 全量 E2E（10 脚本）
node src/ui-v3/e2e/run-route-smoke.cjs # 快速路由回归
```
