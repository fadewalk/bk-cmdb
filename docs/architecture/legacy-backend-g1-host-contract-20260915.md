# G1-B Host 真实契约验收 — 2026-09-15

## 范围

本批次验证老前端已有 Host 后端契约，不新增 ui-v3 页面或业务功能：

- Host 批量编辑与资源池查询 read-back；
- 资源池主机进入业务空闲模块、转入临时模块的 preview/execute 和业务查询 read-back；
- 有实例关联时 `DELETE /hosts/batch` 的删除保护；
- 请求 method、URL、payload、HTTP 状态、响应 envelope 和清理结果的机器可读报告。

真实契约来源：

- 老前端批量编辑：`src/ui/src/views/resource/children/host-options.vue:615-627`、`src/ui/src/store/modules/api/host-update.js:34-36`；
- 老前端 Host 删除：`src/ui/src/views/resource/children/host-options.vue:628-647`、`src/ui/src/store/modules/api/host-delete.js:34-36`；
- 老前端 Host 转移：`src/ui/src/store/modules/api/host-relation.js:46-115`、`src/ui/src/views/host-operation/index.vue:343-370,611-644`；
- 后端注册：`src/scene_server/host_server/service/service_initfunc.go:146-162,254-284,312-317`；
- 删除保护：`src/scene_server/host_server/service/host.go:101-168`。

## 精确契约

### 批量编辑

```text
PUT /api/v3/hosts/batch
{
  "bk_host_id": "<id[,id...]>"
  "<property>": "<value>"
}
```

后端接受数字或逗号分隔字符串的 `bk_host_id`，会移除不可直接修改的 `metadata`、`bk_host_id` 和 `bk_cloud_id`，再按 Host 权限更新。成功后老前端不依赖更新响应内容，而是刷新列表；runner 额外通过资源池搜索精确读回 `bk_host_name`。

### 转移

fixture 动态创建业务下的 set 和两个普通 module，然后：

```text
POST /api/v3/hosts/add/resource
POST /api/v3/hosts/modules/resource/idle
POST /api/v3/hosts/modules
POST /api/v3/host/transfer_with_auto_clear_service_instance/bk_biz_id/:bizId/preview
POST /api/v3/host/transfer_with_auto_clear_service_instance/bk_biz_id/:bizId
POST /api/v3/findmany/hosts/search/with_biz
```

preview/execute payload：

```json
{
  "bk_host_ids": [123],
  "remove_from_modules": [456],
  "add_to_modules": [789],
  "is_remove_from_all": false
}
```

runner 要求 preview 有主机计划且目标 module 出现在 `final_modules`（若后端返回该字段），execute 成功，并从带业务 Host 查询中确认主机仍存在且落入目标 module。

### 删除保护

老前端没有独立的“删除保护” API。资源池删除调用：

```text
DELETE /api/v3/hosts/batch
{
  "bk_host_id": "123",
  "bk_supplier_account": "0"
}
```

后端先读取主机关联实例；存在关联实例时返回：

```text
CCErrTopoInstHasBeenAssociation = 1101036
```

runner 会动态创建临时模型、字段、实例、Host→实例关联，尝试删除 Host，断言 `1101036` 且通过 noauth 搜索确认 Host 仍存在；随后删除关联和夹具。若当前环境无法创建关联夹具，该阶段明确为 `blocked`，不会把普通删除成功误报成保护通过。

### Agent ownership 边界

后端已注册：

```text
POST /api/v3/host/bind/agent
POST /api/v3/host/unbind/agent
```

请求为 `{"list":[{"bk_host_id":123,"bk_agent_id":"..."}]}`。但老前端当前只跳转 `bk_nodeman`，没有 Host 维度 bind/unbind caller，因此本批次不伪造前端流程；该项仍是 G1 外部 ownership/真实 caller 缺口。

## 运行

需要已启动 standalone CMDB、8090 UI/API、有效登录 session、Mongo/Redis/Core/Host/Topo 服务和可写测试租户。

```bash
cd /Users/fadewalk/Documents/code/bk-cmdb
node src/ui-v3/e2e/test-g1-host-contract.cjs
G1_HOST_REPORT_PATH=/tmp/g1-host-contract.json \
  node src/ui-v3/e2e/run-g1-host-contract.cjs
```

可用 `UI_V3_BASE_URL` 指向其它本地环境；报告默认 stdout，不提交临时 JSON。

退出码：

- `0`：health、批量编辑、转移、删除保护全部通过且无页面错误；
- `2`：环境或删除保护夹具外部阻塞，报告中保留已完成阶段和错误；
- `1`：runner 自身失败或出现页面错误/清理失败。

## 报告字段

`run-g1-host-contract.cjs` 输出 `reportKind: legacy-g1-host-contract`，包含：

- `stages`：health、batchEdit、transfer、deleteProtection；
- `requests`：每个请求的 method/path/body/HTTP status/错误码/响应消息；
- `cleanup`：每个 finally 清理动作的结果；
- `contract`：关键路径和删除保护错误码；
- `pageErrors`、`errors`：浏览器异常和阻塞原因。

## 当前状态

本批次真实 runner 已在 standalone 8090 环境通过：

```text
status: passed
health: passed
batchEdit: passed
transfer: passed
deleteProtection: passed
requests: 34
cleanup actions: 10
cleanup failures: 0
page errors: 0
```

报告文件：`/tmp/g1-host-contract.json`。该文件是运行时产物，不提交仓库。

删除保护实际返回 `bk_error_code=1101036`，随后 noauth read-back 确认 Host 仍存在；清理关联、临时模型/实例、Host、模块和 set 均成功。

静态 route 扫描只能证明注册提示，不能替代本报告的请求/响应/read-back/cleanup 证据。

已有相关证据：

- `docs/architecture/physical-host-import-evidence-20260914.md`：Excel import `op=1/op=2`；
- `src/ui-v3/e2e/run-b16-batch-b.cjs`：已有 ui-v3 批量编辑历史回归；
- `src/ui-v3/e2e/run-b20.cjs`：已有 ui-v3 转移历史回归；
- `src/ui-v3/e2e/run-b41.cjs`：模型/实例关联真实夹具模式。

这些历史证据不自动提升本批次的老前端 G1 状态。

## 下一步

若本 runner 在真实环境通过，下一批进入：

1. Host multipart 失败矩阵、重复 IP/cloud identity 冲突、失联/报废语义；
2. 云账户/区域/资源发现和 cloudsync fake contract；
3. 老前端 K8s API 查询；
4. full_text off/empty/error；
5. login/logout/session expiry 与多用户 IAM 矩阵。
