# G1-C 云账户、云区域与 cloudsync fake contract — 2026-09-15

## 结论先行

G1-C 本批次建立了云领域的离线契约基线，重点验证：

- AWS/Tencent `VendorClient` 注册与构造边界；
- region、VPC、instance、host-count 的聚合语义；
- 老前端云账户、云区域、云资源任务页面的 method/path/payload/response/error/empty contract（通过完全 mock 的 UI runner）；
- fake/offline、infra、本地 CRUD、live-cloud 和 unsupported 的分层边界。

本批次不宣称真实 AWS/Tencent 资源发现或 HostSyncor 生产同步通过。真实同步仍依赖云凭据、云 API 网络、CloudServer/Core/Host 服务、Mongo replica set/change stream、Redis、ZK/服务发现和可用的 secret manager。

## 老前端事实源

主链路是已注册并有页面 caller 的 `cloud/{account,area,resource}`：

- `src/ui/src/store/modules/api/cloud.js`
- `src/ui/src/views/cloud-account/**`
- `src/ui/src/views/cloud-area/**`
- `src/ui/src/views/cloud-resource/**`
- `src/ui/src/service/**`

主要接口：

```text
账户：
POST   /findmany/cloud/account
POST   /cloud/account/verify       (transformData=false，raw envelope)
POST   /findmany/cloud/account/validity
POST   /create/cloud/account
PUT    /update/cloud/account/:id
DELETE /delete/cloud/account/:id

云区域：
POST   /findmany/cloudarea
POST   /findmany/cloudarea/hostcount
POST   /createmany/cloudarea        {data: [...]}
PUT    /update/cloudarea/:id
DELETE /delete/cloudarea/:id

资源发现任务：
POST   /findmany/cloud/sync/task
POST   /create/cloud/sync/task
PUT    /update/cloud/sync/task/:id
DELETE /delete/cloud/sync/task/:id
POST   /findmany/cloud/sync/region  (直接数组)
POST   /findmany/cloud/account/vpc/:id
POST   /findmany/cloud/sync/history
```

精确 payload 约束来自老页面：

- 账户字段：`bk_account_name`、`bk_cloud_vendor`、`bk_secret_id`、`bk_secret_key`、`bk_description`；vendor 当前支持 AWS `1` 和 TencentCloud `2`；verify 仅提交 vendor/secret id/key。
- 账户列表使用 `{page, condition, is_fuzzy}`，validity 使用 `{account_ids}`。
- 云区域列表使用 `{page, condition, host_count:true, sync_task_ids:true}`；host count 每批最多 50 个 `bk_cloud_ids`。
- 云区域批量创建使用 `{data:[{bk_cloud_name,bk_vpc_id,bk_vpc_name,bk_region,bk_cloud_vendor,bk_account_id}]}`。
- 任务列表使用 `{fields, condition, exact, page}`；任务创建包含 `bk_sync_vpcs[]`，VPC 行含 `bk_vpc_id,bk_vpc_name,bk_region,bk_host_count,bk_sync_dir,bk_cloud_id,destroyed`。
- region selector 的关键字段是 `with_host_count`，不是 `bk_with_host_count`。
- VPC 查询使用 `{bk_account_id,bk_region}`；history 使用 `bk_task_id` 和分页，响应为 `{count,info[]}`。
- 同步历史只有精确状态 `cloud_sync_success` 才算成功，其余状态应进入失败/异常分支。

`cloud-discover` store 中的 `hosts/cloud/*` 是无 view caller 的遗留模块，不与当前 `cloud/sync/*` 主链路混用。仓库中没有 `HostSyncor`/`hostSyncor` 的老前端 caller；HostSyncor 是后端 cloudsync 实现。

## 后端注册与依赖

CloudServer 注册在 `src/scene_server/cloud_server/service/service.go`，对外前缀为 `/cloud/v3`；HostServer 云区域注册在 `src/scene_server/host_server/service/cloudarea.go`/`service_initfunc.go`，对外前缀为 `/host/v3`。API Server 负责把 `/api/v3` 的 cloud/host 路径转发到对应服务。

`src/scene_server/cloud_server/cloudvendor/vendorclient.go` 的接口包含：

```text
NewVendorClient
GetRegions
GetVpcs
GetInstances
GetInstancesTotalCnt
```

当前仓库发现的 vendor 实现是 AWS 和 Tencent Cloud；没有 Alibaba vendor 实现，因此 Alibaba 标为 `unsupported/not implemented`。

`HostSyncor.Sync` 还会：

1. 读取/解密云账户；
2. 调 vendor 拉取 VPC/instance；
3. 在 Core/Mongo 事务中计算 diff；
4. 创建/更新/销毁云主机及服务关系；
5. 写同步状态、history 和 audit。

