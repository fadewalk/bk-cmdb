# ui-v3 老/新前端 API 契约与使用度盘点

> 盘点日期：2026-09-13  
> 分支：`standalone-docker`  
> 目的：回答“老前端 API 新前端都有吗、都有使用吗、哪些已验证可用”，并提供可持续更新的迁移进度基线。

## 1. 结论先行

**不是所有老前端 API 都已经迁移到新前端，也不是所有新前端封装都已被使用。**

当前可以确认的事实：

- 老前端静态盘点：约 **381 个去重后的 method + endpoint 契约**；来源是 Vuex API 模块、service 层和直接调用，数量为近似值，因为动态路径、别名和重复封装需要运行时才能完全归并。
- 老前端 API 定义：**311 个 Vuex action endpoint definition + 148 个 service-layer endpoint definition = 459 个定义**；其中约 **278 个 Vuex action** 中约 **169 个能静态找到 Vue caller**，约 **109 个未找到静态 caller**。
- 新前端 `src/ui-v3/src/api/cmdb.js`：**226 个 named function exports**，另有一个 named `http` export；其中 **194 个函数被 `src/ui-v3/src` 实际导入**，**32 个函数当前未被源码引用**。
- 新前端源码可发现的 HTTP 调用：**244 个归一化路径**；当前后端静态注册扫描发现 **778 条路由**，`apiGaps=0`，但其中 **3 条依赖 apiserver 通用代理**，不是每条都有专用后端 handler 证据。
- B38~B45 选择性 E2E 与最近一次 `run-all.cjs`：历史完整回归 **30 个脚本全部通过**；这证明已覆盖的核心流程可用，不证明 381 个老版 API 全部 1:1 等价。
- 当前 bundle/HTTP/写回/深链/阻塞页均有对应证据，但**payload、response shape、method、root path 与 `/api/v3` 前缀、权限矩阵、所有老版分支**没有被一个统一的全量 contract suite 覆盖。

因此当前最准确的状态是：

> **新前端已覆盖主要核心 API 和核心写流程；仍存在未迁移、未使用、仅封装、依赖阻塞和未被 E2E 覆盖的老版 API/分支，不能把 API 路径匹配等同于生产可用。**

## 2. 新前端 API 使用度

| 指标 | 数量 | 含义 |
|---|---:|---|
| `cmdb.js` named function exports | 226 | 新前端 API 封装总数 |
| 被 `src/ui-v3/src` 导入的封装 | 194 | 有源码 caller 的封装，约 85.8% |
| 未被 `src/ui-v3/src` 导入的封装 | 32 | 仅定义未使用，不能计为已迁移流程 |
| 新前端可发现 HTTP 调用路径 | 244 | 视图/API 文件中实际写出的调用路径，含重复路径的不同 caller |
| 原始 axios/fetch | 2 | `stores/session.js` 的 `/userinfo`、`/logout`，属于 session 专用端点 |
| 直接 raw `http`（无 cmdb wrapper） | 1 | `utils/host-filter.js` 的 `/find/objectattr/web`，应后续统一封装但不是身份绕过 |

### 当前未使用的新版封装

以下 32 个封装在 `src/ui-v3/src` 内未找到 caller。它们不一定错误，可能是为下一批、兼容入口或外部调用预留，但不能计作已交互迁移：

```text
updateSet
updateModule
transferHostAcrossBiz
transferHostToIdle
updateHostFavorite
updateInstProperties
listHostsInIdle
searchHostRelatedRules
searchHostApplyRelatedTopo
searchHostApplyRelatedTemplate
getModuleFinalRules
createCloudArea
searchCloudAccounts
deleteModel
moveAttributeToGroup
deleteAttributeGroupAssoc
getAssociationType
createSetTemplate
updateSetTemplate
deleteSetTemplates
getSetTemplateServices
searchSetTemplateSyncHistory
diffSetTemplateWithInstances
searchFieldTemplates
updateFieldTemplateInfo
getFieldTemplateSyncStatus
getServiceTemplateDetail
searchDynamicGroups
getAuditDict
updateOperationChartPosition
updateInstanceLabels
listInstanceLabels
```

其中有些是合理的 dead/compat exports，例如 B38 删除了真实死接口；另一些是明确的残余缺口，例如字段关联删除、模板完整 CRUD、动态分组搜索、运营图表位置更新等，需要后续决定是接 UI 还是删除封装。

## 3. 老版 API 规模与新旧可比性

