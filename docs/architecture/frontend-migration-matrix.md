# Vue3 前端替代旧版迁移矩阵

> 目标：用 `src/ui-v3` 完全替代 `src/ui`。只有当页面、深链、交互、API 读写闭环、权限/异常状态、视觉基线和 E2E 均通过后，模块才可标记为“完整替代”。
>
> 状态含义：
> - **核心流程**：新版可完成主要日常操作，但仍有旧版子流程或深链缺口。
> - **部分迁移**：新版有入口或基础页面，不能替代旧版完整工作流。
> - **未迁移**：旧版有实现，新版没有等价页面/流程。
> - **依赖阻塞**：旧版有实现，但需要当前 standalone 未提供的云/Kubernetes/外部数据链路。
> - **完整替代**：页面、流程、异常和验证均达到替代门禁（当前尚未将任何大模块按此标准提前宣称）。

## 首页与跨模块入口

| 旧版能力/入口 | 旧版实现 | 新版入口 | 当前状态 | 替代门禁重点 |
|---|---|---|---|---|
| 首页主机搜索 | `src/ui/src/views/index/` | `/index` | 核心流程 | 搜索跳转 `/resource/host?ip=` 并自动过滤(落地已验证);固资编号搜索字段待实际数据验证 |
| 首页全文检索 | `src/ui/src/views/index/children/full-text-search/` | `/index` | 依赖阻塞 | ES 开启时的全文结果、结果类型和详情跳转 |
| 无业务/无权限/错误/404/无搜索结果 | `src/ui/src/views/status/` | `/404`、通用错误状态 | 核心流程 | 404 兜底已验证;业务类页面无业务空态齐备;IAM 权限态随 IAM 立项(放最后)另行处理 |

## 业务上下文

| 旧版能力/入口 | 旧版实现 | 新版入口 | 当前状态 | 替代门禁重点 |
|---|---|---|---|---|
| 业务拓扑 | `src/ui/src/views/business-topology/` | `/business/topo` | 核心流程 | 拓扑树(根业务节点+计数徽标+空闲机池在前,计数前端统计)、工具栏(新增/编辑/转移至▾/追加至▾/复制▾/更多▾导出/收藏星/筛选漏斗)、主机列表 with_biz 四对象关联(模块名/集群名真实值)、列排序与字段设置 |
| 业务拓扑主机详情 | `business-topology` + `host-details` | `/host-detail?id=...` | 部分迁移 | 旧版多上下文深链兼容、属性/服务/Pod/关联/历史 tabs |
| 主机操作 | `src/ui/src/views/host-operation/` | 业务拓扑/主机列表内操作 | 部分迁移 | 新增、编辑、批量编辑、转移、导入导出、自动应用 |
| 服务实例与进程 | `business-topology/service-instance/` | `/business/service-instance` + 业务拓扑抽屉 | 核心流程 | 创建、克隆、标签、批量删除、进程 CRUD、真实回读 |
| 服务模板 | `src/ui/src/views/service-template/` | `/business/service-template` | 核心流程 | create/details/edit 深链已兼容(含 operational 旧链重定向);分类下拉仅叶子分类;删除契约已修正;配置/实例双 tab 待同步红点已迁移(need_sync 契约已验证) |
| 集群模板 | `src/ui/src/views/set-template/` | `/business/set-template` | 核心流程 | create/details/edit、实例配置和同步历史齐备(旧深链兼容);批量部署的旧版交互细节未 1:1(接受差异) |
| 集群模板同步 | `src/ui/src/views/set-sync/` | `/business/set-template`(同步对话框+历史) | 核心流程 | 旧版 set/sync/:setTemplateId、set/template/{create,details,history} 深链已兼容并自动打开同步/详情/历史;批量部署旧版交互未 1:1 |
| 服务分类 | `src/ui/src/views/service-category/` | `/business/service-category` | 核心流程 | 分类树、父子分类 CRUD、统计和错误状态 |
| 主机自动应用 | `src/ui/src/views/host-apply/` | `/business/host-apply` | 核心流程 | 三步向导(配置→预览含冲突统计→执行+状态轮询)、启停/删除/批量删除;旧版 host-apply/:mode 深链已兼容;「未应用主机列表」受后端限制(仅有 count 接口无列表接口) |
| 动态分组 | `src/ui/src/views/dynamic-group/` | `/business/dynamic-group` | 核心流程 | 编辑侧滑(条件编辑/操作符按类型映射/值控件/预览 hosts 与 set 查询/清空确认/编辑回显含 gte+lte→range 合并),契约 dynamicgroup CRUD 真实验证 |
| 自定义字段 | `src/ui/src/views/custom-fields/` | `/business/custom-fields` | 核心流程 | 字段分组、字段编辑/详情抽屉、导出、预览、完整 CRUD;老版业务自定义字段页 hideImport 不提供导入入口(仅模型详情页有),已对齐隐藏 |
| 业务同步 | `src/ui/src/views/business-synchronous/` | `/business/sync` | 核心流程 | 业务/模板/模块级联、差异(changed/added/removed/属性)展示、单模块/全量同步;旧版 synchronous/module 深链已兼容;旧版进程级差异细分视图未 1:1 |
| 进程模板 | `service-template/children/process-form.vue` | `/business/process-template` | 核心流程 | 按进程模型属性动态渲染全量字段(21 属性),必填校验;bind_info 多行编辑已迁移(真实创建/回读验证);新建曾因进程别名未自动带出+空值提交被后端拒而必然失败,已修 |

