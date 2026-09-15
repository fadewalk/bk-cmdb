# ui-v3 运营统计图表位置保存证据（2026-09-15）

## 旧版事实源

- 旧版页面：`src/ui/src/views/operation/index.vue`
- 旧版位置更新函数 `updatePosition()` 收集两个列表的 `config_id`，请求体严格为：

```json
{
  "position": {
    "host": [1, 2],
    "inst": [3, 4]
  }
}
```

- 旧版调用：`POST /api/v3/update/operation/chart/position`。
- 后端 `metadata.ChartPosition` / `metadata.PositionInfo` 只接受 `position.host` 与 `position.inst` 的数字 ID 数组；服务端更新时删除旧位置记录后插入新记录。
- 旧版上下移动通过相邻项交换实现，并在交换后调用 `updatePosition()`；本批次未凭空引入新的拖拽库或接口。
- 图表列表 read-back 使用运营统计列表响应中的 `info.host`、`info.inst`、`info.nav`。v3 兼容历史代码中曾使用的 `info.model` 回退字段，但优先使用后端旧版的 `info.inst`。

## v3 变更

- `src/ui-v3/src/views/operation/Operation.vue`
  - 复用已经存在的 `updateOperationChartPosition` caller（API helper 已在 `src/ui-v3/src/api/cmdb.js` 中定义，无需新增伪造 endpoint）。
  - 主机/模型图表增加上移、下移按钮；按钮交换当前分类内相邻图表。
  - 保存时发送 `{ position: { host: number[], inst: number[] } }`。
  - 成功显示 `图表位置已保存`；失败显示 `图表位置保存失败: ...`，随后重新 read-back 服务端列表，避免保留未确认的本地顺序。
  - 只对 host/model 分类写入位置；nav/resource 不写入旧版 host/inst 位置数组。

## Contract/E2E 证据

- `src/ui-v3/e2e/run-b47-operation-position.cjs`
  - mock `GET /findmany/operation/chart` 返回 `info.host` / `info.inst`。
  - 断言点击下移后请求 URL、方法和 body：
    `{ position: { host: [102, 101], inst: [201, 202] } }`。
  - 断言成功反馈和 reload 后 read-back 顺序保持。
  - mock 位置保存失败，断言失败反馈以及重新 read-back 后恢复服务端顺序。

执行结果：

```text
✓ updateOperationChartPosition body + success feedback
✓ operation chart position read-back preserves host order
✓ updateOperationChartPosition failure feedback + rollback read-back
B47 E2E 全部通过
```

执行命令：

```bash
UI_V3_BASE_URL=http://127.0.0.1:9090/static \
  node src/ui-v3/e2e/run-b47-operation-position.cjs
```

该命令使用本地 Vite dev server 与 Playwright route mock，不写入真实图表位置数据。
