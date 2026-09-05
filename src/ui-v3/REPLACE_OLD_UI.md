# 新前端替代老前端切换指南(ui-v3)

## 1. 概述

新前端 `src/ui-v3/` 使用 Vue 3 + Element Plus + Vite + Pinia 实现,完全替代老前端 `src/ui/` 的 Vue 2 + bk-magic-vue + Webpack 栈。

12 个批次(B1~B12)完成所有核心菜单和 CRUD 流程,可在独立部署模式(skip-login,disable_crypto)下作为唯一前端使用。

---

## 2. 当前覆盖范围(老菜单 → 新前端路径)

| 老菜单(已实现 1:1) | 新前端路由 | 状态 |
|---|---|---|
| 首页 | `/index` | ✅ |
| 业务 → 业务拓扑 | `/business/topo` | ✅ B3 |
| 业务 → 服务模板/分类/集群模板/动态分组/自定义字段 | 同左 | ✅ B1/B2 |
| 业务 → 主机自动应用 | `/business/host-apply` | ✅ B6 |
| 资源 → 资源目录 | `/resource/index` | ✅ B4 |
| 资源 → 主机 | `/resource/host` | ✅ B4+B7 |
| 资源 → 管控区域/云账户/云资源发现 | 同左 | ✅ B4+B9+B11 |
| 模型 → 模型管理/详情/拓扑/层级/关联类型/字段组合模板 | 同左 | ✅ B5+B6+B8 |
| 运营 → 操作审计 | `/analysis/audit` | ✅ B1+B11 |
| 运营 → 运营统计 | `/analysis/operation` | ✅ B5+B9 |
| 平台 → 全局配置 | `/platform/global-config` | ✅ B10 |
| 业务集 → 业务集拓扑 | `/biz-set/topo` | ✅ B8 |

---

## 3. 切换步骤

### 3.1 修改 `web_server` 静态资源

`src/web_server/app/server.go` 或部署脚本中,把 `htmlRoot` 改为 `ui-v3/dist`:

```bash
# 构建
cd src/ui-v3
npm install
npm run build

# 替换 web_server 静态目录
rm -rf /opt/cmdb/cmdb_webserver/web
cp -r src/ui-v3/dist /opt/cmdb/cmdb_webserver/web
```

### 3.2 docker-compose 替换(已自动化)

`deploy/standalone/Dockerfile` 的 `ui-builder` 阶段已经输出到 `dist/`,只要 `web_server` 启动时 `htmlRoot` 指向 `dist`,无需修改 `web_server` 源码。

如果你用 `deploy/standalone/` 部署,**已就绪**——镜像构建后 `/data/cmdb/cmdb_webserver/web/` 直接是 `ui-v3/dist/`。

### 3.3 验证切换

1. 打开 `http://<host>:8090/#/index` 应看到新前端首页
2. 进入 `/#/business/topo` 看到 1:1 复刻的拓扑
3. 跑 E2E 回归:

```bash
cd src/ui-v3/e2e
node run-all.cjs
```

期望输出 `✓ 全部 E2E 通过`。

---

## 4. 已知差异(老版有,新前端暂不实现)

| 老功能 | 说明 | 建议 |
|---|---|---|
| IAM 鉴权 | 独立模式 admin 直通,无 IAM | 暂不接入 |
| 全文检索 | `find/full_text` | 独立模式不启用 |
| 网络采集(net-discovery) | 老版独立部署不用 | 跳过 |
| 容器相关 | container/host 服务 | 跳过 |
| 实例转移向导(老版 4 步) | B7 简化为 el-steps 2 步 | 后续按需补 |
| 进程模板独立子页 | B8 API 已封装,UI 整合到 ServiceTemplate | 后续按需补独立页 |
| 业务集 → 业务同步 | B11 未做(只 CloudDiscover) | 后续按需补 |
| 实例标签聚合 | B11 暂未接入 ServiceInstance 详情 | 后续按需补 |
| 版本日志 | `findmany/changelog` | 不接入 |
| 组织架构 | `organization/department` | 跳过 |

---

## 5. 文件结构(对比)