## 资源上下文

| 旧版能力/入口 | 旧版实现 | 新版入口 | 当前状态 | 替代门禁重点 |
|---|---|---|---|---|
| 资源目录 | `src/ui/src/views/resource/` | `/resource/index` | 核心流程 | 卡片瀑布流 1:1 重做(收藏星/计数/过滤规则与老版同源同值);点击跳转 BUILTIN_MODEL_RESOURCE_MENUS 映射 |
| 资源池主机 | `resource/index`、`host-details` | `/resource/host` | 核心流程 | 目录筛选、收藏、导入导出、转移、列配置、历史 |
| 通用模型实例(旧深链入口) | `src/ui/src/views/general-model/` | `/resource/instance/:objId` | 核心流程 | 与下方「模型实例」行同源;旧深链已兼容 |
| 业务管理/详情/归档 | `src/ui/src/views/business/` | `/resource/business` | 核心流程 | 列表正常/已归档双 tab;新建(web_server table 入口,根路径)/编辑/批量编辑(updatemany/biz/property)/归档/恢复/彻底删除(CRUD 全闭环真实验证);详情页(属性/变更历史)+旧版 `/business/details/:bizId` 深链;新建表单已补语言字段(原缺失导致后端必填校验失败) |
| 业务集管理/详情 | `src/ui/src/views/business-set/` | `/resource/biz-set` | 核心流程 | 详情页(属性/变更历史)+旧版 `/resource/business-set/details/:bizSetId` 深链;新建/编辑/删除;列配置(候选=业务集模型属性,契约:属性挂在 `bk_biz_set_obj` 下走 `/find/objectattr/web`,普通 find/objectattr 查 biz_set 返回空;默认列=老版可见列;注意 findmany/biz_set 行不含 bk_created_by,创建人列恒为 -- 属接口数据限制) |
| 项目管理/详情 | `src/ui/src/views/project/` | `/resource/project` | 核心流程 | 列表专用接口 /findmany/project;详情页(属性/变更历史,深链参数兼容数字 id/hash);新建/编辑/批量编辑/删除全闭环验证;列配置(候选=bk_project 模型属性,默认表头=getHeaderProperties 算法前 6 列)。**契约陷阱**: `/updatemany/project`、`/deletemany/project` 的 ids 必须是数字 `id` 字段,传 bk_project_id hash 会被后端以"反序列化JSON数据失败"拒绝;描述字段是 `bk_project_desc`(旧实现用 project_desc 被后端静默丢弃,已修) |
| 删除历史(主机/模型实例) | `src/ui/src/views/history/` | `/resource/history/host`、`/resource/history/instance/:objId` | 核心流程 | /find/inst_audit 按 resource_type 过滤+日期/IP 筛选;旧深链 `instance/:objId/history` 重定向;真实数据验证 |
| 管控区域 | `src/ui/src/views/cloud-area/` | `/resource/cloud-area` | 核心流程 | 表格内编辑、新增、区域选择和错误处理 |
| 云账户 | `src/ui/src/views/cloud-account/` | `/resource/cloud-account` | 核心流程 | 新增/编辑(PUT update/cloud/account)/删除/详情侧滑+关联同步任务(findmany/cloud/sync/task 条件 bk_account_id);注意描述字段为 bk_description |
| 云资源发现 | `src/ui/src/views/cloud-resource/` | `/resource/cloud-discover` | 核心流程 | cloudserver 已纳入 core profile;任务/账户管理可用,实际同步需真实云厂商凭据 |
| 跨业务主机转移 | 业务/主机操作旧版流程 | 业务拓扑「跨业务转移」对话框 | 核心流程 | 目标业务/模块级联选择+确认(/hosts/modules/across/biz);老版资源池页的 /hosts/resource/cross/biz 仅对业务空闲机生效(旧版 tooltip 明示,资源池主机不适用),非缺口 |

