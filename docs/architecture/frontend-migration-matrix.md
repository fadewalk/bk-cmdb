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
| 首页主机搜索 | `src/ui/src/views/index/` | `/index` | 部分迁移 | IP/固资编号/模糊搜索、结果落地和返回状态 |
| 首页全文检索 | `src/ui/src/views/index/children/full-text-search/` | `/index` | 依赖阻塞 | ES 开启时的全文结果、结果类型和详情跳转 |
| 无业务/无权限/错误/404/无搜索结果 | `src/ui/src/views/status/` | `/404`、通用错误状态 | 部分迁移 | 动态路由权限、业务不存在、资源不存在和错误恢复 |

## 业务上下文

| 旧版能力/入口 | 旧版实现 | 新版入口 | 当前状态 | 替代门禁重点 |
|---|---|---|---|---|
| 业务拓扑 | `src/ui/src/views/business-topology/` | `/business/topo` | 核心流程 | 业务上下文刷新、主机/服务实例/Pod tab、节点创建和操作 |
| 业务拓扑主机详情 | `business-topology` + `host-details` | `/host-detail?id=...` | 部分迁移 | 旧版多上下文深链兼容、属性/服务/Pod/关联/历史 tabs |
| 主机操作 | `src/ui/src/views/host-operation/` | 业务拓扑/主机列表内操作 | 部分迁移 | 新增、编辑、批量编辑、转移、导入导出、自动应用 |
| 服务实例与进程 | `business-topology/service-instance/` | `/business/service-instance` + 业务拓扑抽屉 | 核心流程 | 创建、克隆、标签、批量删除、进程 CRUD、真实回读 |
| 服务模板 | `src/ui/src/views/service-template/` | `/business/service-template` | 核心流程 | create/details/edit 深链、配置/实例 tabs、同步状态 |
| 集群模板 | `src/ui/src/views/set-template/` | `/business/set-template` | 部分迁移 | create/details/edit、实例配置和同步历史 |
| 集群模板同步 | `src/ui/src/views/set-sync/` | 无等价新版路由 | 未迁移 | 模块/属性差异、实例同步、历史记录 |
| 服务分类 | `src/ui/src/views/service-category/` | `/business/service-category` | 核心流程 | 分类树、父子分类 CRUD、统计和错误状态 |
| 主机自动应用 | `src/ui/src/views/host-apply/` | `/business/host-apply` | 部分迁移 | 多步配置、确认、执行、冲突/失败列表、任务恢复 |
| 动态分组 | `src/ui/src/views/dynamic-group/` | `/business/dynamic-group` | 部分迁移 | 1202px 编辑侧滑、条件编辑、预览、清空确认 |
| 自定义字段 | `src/ui/src/views/custom-fields/` | `/business/custom-fields` | 部分迁移 | 字段分组、导入、字段详情和完整 CRUD |
| 业务同步 | `src/ui/src/views/business-synchronous/` | `/business/sync` | 部分迁移 | 模块实例、属性/进程差异、同步执行和结果 |

## 资源上下文

| 旧版能力/入口 | 旧版实现 | 新版入口 | 当前状态 | 替代门禁重点 |
|---|---|---|---|---|
| 资源目录 | `src/ui/src/views/resource/` | `/resource/index` | 部分迁移 | 全量资源分类、实例列表和详情跳转 |
| 资源池主机 | `resource/index`、`host-details` | `/resource/host` | 核心流程 | 目录筛选、收藏、导入导出、转移、列配置、历史 |
| 通用模型实例 | `src/ui/src/views/general-model/` | 无等价深度实例路由 | 未迁移 | 新建/批量编辑/删除、属性/关联/历史、导入 |
| 业务管理/详情/归档 | `src/ui/src/views/business/` | `/resource/business` | 部分迁移 | 新建编辑、批量修改、归档/恢复/彻底删除、详情 tabs |
| 业务集管理/详情 | `src/ui/src/views/business-set/` | `/resource/biz-set` | 部分迁移 | 详情 tabs、业务集拓扑消费和深链 |
| 项目管理/详情 | `src/ui/src/views/project/` | `/resource/project` | 部分迁移 | 新建编辑、批量修改、列配置、详情 tabs |
| 主机历史 | `src/ui/src/views/history/` | 无等价深链 | 未迁移 | 变更记录展示、筛选和详情 |
| 管控区域 | `src/ui/src/views/cloud-area/` | `/resource/cloud-area` | 核心流程 | 表格内编辑、新增、区域选择和错误处理 |
| 云账户 | `src/ui/src/views/cloud-account/` | `/resource/cloud-account` | 部分迁移 | 新增/编辑/删除、详情侧滑和任务关联 |
| 云资源发现 | `src/ui/src/views/cloud-resource/` | `/resource/cloud-discover` | 依赖阻塞 | 云账户/VPC/资源选择、任务详情/历史；需云供应商数据 |
| 跨业务主机转移 | 业务/主机操作旧版流程 | 新版提示资源池中转 | 部分迁移 | 跨业务模块选择、非法列表和确认流程 |