| 老版盘点项 | 结果 |
|---|---:|
| Vuex API 模块 | 51 个 |
| Vuex action endpoint definitions | 311 个 |
| service-layer endpoint definitions | 148 个 |
| 合并后的定义数量 | 459 个 |
| 近似去重 method+endpoint pairs | 381 个 |
| 有静态 Vue caller 的 Vuex action | 约 169 个 |
| 未找到静态 Vue caller 的 Vuex action | 约 109 个 |

老版不是单一 `api.js` 清单：

- `src/ui/src/api/index.js` 只提供 HTTP wrapper；
- `src/ui/src/store/modules/api/**` 提供大量 Vuex action；
- `src/ui/src/service/**` 还有一层业务契约、payload 转换、response 转换和动态 endpoint；
- `src/ui/src/views/**` 通过 store dispatch、service import、mapActions、动态 action 名称间接调用。

所以不能用“`grep` 看到相同函数名”判断迁移。真正的完成证据必须同时包含：

```text
legacy endpoint + method + prefix
→ v3 wrapper/caller
→ request payload
→ response shape
→ write/read-back
→ permission/error behavior
→ E2E or integration evidence
```

## 4. 按领域的老版 API 规模

以下是老版约 381 个去重契约的静态领域分布，分类按路径启发式计算，重叠能力会有少量归类误差：

| 领域 | 近似唯一 endpoint | GET | POST | PUT | DELETE |
|---|---:|---:|---:|---:|---:|
| 模型/属性/模板 | 87 | 3 | 58 | 14 | 11 |
| 主机/模块/云采集 | 94 | 7 | 67 | 9 | 11 |
| 实例/引用实例 | 48 | 0 | 37 | 6 | 5 |
| 业务/项目 | 44 | 7 | 28 | 7 | 2 |
| 进程/服务模板 | 28 | 2 | 14 | 7 | 5 |
| 拓扑 | 16 | 4 | 7 | 3 | 2 |
| 资源/动态分组 | 10 | 1 | 5 | 2 | 2 |
| Kubernetes/容器 | 8 | 1 | 7 | 0 | 0 |
| 运营图表 | 6 | 1 | 4 | 0 | 1 |
| 审计/历史 | 3 | 1 | 2 | 0 | 0 |
| 用户/系统/配置 | 11 | 3 | 7 | 1 | 0 |
| 权限/Auth | 2 | 0 | 2 | 0 | 0 |
| 其他/动态 | 24 | 0 | 17 | 3 | 3 |

## 5. 已确认新版覆盖且有行为证据

### B38 API 契约清理

- 主机详情不再调用未注册 `/host/search`，改为：
  - `POST /findmany/hosts/search/with_biz`
  - `POST /findmany/hosts/search/resource`
  - `POST /findmany/hosts/search/noauth`
- 移除未注册 `/hosts/snapshot/:id`、`/findmany/inst/association` 等死导出；
- 字段组移动使用真实的 `PUT /update/objectattgroupproperty` 批量契约；
- 模型导入/导出走 web_server 根路径，保留 multipart/blob 和超时；
- `run-b38.cjs` 验证真实请求、payload、写回和死接口守卫。

### B39 路由、权限和错误状态

- `/error`、`/no-business`、原位 permission/error 状态；
- 业务 ID 规范化与无业务分支；
- `9900403` 权限码、`1306000` 登录失效、401、HTML 登录页；
- `run-b39.cjs` 验证 URL 保留、状态页和正常业务导航。

### B40 深交互

- 拓扑 `node` / `tab` query 写回与刷新恢复；
- 服务实例 create/clone 深链；
- host-apply stage 深链；
- 主机详情返回历史快照；
- `run-b40.cjs` 验证这些交互。

### B41/B45 模型和关联

- 实例详情关联 tab：列表/拓扑/新增/取消关联；
- 唯一校验只读详情和内置/模板保护；
- 字段模板差异预览、冲突阻断、同步轮询；
- 自定义字段跨组移动/分组排序；
- 导入“已存在、不可导入”标记；
- 导出密码强度和确认密码；
- `run-b41.cjs`、`run-b45.cjs` 和适配后的 `run-b27.cjs` 验证。

## 6. 当前明确的差距

### 6.1 老版存在、新版无等价流程或仍依赖阻塞

- Kubernetes/Pod/容器真实数据链路；新版目前提供明确阻塞页，不是假装完成；
- Elasticsearch 全文检索；新版目前提供 ES 能力阻塞页；
- 真实云厂商同步、网络、凭据、地域/VPC 的真实外部链路；
- 老版 `full_text` 全文接口没有对应真实可用的新版能力；
- 老版网络采集/发现等 `collector/netcollect` 系列能力没有完整新版页面/流程；
- 老版用户特权/组织/部门/部分系统配置 API 没有完整新版可见流程；
- 老版 Kubernetes/container 服务族没有真实新版等价流程；
- 老版部分低频服务实例 preview、历史、模板全量细节没有全部接入新版页面。