## 模型上下文

| 旧版能力/入口 | 旧版实现 | 新版入口 | 当前状态 | 替代门禁重点 |
|---|---|---|---|---|
| 模型管理 | `src/ui/src/views/model-manage/` | `/model/management` | 核心流程 | 分类、排序、模型 CRUD、导入导出和权限 |
| 模型详情 | `model-manage/children/model-details/` | `/model/management/details/:objId` | 核心流程 | 字段、关系(含编辑/删除)、唯一校验、验证详情 tabs |
| 模型拓扑 | `src/ui/src/views/model-topology/` | `/model/topology` | 核心流程 | 关联 CRUD、内置关系保护、布局和详情 |
| 关联类型 | `src/ui/src/views/model-association/` | `/model/association` | 核心流程 | 类型 CRUD、使用统计和模型关联列表 |
| 字段组合模板 | `src/ui/src/views/field-template/` | `/model/field-template` | 核心流程 | 多步创建/编辑/绑定、差异、同步结果、深链 |
| 字段分组 | 模型详情/通用 field-group 组件 | 模型详情内 | 部分迁移 | 分组 CRUD、移动字段和排序 |
| 模型实例 | `src/ui/src/views/general-model/` | `/resource/instance/:objId` | 核心流程 | 实例列表/搜索/分页、新建/编辑/删除/批量删除、详情抽屉、变更历史、列配置(localStorage)、Excel 导入+导出(真实闭环验证);旧版深链已兼容 |

## 运营与平台

| 旧版能力/入口 | 旧版实现 | 新版入口 | 当前状态 | 替代门禁重点 |
|---|---|---|---|---|
| 操作审计 | `src/ui/src/views/audit/` | `/analysis/audit` | 核心流程 | 资源类型筛选、详情、权限和分页 |
| 运营统计 | `src/ui/src/views/operation/` | `/analysis/operation` | 核心流程 | 图表 CRUD、排序、图表详情和字段敏感性 |
| 全局配置 | `src/ui/src/views/global-config/` | `/platform/global-config` | 核心流程 | 三 tab 对齐(旧版运行时即三 tab);未保存切 tab/离开确认、tab query 同步、旧路径 platform-management 重定向已补;保存契约修复为全量读-改-写(局部提交会被后端全量校验拒绝)并经真实回读验证 |

## 依赖型模块

| 模块 | 旧版实现 | 新版状态 | 放行条件 |
|---|---|---|---|
| 云资源发现/同步 | `src/ui/src/views/cloud-resource/` | 已接入 core | cmdb_cloudserver 已部署;账户密钥验证与实际同步需真实云厂商凭据和网络 |
| Pod/容器详情 | `src/ui/src/views/pod-details/` | 依赖阻塞 | Kubernetes 集群纳管和 Pod/容器 API 可用 |
| 外部 IAM/正式登录 | 旧版 router auth/interceptor(绑定蓝鲸 IAM) | 尚未实现 | **方向已定:对接开源方案体系**(OIDC/OAuth2 IdP、Casbin 等),不依赖蓝鲸权限中心;现有 StandaloneAPIKeyProxy 作为 OpenAPI/服务间鉴权基础;落地前 skip-login 模式验收 |

## 当前批次与发布门禁