scheduler 使用 Mongo change stream 监听 `bk_cloud_sync_task`，并通过 ZK/服务发现做任务节点分配。cloudsync 是周期、无限运行的 worker，不适合作为离线 smoke。

## 测试分层

### offline

不访问 AWS/Tencent，不启动 Mongo/ZK/Redis：

- fake `VendorClient` 的注册/构造/secret 传递；
- region/VPC/instance/total count 的 provider 返回、filter/limit 观察和错误传播；
- UI route mock 的 request/response contract；
- Node/Go 纯单测。

`Logics.GetRegionsInfo`、`GetVpcHostCntInOneRegion`、`GetCloudHostResource` 和完整 HostSyncor 聚合暂未纳入本批 fake 测试，原因是它们还需要可注入的 engine/Core seam；后续单独补，不把 VendorClient 层通过等同为 cloudsync 通过。

### infra

需要本地 standalone/cloud profile 和基础设施：

- Cloud account CRUD/verify facade、cloud area CRUD、sync task CRUD；
- Mongo replica set、Redis、ZK、Core/Host/Topo/CloudServer；
- audit、IAM、事务和 read-back。

假 secret 的 CRUD 成功不等于云账户连通，也不等于 cloudsync 成功。

### live-cloud

需要明确的 AWS/Tencent 凭据、网络/DNS/TLS 和可清理的云资源：

- `GetRegions`、`GetVpcs`、`GetInstances`；
- region/VPC/instance read-back；
- HostSyncor 状态/history/host 写回；
- destroyed VPC 和重复周期幂等。

现有 AWS/Tencent vendor tests 属于这一层，缺少凭据时不能当 offline test 运行。

## 本批次脚本

### Go fake vendor

新增 `src/scene_server/cloud_server/cloudvendor/vendorclient_contract_test.go`，验证 `Register`/`GetVendorClient` 和 fake provider 行为。测试不得初始化真实 SDK；本机执行结果：

```text
PASS
ok configcenter/src/scene_server/cloud_server/cloudvendor 0.891s
```

覆盖注册/unsupported vendor、secret 传递、regions/VPC/instances/total count、region/limit/filter 观察和错误传播。

`go test ./src/scene_server/cloud_server/common -count=1` 当前失败于仓库已有 `util_test.go` 与生产状态常量不一致：测试期望 `starting`，生产 `BKCloudHostStatusStarting` 当前值为 `"2"`。本批次未修改该既有语义漂移，记录为后续测试修复项。

### Cloud UI mock

```bash
node src/ui-v3/e2e/test-g1-cloud-mock.cjs
G1_CLOUD_REPORT_PATH=/tmp/g1-cloud-mock.json \
  node src/ui-v3/e2e/run-g1-cloud-mock.cjs
```

runner 使用 fresh browser context 和 `page.route`，不向 AWS、Tencent、Alibaba 或 secret manager 发请求。报告应明确记录：

- `offline: passed/failed`；
- `infra: required`；
- `live-cloud: blocked`（缺凭据/网络时）；
- `unsupported: Alibaba Cloud`。

成功只表示页面消费的请求和响应契约与 mock 一致，不表示后端真实云服务或生产数据链路通过。

## 已知边界与待办

1. `GetCloudHostResource` 可测试 vendor 聚合，但完整 `HostSyncor.Sync` 仍被 Core API/Mongo 事务和外部云依赖隔离。
2. `HostSyncor` 当前没有专用测试；panic 恢复、任务状态 CAS、跨节点 claim/lease、空资源状态恢复、destroyed VPC 和部分失败回滚仍需后续测试。
3. account/task 名称和 secret id 的并发唯一性主要依赖查后写，存在 TOCTOU 风险。
4. cloud area 删除要经过默认区域、host_count、sync_task_ids 和 IAM 保护；批量创建支持逐项 `err_msg`，不能只断言整体 HTTP 成功。
5. 真实 live vendor 测试应增加凭据环境门禁；skip 只能表示未执行，不能表示通过。
6. Alibaba 不能进入成功矩阵，直到出现 vendor 实现、注册、测试和可清理的真实资源证据。

## 下一步

G1-C 离线基线后，顺序为：

1. 本地 Mongo rs0 + Redis + ZK 下的 cloud account/area/task CRUD read-back；
2. cloud account/task 权限、错误码和审计矩阵；
3. 真实 AWS/Tencent region/VPC/instance discovery；
4. HostSyncor fake Core seam 与状态机/事务回滚测试；
5. 最后才做真实 cloudsync change-stream 多节点和生产门禁。
