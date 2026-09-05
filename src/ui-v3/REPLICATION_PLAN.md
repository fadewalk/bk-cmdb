# 新前端复刻计划(对照老版路由逐页执行)

> 基准:老前端 http://localhost:8091(源码 src/ui),逐页实测 DOM 后在新前端实现。
> 状态标记:✅ 完成 | 🔨 进行中 | ⬜ 待做

## 路由对照与批次

| 老版路由 | 页面 | 状态 | 剩余工作 |
|---|---|---|---|
| #/index | 首页(搜索+地图) | ✅ | — |
| #/business/{id}/index | 业务拓扑(左树+主机/服务实例/节点信息) | ✅ | 树节点右键菜单已实现、主机分页+字段设置已实现 |
| #/business/{id}/service/instance | 服务实例(老版并入拓扑页) | ✅ | 拓扑页内置新建向导(选主机→加进程)+ 进程抽屉编辑 |
| #/business/{id}/service/template | 服务模板 | ✅ | — |
| #/business/{id}/set/template | 集群模板 | ✅ | — |
| #/business/{id}/service/cagetory | 服务分类 | ✅ | — |
| #/business/{id}/host-apply | 主机自动应用 | ⬜ | 规则创建/编辑向导 |
| #/business/{id}/custom-query | 动态分组 | ✅ | — |
| #/business/{id}/custom-fields | 自定义字段 | ✅(可用) | 字段编辑(改名字段) |
| #/resource/index | 资源目录 | ✅(可用) | 各分类点击进对应列表 |
| #/resource/host | 主机列表 | 🔨 | 导入主机(Excel)、批量编辑、更多操作 |
| #/resource/business | 业务列表 | ⬜ | 独立业务列表页(回收/恢复) |
| #/resource/cloud-area | 管控区域 | ⬜ | 列表+新建(独立模式仅 Default Area) |
| #/resource/cloud-account | 云账户 | ⬜ | 列表+新建对话框(表单完整) |
| #/resource/cloud-resource | 云资源发现 | ⬜ | 依赖云供应商,做空态引导 |
| #/model/index | 模型管理 | ✅ | — |
| #/model/index/details/{obj} | 模型详情 | ✅ | 字段编辑(改名字段)、分组管理 |
| #/model/all/topology/new | 模型关系(图) | ✅(简版) | 拖拽布局已做,可加缩放 |
| #/model/association | 关联类型 | ✅(可用) | 新建/编辑/删除关联类型 |
| #/model/field-template | 字段组合模板 | ✅(可用) | 新建/绑定 |
| #/model/business/topology | 业务层级 | ✅(可用) | — |
| #/analysis/audit | 操作审计 | ✅(可用) | 完整筛选面板(业务/类型/动作下拉) |
| #/analysis/operation | 运营统计 | ✅(简版) | 图表化(ECharts) |
| #/platform-management/global-config | 全局配置 | ✅(只读) | — |

## 执行批次

- **B1**:服务模板真实交互(新建/编辑/克隆/删除)+ 服务分类增删改 + 动态分组新建
- **B2**:集群模板增删改 + 操作审计完整筛选 + 主机自动应用启用流程
- **B3**:业务拓扑右键菜单 + 主机分页 + 字段显示设置 + 服务实例向导(选主机→配进程)+ 进程抽屉编辑
- **B4**:资源目录分类联动 + 主机导入(Excel)+ 云账户/管控区域列表
- **B5**:运营统计图表化 + 字段/关联类型编辑

> 每批完成后构建部署、双端对比截图验证、提交。