1. **第一批（已完成）**：修复跨模块入口死链，建立路由/深链/错误状态 smoke 和本矩阵。
2. **第二批（已完成）**：业务拓扑/主机旧版深链兼容(`business/:bizId/index`、`business/:bizId/host/:id`、`resource/host/:id`、`resource/host/:business/:id`、`business-set/...`、`host-landing/:ip/:cloudId?`),业务上下文 params/query 双读。
3. **第三批（已完成）**：通用模型实例页(`/resource/instance/:objId`,列表/搜索/分页/新建/编辑/删除/批量删除/详情,必填校验,CRUD 真实回读验证);模型详情关联 tab 修复双向查询并支持编辑/删除(内置保护);旧版实例详情深链兼容。
4. **第四批（已完成）**：服务模板 create/details/edit 深链与 operational 旧链重定向;进程模板动态全量字段编辑(21 属性,必填校验,覆盖式更新真实回读);修复服务模板/集群模板删除请求体契约与叶子分类过滤。
5. **第五批（已完成）**：全局配置交互语义补齐(未保存确认/tab query/旧路径重定向)并修复保存契约为全量读-改-写(真实回读验证);模型实例变更历史(/find/inst_audit)。
6. **第六批（已完成）**：模型实例列配置与 Excel 导入(模板下载+上传真实闭环);业务拓扑跨业务转移对话框(替换"暂未支持"占位);修复主机导入走错前缀(/api/v3→根路径)的历史 bug。
7. **第七批（已完成）**：盘点确认主机自动应用向导/业务同步闭环/集群模板同步已达成核心流程;补齐 host-apply、set-sync、set/template、synchronous/module 旧版深链兼容;「未应用主机列表」标记为后端能力限制(仅 count 接口)。
8. **第八批（已完成）**：实例导出(修复 web_server 导出空 `$in` 条件的后端缺陷,重编 webserver 二进制,真实导出验证);业务详情页(属性/变更历史)+旧版深链;IAM 方向确认为对接开源方案体系。
9. **第九批（已完成）**：业务完整 CRUD(新建/编辑/归档/恢复/彻底删除,闭环验证);修复 createBusiness/updateHostProperties 根路径前缀 bug;业务集/项目详情页+旧版深链;项目列表改用专用接口;Roadmap 口径修正。
10. **第十批（已完成）**：全量 E2E 回归(run-route-smoke + run + b5~b13 共 10 个脚本)全部通过;修复 b6/b8/b9 过期选择器;b11 云账户 500 按 URL 归因标记为预期依赖阻塞(core profile 无 cmdb_cloudserver)。
11. **第十一批（已完成）**：云功能纳入核心模块——cmdb_cloudserver 编译部署(core profile),云账户 CRUD 打通(密钥不回显);移除前端依赖阻塞降级提示;Dockerfile/run.sh 更新。
12. **第十二批（已完成）**：业务集/项目列配置+项目批量编辑;修项目 ids 需数字 id 的契约陷阱(hash 被拒/描述字段 bk_project_desc)。
13. **第十三批（已完成）**：镜像重建固化(cloudserver+导出修复);移除 b11 云阻塞豁免。
14. **A/B/C/D 批（已完成）**：动态分组完整条件编辑器;云账户编辑/详情/任务关联;主机/业务批量编辑;自定义字段导入项对齐隐藏;进程模板 bind_info 多行;删除历史页;首页搜索落地与 404 已验证。

模块只有在页面、工作流、API 回读、权限/异常、视觉对比和 E2E 全部通过后，才能标记为“完整替代”。在此之前保留旧前端，不删除旧路由。

## 15. 资源与模型域复刻批次（已完成，2026-09-10）

本批次以旧版 `http://localhost:8091` 为行为和视觉基线，新版 `http://localhost:8090` 为交付目标，范围固定为：

### 资源菜单

| 菜单 | 旧版入口 | 新版入口 | 关键验收 |
|---|---|---|---|
| 资源目录 | `/resource/index` | `/resource/index` | 分类/模型卡片、实例数量、收藏、内置模型映射、普通模型跳转、加载/空/错态 |
| 管控区域 | `/resource/cloud-area` | `/resource/cloud-area` | 搜索、分页、排序、状态/主机数、未分配区域保护、删除限制、错误反馈 |
| 云账户 | `/resource/cloud-account` | `/resource/cloud-account` | 创建、编辑、删除、密钥不回显、详情侧滑、关联同步任务、字段契约 |
| 云资源发现 | `/resource/cloud-resource` | `/resource/cloud-discover` | 任务/账户列表、创建/编辑/详情/删除、账户/地域/资源/VPC 联动、同步状态和失败态 |

资源域必须保持旧版 query、请求体和接口前缀契约：`/api/v3` API 与 web_server 根路径的导入/导出/table 接口不得混用；主机资源目录及其模型实例、主机详情、删除历史深链不得回归。

### 模型菜单

| 菜单 | 旧版入口 | 新版入口 | 关键验收 |
|---|---|---|---|
| 模型管理 | `/model` | `/model/management` | 分类树、模型 CRUD、字段/唯一校验入口、导入导出、收藏/排序、权限/错误态 |
| 模型拓扑 | `/all/topology/new` | `/model/topology` | 模型/关系加载、节点布局、缩放/拖动/全屏、关联详情、关联 CRUD、内置关系保护 |
| 关联类型 | `/association` | `/model/association` | 关联类型列表、创建/编辑/删除、使用统计、模型关联展示和错误态 |
| 字段模板 | `/field-template` | `/model/field-template` | 列表/搜索/分页、创建/编辑/克隆、字段与唯一约束、绑定模型、差异/同步结果、历史/深链 |