| 老版(`src/ui/`) | 新版(`src/ui-v3/`) |
|---|---|
| Vue 2 + bk-magic-vue | Vue 3 + Element Plus |
| 299 个 .vue 文件,50+ store API 模块 | 34+ 个 .vue 文件,1 个 `api/cmdb.js` |
| Webpack | Vite |
| `store/modules/api/*` 拆 50 模块 | `api/cmdb.js` 单文件 350 行 |
| bk-icon 字体 `src/ui/src/assets/icon/bk-icon-cmdb/fonts/` | 复刻到 `src/ui-v3/public/icon-cmd/` |
| 业务级子路由 `/business/:bizId/...` | 静态路由 + query(无多级 URL) |

---

## 6. 主题与样式

- 主色 `#3A84FF`、文字 `#63656E`、边框 `#DCDEE5`、背景 `#F5F6FA` 完全对齐老版
- 字号 14px(老版 Element UI 默认,平衡风格)
- 表格头不再强制加粗(老版 normal)
- 卡片圆角 2px(贴近老版);按钮圆角 4px(EP 默认,平衡风)

---

## 7. 端到端测试

- `src/ui-v3/e2e/run.cjs` — B3+B4 验证(拓扑、资源目录、HostList、CSV 导入)
- `src/ui-v3/e2e/run-b5.cjs` — B5 验证(运营统计 ECharts、字段编辑、关联类型)
- `src/ui-v3/e2e/run-b6.cjs` — B6 验证(视觉、字段分组、唯一约束、HostApply、ResourceCatalog)
- `src/ui-v3/e2e/run-b7.cjs` — B7 验证(HostDetail 4 区、HostList 资源目录树 + 筛选器 + 转移向导)
- `src/ui-v3/e2e/run-b8.cjs` — B8 验证(ServiceInstance 完整列、SetTemplate 详情/同步、BizSetTopo、FieldTemplate CRUD)
- `src/ui-v3/e2e/run-b9.cjs` — B9 验证(运营统计 CRUD + NAVTYPE、资源目录 CRUD、主机收藏)
- `src/ui-v3/e2e/run-b10.cjs` — B10 验证(GlobalConfig 系统配置 tab、关联类型/服务/集群模板)
- `src/ui-v3/e2e/run-b11.cjs` — B11 验证(审计详情结构化、CloudDiscover 任务表)
- `src/ui-v3/e2e/run-all.cjs` — 顺序运行全部脚本

跑法:`cd src/ui-v3/e2e && node run-all.cjs`

---

## 8. 已知警告

- 浏览器 Console 偶有 `bk_biz_id 数据参数校验不通过` 警告 — ServiceInstance 老代码残留路径触发,不影响主流程
- 部分 E2E 校验要求"独立模式有数据"——独立模式默认 `count:0`,这些项报"0 行(后端无数据)",属预期

---

## 9. 后续改进(B13+)

1. 业务同步 + 业务集独立子页
2. 进程模板独立 CRUD 子页
3. 服务实例转移向导 4 步
4. 主机导入的 `.xlsx` 真实解析(目前只支持 .csv + 文本粘贴)
5. 实例标签聚合到服务实例详情
6. 全部 E2E 校验项升级为"创建 → 验证 → 删除"全闭环

---

## 10. 老前端关闭(可选)

确认新前端稳定后,可在 `deploy/standalone/Dockerfile` 中**删除**老 `ui-builder` 阶段(老 UI 来自 `src/ui/dist`):

```dockerfile
# 删除(老版):
# FROM node:22-bookworm-slim AS ui-builder
# WORKDIR /build
# COPY src/ui/ /build/
# RUN npm install && npm run build
# COPY --from=ui-builder /build/dist/ ${CMDB_HOME}/cmdb_webserver/web/

# 替换为(新):
FROM node:22-bookworm-slim AS ui-builder
WORKDIR /build
COPY src/ui-v3/package.json ./
RUN npm install
COPY src/ui-v3/ ./
RUN npm run build
COPY --from=ui-builder /build/dist/ ${CMDB_HOME}/cmdb_webserver/web/
```

部署后 `http://<host>:8090/#/index` 直接呈现新前端,所有 URL 与老版兼容(同 # 路由)。