### 6.2 新版已封装但未使用

见本文第 2 节 32 个 unused exports。特别需要后续处理的包括：

- `updateSet`、`updateModule`；
- `moveAttributeToGroup`、`deleteAttributeGroupAssoc`；
- 字段模板全量 CRUD/历史差异；
- `searchDynamicGroups`；
- 部分 host apply related rules；
- 云账户列表和部分云资源任务接口。

### 6.3 不能由静态 API 匹配证明的内容

当前 `audit-parity.cjs` 的结果：

```text
legacy routes: 65
v3 routes: 137
v3 client API calls: 244
backend routes discovered: 778
apiGaps: 0
apiserver generic-proxy-only calls: 3
productionReady: false
```

这些数字只能证明路径级启发式匹配，不证明：

- HTTP method 一致；
- request payload 完整一致；
- response shape 一致；
- root 路径与 `/api/v3` 前缀一致；
- 401/403/9900403/1306000 行为一致；
- 写入后数据库真实读回；
- 所有 UI 分支都会执行该 API；
- 资源级 IAM 和跨业务隔离正确。

当前静态扫描还有两个已知限制：

1. `legacyApiCalls` 尚未形成可靠的自动归并清单（老版 API 分散在 51 个 Vuex 模块和 service 层）；
2. `apiGaps=0` 中包含 3 条 apiserver 通用代理覆盖，不能当作每条都有专用后端 handler。

## 7. 交付进度口径

建议把 API 迁移状态分成五类，而不是只看“有无封装”：

| 状态 | 进入条件 |
|---|---|
| `未迁移` | 老版有 API/页面流程，新版无页面、无 wrapper 或无等价入口 |
| `已封装未使用` | 新版有 wrapper，但 `src/ui-v3/src` 没有 caller |
| `核心流程` | 新版有 caller，页面能调用，至少一个真实读/写流程通过 |
| `契约已验证` | method、prefix、payload、response、错误码、写回均有专项证据 |
| `依赖阻塞` | 页面/阻塞态/契约已登记，但真实能力需要 K8s、ES、云凭据、IdP 等外部依赖 |

当前按这个口径：

- 新版 **194/226 个 wrapper 有源码 caller**；
- 新版 **32 个 wrapper 仍是已封装未使用**；
- B38~B45 触及的主要 API 已有契约/写回/E2E 证据；
- 老版约 381 个去重契约不能全部标记为“完整替代”；
- 依赖型能力必须保留 `依赖阻塞`，不能因阻塞页存在而标记为实际能力完成。

## 8. 证据命令

### 静态 API/后端注册扫描

```bash
cd /Users/fadewalk/Documents/code/bk-cmdb
node scripts/ui-v3/audit-parity.cjs > /tmp/ui-v3-api-audit.json
```

### 新版 API wrapper/caller 数量

```bash
cd /Users/fadewalk/Documents/code/bk-cmdb
node - <<'JS'
const fs = require('fs')
const text = fs.readFileSync('src/ui-v3/src/api/cmdb.js', 'utf8')
const names = [...text.matchAll(/export const (\w+)\s*=/g)].map(m => m[1])
console.log({ cmdbExports: names.length })
JS
```

### 全量 E2E

```bash
cd /Users/fadewalk/Documents/code/bk-cmdb/src/ui-v3/e2e
node run-all.cjs
```

最近一次完整回归结果：**30 个脚本全部通过**，包含 `run-b38.cjs`、`run-b39.cjs`、`run-b40.cjs`、`run-b41.cjs`、`run-login.cjs`、`run-b45.cjs`。

## 9. 后续真正需要补的不是“再写 wrapper”

高价值下一步应是：

1. 把老版约 381 个去重契约生成结构化 manifest（保留 method、transport、source、caller、payload/response notes）；
2. 升级 `audit-parity.cjs`，让每条调用保留 method、transport、源码位置、后端匹配 provenance，并区分 exact/wildcard/generic-proxy/unmatched；
3. 让 E2E 记录 machine-readable request trace、首跑失败、重试、skip reason、read-back 结果；
4. 用 manifest + trace 计算真正的“已覆盖/仅封装/仅静态/已验证/依赖阻塞”进度，而不是用路径数量除法。


## 10. 核心 API 继续迁移记录（2026-09-13）

本轮针对六个高价值领域继续迁移：

### IAM/权限