### 本批完成门禁

1. 菜单层级、标题、高亮和旧版深链均正确；
2. 关键主流程具备真实 API 读写闭环，创建/编辑/删除后可回读；
3. 加载态、空态、错误态、禁用态和依赖阻塞态与旧版语义一致；
4. 旧版与新版在 1440×900、禁用缓存条件下完成截图对照；
5. 资源/模型专项 E2E、路由 smoke、构建、`git diff --check` 全部通过；
6. 测试数据清理完毕后，按功能文件显式提交，不提交 `.playwright-mcp/`、截图和构建产物。

### 实施结果（B18）

- **云域重写**：管控区域补行内改名、服务端模糊搜索/排序、`findmany/cloudarea/hostcount` 主机数合并、未分配置顶、系统限定/主机/同步任务三重删除保护提示；云账户接 `findmany/cloud/account/validity` 状态列（err_msg 异常 tooltip）、服务端搜索、行内查看/删除契约（编辑移入详情抽屉）；云资源发现按老版重构为单任务表 + 详情/编辑抽屉 + VPC 选择器（`findmany/cloud/sync/region`、`findmany/cloud/account/vpc/:id`），保存时按老版契约 `createmany/cloudarea {data:[...]}` 为新 VPC 建管控区域并按行回填 `bk_cloud_id`。
- **模型域收口**：拓扑连线标签改显关联类型中文名（含 bk_mainline），SVG 改容器自适应宽度修复右缘节点裁切，加载后 fitView；关联类型提示条文案/唯一标识链接样式/搜索框结构对齐；字段模板提示条对齐老版文案，工具栏合并为单搜索框（名称/模型/更新人 OR 过滤）+ 新建。
- **路由深链**：新增 `/resource` → `/resource/index`、`/resource/cloud-resource` → `/resource/cloud-discover`、`/model` → `/model/management` 重定向。
- **验收**：专项 `e2e/run-b18.cjs`（重定向/行内改名 API 回读/状态列/任务 CRUD 抽屉/模型四页加载/数据清理）+ b11 适配 + route smoke 全绿；8 组页面截图经三轮 judge 对照全部 pass（遗留修复：hostcount 列、空态单套化、空数据隐藏分页、列宽溢出、拓扑标签中文化与裁切、关联/字段模板文案与工具栏）。
- 截图基线：`src/ui-v3/screenshots/resource-model/`（old-*/new-* 各 8 张）。

## 16. 业务工作台深度收口批次（已完成，2026-09-10，B19）

1. **B8 E2E 迁移**：业务集拓扑断言从旧版 `.el-card .el-table` 迁移到当前工作台结构——`.bs-item` 列表、`.topology-panel`/`.detail-panel`、主机/服务实例/节点信息三 tab；点击拓扑节点断言主机查询请求体带真实节点条件；服务实例 tab 触发业务集专用查询。集群模板段同步适配独立页面结构（新建跳转 `set/template/create` 创建页，老版契约）。
2. **HostApply 收口**：未应用主机对话框新增「直接应用」（按当前节点现有规则执行，载荷 `additional_rules:[] + changed:true`——后端契约要求无规则变更时必须带 changed 才建任务）；执行失败副标题如实展示任务 ID 并说明后端 status 接口仅返回 `{task_id,status}`（无逐主机失败原因，不伪造）。多目标批量编辑的 `additional_rules` 按目标分别组装此前已达成。
3. **回归入口统一**：`run-all.cjs` 纳入 b15/b16/b17/b18，失败自动重跑一次并如实报告；b15/b16/b17 适配平铺业务路由→规范 bizId 路由的重定向（hash 比较剥离数字段）；b17 改为自建服务模板夹具（创建→流程→清理，不再依赖外部遗留数据）；b15 云账户段适配 B18 后的「查看抽屉→编辑」路径，SecretID 改为每次运行唯一。
4. **环境事实**：cmdb-mongodb 被外部以约 1 次/分钟的节奏干净重启（RestartCount 571+，ExitCode=0，无 OOM，宿主机无 crontab），写接口间歇性 1199018/1199998——E2E 失败先重跑再归因。
