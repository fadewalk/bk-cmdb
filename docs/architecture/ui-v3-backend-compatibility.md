# 前端迁移后端兼容检查（2026-09-06）

## 检查范围

对照前端迁移工作树中的：

- `src/ui-v3/src/api/cmdb.js`
- `src/ui-v3/src/views/HostList.vue`
- `src/ui-v3/src/views/model/AssociationType.vue`
- `src/ui-v3/src/api/http.js`

以及后端路由和 handler：

- `src/scene_server/topo_server/service/service_business_initfunc.go`
- `src/scene_server/topo_server/service/resource_directory.go`
- `src/scene_server/host_server/service/service_initfunc.go`
- `src/scene_server/host_server/service/findhost.go`
- `src/scene_server/host_server/service/module.go`

## 结果

### 已确认匹配

- 关联类型：`find/create/update/delete/count /associationtype`
- 资源目录：`findmany/create/update/delete /resource/directory`
- 主机列表：`/hosts/app/{id}/list_hosts`、`/hosts/list_hosts_without_app`
- 主机转移：`/hosts/modules`、`/hosts/modules/resource`、`/host/transfer/resource/directory`
- 业务拓扑：`/find/topoinst_with_statistics/biz/{id}`、`/topo/internal/{owner}/{app}/with_statistics`
- 收藏：`/hosts/favorites/*`

### 已验证运行时响应

```text
POST /api/v3/find/associationtype
HTTP 200, result=true, 6 records

POST /api/v3/findmany/resource/directory
HTTP 200, result=true, 1 record

POST /api/v3/hosts/list_hosts_without_app
HTTP 200, result=true, 3 hosts
```

### 修复的后端兼容问题

MongoDB 中历史主机数据的 `bk_host_innerip` 存在两种格式：

- 新数据：BSON string array
- 历史/种子数据：BSON string

`src/common/metadata/host.go` 的 `parseBsonStringArrayValueToString` 原先只接受 array/null，导致 HostList 返回：

```text
invalid BSON type string
```

已增加 BSON string 分支，数组/null 行为不变。重新构建 standalone 镜像后，HostList API 已恢复 `result:true`。

## 认证兼容

- `src/ui-v3/src/api/http.js` 仍通过同源 `/api/v3` 和浏览器 Session 工作；
- standalone API Key 是可选的机器调用入口，不要求前端注入 API Key；
- 未设置 `CMDB_API_KEY` 时，现有 skip-login/浏览器 Session 路径保持不变；
- 设置 API Key 后，带 `X-API-Key` 或 `Authorization: Bearer` 的机器请求走独立认证。

## 测试结果

通过：

- `npm run build`（ui-v3）
- `go test -vet=off -tags=disable_crypto ./src/web_server/... ./src/apiserver/...`
- standalone 核心二进制构建
- standalone Docker 镜像构建与容器启动
- 关联类型/资源目录/主机列表 HTTP smoke

已有基线问题：

- `src/common/metadata` 现有测试存在自身 import cycle；
- `src/common/metadata/core_service_test.go` 使用已删除/改名字段；
- 这些问题与本次兼容修复无关，生产代码和容器构建已验证。

## E2E 注意事项

`src/ui-v3/e2e/run-b7.cjs` 仍检查旧版 `.group-item` DOM；当前 `HostList.vue` 迁移后使用 `.scope-tabs` 和资源目录树，因此该 E2E 断言需要由前端迁移会话同步更新。后端路由和数据链路已经验证，不应因为旧选择器失败回退后端接口。
