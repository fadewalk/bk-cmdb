# bk-cmdb 独立部署(无蓝鲸平台依赖)

本目录提供一套**完全独立运行**的 bk-cmdb 部署方案:不依赖任何腾讯蓝鲸平台组件
(PaaS/ESB、权限中心 IAM、GSE、监控平台、日志平台),只用三个开源中间件即可跑起来。

## 组成

| 组件 | 说明 |
|---|---|
| zookeeper:3.8 | 服务注册发现 + 配置中心(CMDB 自身机制) |
| mongo:4.4 | 主存储,单节点副本集(依赖 change stream) |
| redis:6.2 | 缓存/会话 |
| cmdb 容器 | 12 个 Go 服务 + 前端静态资源,单容器多进程 |

包含的服务(核心链路):

```
cmdb_apiserver      API 网关          cmdb_eventserver     事件服务
cmdb_webserver      Web/前端托管      cmdb_taskserver      异步任务
cmdb_adminserver    配置中心/DB初始化  cmdb_datacollection  数据采集(待机)
cmdb_coreservice    核心原子层         cmdb_operationserver 运营统计
cmdb_cacheservice   缓存原子层         cmdb_toposerver      拓扑/模型
cmdb_hostserver     主机服务          cmdb_procserver      进程服务
```

**裁剪掉的服务**(需要蓝鲸体系才有意义):synchronize(多集群同步)、cloud(云同步)、
auth(权限中心对接)、transfer-service(跨云区域转移)。

## 与原版的差异(独立化改造点)

不改任何 Go 源码,只通过配置实现"去蓝鲸":

| 项 | 原版 | 独立模式 |
|---|---|---|
| 登录 | 蓝鲸 PaaS 统一登录 | `skip-login` 免登录(自动以 admin 进入) |
| 权限 | 蓝鲸权限中心 IAM | `internal` 内置权限 |
| 监控上报 | 蓝鲸监控平台 | `noop` 插件 |
| 主机身份下发/快照 | GSE | 关闭/待机 |
| 全文检索 | ES + 日志平台 | 关闭 |
| 国密加密 | 铜锁(Tongsuo) | 编译期 `-tags=disable_crypto` 绕过,**无需安装铜锁** |

## 使用

```bash
# 构建并启动(首次构建约 10-20 分钟,需网络下载 go/npm 依赖)
docker compose -f deploy/standalone/docker-compose.yml up -d --build

# 查看启动日志
docker logs -f cmdb

# 访问
open http://localhost:8090
```

停止:`docker compose -f deploy/standalone/docker-compose.yml down`
(数据保存在 `mongodb-data` volume,down 不删数据;`down -v` 才会清库)

## 配置文件说明(`configs/`)

- `migrate.yaml`:admin_server 本地引导配置(指向 ZK,声明其余配置所在目录)
- `mongodb.yaml` / `redis.yaml` / `common.yaml` / `extra.yaml`:由 admin_server 启动时刷入 ZK,其余服务从 ZK 拉取
- `web.yaml`:web_server 本地读取(登录模式、权限模式、前端路径等)

## 目录布局(容器内)

```
/data/cmdb/
├── cmdb_adminserver/          # 二进制 + configures/(5 个配置)
├── cmdb_webserver/            # 二进制 + web.yaml + web/(前端产物)
├── cmdb_apiserver/ ...        # 其余 10 个服务,每服务一个目录
├── resources/{errors,language}/   # 错误码/多语言资源
├── changelog_user/            # 前端版本日志
└── logs/                      # 运行日志
```