- 修正 v3 路由权限校验契约：`POST /auth/verify` 使用 `{resources:[...]}`，响应按 `[{is_pass}]` 处理；
- 为资源主机、云区域、模型详情、模型实例、平台配置加入首批 `meta.auth`；
- 新增 `verifyResource()` 与 `applyPermission()`，权限页可消费 `permission` payload，调用 `POST /auth/skip_url` 打开申请页；
- `run-iam.cjs` mock deny matrix 通过：校验请求体、权限状态页、申请 URL payload 和打开动作均验证。

### K8s/Pod

- 新增 `searchKubePods`、`searchKubeContainers`、`getKubePodPath` wrapper；
- 新增 `KubePods.vue`，使用老版 `/findmany/kube/pod` 列表/详情契约；
- 恢复老版 `/business/:bizId/index/pod/:podId` 和 container 深链；
- 当前环境无 K8s 数据链路，页面显示明确阻塞态；若 Pod API 可用则自动进入真实列表。

### Elasticsearch 全文检索

- 新增 `searchFullText` wrapper；
- 新增 `FullTextSearch.vue`，使用老版 `/find/full_text` 请求体和 `hits/aggregations` 响应；
- 当前 standalone `fullTextSearch=off`，页面显示 ES 阻塞态；开启且连通后自动显示搜索结果。

### 网络采集

- 新增老版设备/属性 CRUD、导入、导出 wrapper：`collector/netcollect/*`、`collector/netdevice/*`、`collector/netproperty/*`；
- 老版源码只有 Vuex API 模块，没有实际网络采集页面和 caller，因此新增 `NetworkCollectBlocked.vue`，明确依赖 collector 数据链路；
- 不把“有 wrapper”计为已完成页面能力。

### 服务实例高级流程

- 新增/接入 `with_host`、创建预览、删除预览、模板解绑、进程名称/详情查询、批量服务实例更新等老版 API；
- 现有服务实例页面的克隆和批量删除在执行前增加真实 preview；模板实例增加解绑入口；
- 页面保留老版确认/失败语义，写回后刷新列表。

### 模板生命周期

- 字段模板绑定已使用 attribute/unique difference、停用模型过滤、冲突阻断和 `tasks_status` 轮询；
- 集群模板现有页面已覆盖列表/详情/同步/历史主流程；未使用的全量 CRUD wrapper 仍登记为“已封装未使用”，不虚报为完成。

### 本轮状态

| 领域 | API wrapper | 页面 caller | 真实/阻塞证据 | 当前状态 |
|---|---:|---:|---|---|
| IAM | 已补/修正 | 权限 store、router、PermissionStatus | `run-iam.cjs` 通过 | 核心流程 |
| K8s | 已补 | KubePods | `run-core-domains.cjs` 可用/阻塞双态 | 依赖阻塞 |
| ES | 已补 | FullTextSearch | `run-core-domains.cjs` 可用/阻塞双态 | 依赖阻塞 |
| 网络采集 | 已补 | 阻塞页，无老版实际 caller | `run-core-domains.cjs` | 依赖阻塞 |
| 服务实例高级 | 已补/已接线 | ServiceInstance | 构建通过，需高级数据 fixture 才能完整读回 | 核心流程 |
| 模板生命周期 | 已接差异/同步状态 | FieldTemplate/SetTemplate | 既有 B41/B45 + 构建 | 核心流程/部分迁移 |



## 11. Mock contract verification（2026-09-13）

由于当前 Colima 未运行 Kubernetes、没有 Elasticsearch、也没有云厂商账号，本轮新增 `run-core-domains-mock.cjs`，使用老版/后端真实 envelope 与 payload shape 做前端 contract mock：

- **K8s**：mock `/findmany/kube/pod` capability probe、Pod list/detail，验证 `bk_biz_id/filter/fields/page` 请求与 `data.count/info` 响应；
- **ES**：mock `/find/full_text` capability probe 和查询结果，验证 `query_string/filter/page` 及 `hits/aggregations` 渲染；
- **服务实例**：mock服务实例列表和 `/delete/proc/template_binding_on_module`，验证解绑请求体与列表读回；
- **网络采集**：验证 collector 依赖阻塞页不伪造 `/collector/*` 请求；
- **IAM**：`run-iam.cjs` 已 mock `auth/verify` deny 和 `auth/skip_url`，验证 `resources` 契约、权限页和申请动作。

结果：mock 核心域 contract suite 全部通过。Mock 证明的是前端请求/响应/页面/错误态契约，不替代真实 Kubernetes、Elasticsearch、collector、IAM 或云厂商集成测试。