## 模型上下文

| 旧版能力/入口 | 旧版实现 | 新版入口 | 当前状态 | 替代门禁重点 |
|---|---|---|---|---|
| 模型管理 | `src/ui/src/views/model-manage/` | `/model/management` | 核心流程 | 分类、排序、模型 CRUD、导入导出和权限 |
| 模型详情 | `model-manage/children/model-details/` | `/model/management/details/:objId` | 核心流程 | 字段、关系(含编辑/删除)、唯一校验、验证详情 tabs |
| 模型拓扑 | `src/ui/src/views/model-topology/` | `/model/topology` | 核心流程 | 关联 CRUD、内置关系保护、布局和详情 |
| 关联类型 | `src/ui/src/views/model-association/` | `/model/association` | 核心流程 | 类型 CRUD、使用统计和模型关联列表 |
| 字段组合模板 | `src/ui/src/views/field-template/` | `/model/field-template` | 核心流程 | 多步创建/编辑/绑定、差异、同步结果、深链 |
| 字段分组 | 模型详情/通用 field-group 组件 | 模型详情内 | 部分迁移 | 分组 CRUD、移动字段和排序 |
| 模型实例 | `src/ui/src/views/general-model/` | `/resource/instance/:objId` | 核心流程 | 实例列表/搜索/分页、新建/编辑/删除/批量删除、详情抽屉;旧版深链 `/resource/instance/:objId/:instId` 已兼容;导入/列配置/历史 tab 未迁移 |

## 运营与平台

| 旧版能力/入口 | 旧版实现 | 新版入口 | 当前状态 | 替代门禁重点 |
|---|---|---|---|---|
| 操作审计 | `src/ui/src/views/audit/` | `/analysis/audit` | 核心流程 | 资源类型筛选、详情、权限和分页 |
| 运营统计 | `src/ui/src/views/operation/` | `/analysis/operation` | 核心流程 | 图表 CRUD、排序、图表详情和字段敏感性 |
| 全局配置 | `src/ui/src/views/global-config/` | `/platform/global-config` | 部分迁移 | 业务配置、平台信息、ID 生成、模块构造、校验规则、空闲机池、离开确认 |

## 依赖型模块

| 模块 | 旧版实现 | 新版状态 | 放行条件 |
|---|---|---|---|
| 云资源发现/同步 | `src/ui/src/views/cloud-resource/` | 依赖阻塞 | standalone 或生产环境提供云供应商、账户、VPC 和任务数据链路 |
| Pod/容器详情 | `src/ui/src/views/pod-details/` | 依赖阻塞 | Kubernetes 集群纳管和 Pod/容器 API 可用 |
| 外部 IAM/正式登录 | 旧版 router auth/interceptor | 尚未完全验收 | admin/skip-login 与正式登录/IAM 各自完成权限、会话和错误路径测试 |

## 当前批次与发布门禁

1. **第一批（已完成）**：修复跨模块入口死链，建立路由/深链/错误状态 smoke 和本矩阵。
2. **第二批（已完成）**：业务拓扑/主机旧版深链兼容(`business/:bizId/index`、`business/:bizId/host/:id`、`resource/host/:id`、`resource/host/:business/:id`、`business-set/...`、`host-landing/:ip/:cloudId?`),业务上下文 params/query 双读。
3. **第三批（已完成）**：通用模型实例页(`/resource/instance/:objId`,列表/搜索/分页/新建/编辑/删除/批量删除/详情,必填校验,CRUD 真实回读验证);模型详情关联 tab 修复双向查询并支持编辑/删除(内置保护);旧版实例详情深链兼容。
4. **第四批（进行中）**：模型导入导出完整流程、模型实例导入/列配置/变更历史、服务模板 create/details/edit 深链与进程模板完整编辑。
5. **第五批**：主机自动应用完整向导、全局配置完整子页面、业务同步、集群模板同步和资源详情深链。
6. **第六批**：云资源、Pod、跨业务转移及正式 IAM;依赖不足时明确阻塞,不用占位页冒充完成。

模块只有在页面、工作流、API 回读、权限/异常、视觉对比和 E2E 全部通过后，才能标记为“完整替代”。在此之前保留旧前端，不删除旧路由。
