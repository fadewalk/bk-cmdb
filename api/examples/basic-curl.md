# Open API 示例

## 查询模型

```bash
export CMDB_API_KEY='replace-with-a-long-random-secret'
curl -H "X-API-Key: ${CMDB_API_KEY}" \
  'http://localhost:8090/api/v3/find/object'
```

## 创建模型实例

```bash
curl -X POST \
  -H 'Authorization: Bearer <standalone-token>' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: cmdb-example-001' \
  'http://localhost:8090/api/v3/create/instance/object/host' \
  -d '{
    "bk_obj_id": "host",
    "bk_inst_name": "example-host"
  }'
```

> 示例使用当前 `/api/v3` 兼容路径。请求体的具体字段以对应接口文档和模型定义为准。未设置 `CMDB_API_KEY` 时，standalone 仍使用现有浏览器 Session/skip-login 开发模式。
