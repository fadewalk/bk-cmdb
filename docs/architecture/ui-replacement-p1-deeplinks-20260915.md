# P1-2 旧深链与 HostApply 状态复刻 — 2026-09-15

## 已补齐

### 业务历史

旧版 `business/history` 是“已归档业务”列表，不是删除历史。v3 已有 `BusinessList.vue` 的 `正常/已归档` tab 和真实恢复/彻底删除 API，本批新增：

```text
/business/history → /resource/business/history
```

并让 `BusinessList` 根据 `route.meta.businessScope` 初始化 `archived` scope。复制 URL、刷新和旧入口现在进入同一真实归档列表语义。

### HostApply stage

旧版独立 stage：

```text
host-apply/:mode/confirm
host-apply/:mode/edit
host-apply/:mode/run
host-apply/:mode/conflict
host-apply/:mode/failed
```

v3 原先只对 `confirm` 恢复向导，对 `run/conflict/failed` 只提示“暂无执行中的任务”。本批在现有 `HostApply.vue` 上补齐：

- `stage=conflict`：加载当前模块/服务模板的未应用主机预览，打开冲突列表；
- `stage=run&task_id=...` 或 `task_ids=...`：打开执行结果并使用现有 status API 轮询；
- `stage=failed&task_id=...`：直接进入失败结果，可重试；
- 无任务 ID 时保留明确提示，不伪造执行结果。

没有新增后端 API，也没有改变原有配置/预览/执行 payload。

## 验收

- 业务历史使用 v3 真实归档查询/恢复/彻底删除契约；
- HostApply 复用既有 `getHostApply*Status`、`preview*`、`run*` API；
- 构建和 route smoke 需在本批验证；
- 真实任务 ID、权限、后端状态不可用时，页面明确 blocked/提示，不显示成功。

## 下一批

继续补字段模板 binding/sync 独立深链、Pod/Container 详情链和服务实例 create/clone 的交互等价；再进入低 caller wrapper 接入。
