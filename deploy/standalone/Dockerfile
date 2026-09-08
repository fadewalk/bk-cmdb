#******************************************************************************
# bk-cmdb 独立部署镜像(无蓝鲸平台依赖)
#
# 三阶段构建:
#   1. ui-builder   : 构建全新前端(src/ui-v3: Vue3 + Element Plus + Vite),产物为纯静态文件
#   2. go-builder   : 关闭国密(disable_crypto)、关闭 CGO,构建纯静态 Go 二进制
#   3. runtime      : 仅包含二进制 + 前端产物 + 错误码/多语言资源
#
# 独立化说明:
#   - 前端已替换为 Vue3 + Element Plus 实现(src/ui-v3),不再使用旧版 Vue2 + bk-magic-vue
#   - 只构建核心链路服务,不含 synchronize/cloud/auth(权限中心)/transfer 等蓝鲸场景服务
#   - 编译期禁用国密 SDK,无需铜锁(Tongsuo)环境
#******************************************************************************

# ---------- 1. 前端构建 ----------
FROM node:22-bookworm-slim AS ui-builder

WORKDIR /build

# 先装依赖,利用层缓存
COPY src/ui-v3/package.json ./
RUN npm install --registry=https://registry.npmmirror.com --no-audit --no-fund

COPY src/ui-v3/ ./
RUN npm run build


# ---------- 2. 后端构建 ----------
FROM golang:1.25-bookworm AS go-builder

ARG STANDALONE_PROFILE=core
WORKDIR /build

ENV GOPROXY=https://goproxy.cn,direct \
    CGO_ENABLED=0

# 先下载依赖,利用层缓存
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# 核心链路服务目标(standalone 默认构建核心入口;云同步/跨 CMDB 同步等业务源码保留,按 profile 可选构建)
# 所有 standalone 服务显式以 open_source 配置运行,不依赖腾讯蓝鲸平台。
RUN set -eux; \
    mkdir -p /out; \
    targets="apiserver:cmdb_apiserver web_server:cmdb_webserver scene_server/admin_server:cmdb_adminserver scene_server/topo_server:cmdb_toposerver scene_server/host_server:cmdb_hostserver scene_server/proc_server:cmdb_procserver scene_server/event_server:cmdb_eventserver scene_server/task_server:cmdb_taskserver scene_server/datacollection:cmdb_datacollection scene_server/operation_server:cmdb_operationserver scene_server/cloud_server:cmdb_cloudserver source_controller/coreservice:cmdb_coreservice source_controller/cacheservice:cmdb_cacheservice"; \
    case "${STANDALONE_PROFILE}" in \
      core) ;; \
      cloud) targets="${targets} scene_server/cloud_server:cmdb_cloudserver" ;; \
      sync) targets="${targets} scene_server/synchronize_server:cmdb_synchronizeserver" ;; \
      transfer) targets="${targets} source_controller/transfer-service:cmdb_transferservice" ;; \
      full) targets="${targets} scene_server/cloud_server:cmdb_cloudserver scene_server/synchronize_server:cmdb_synchronizeserver source_controller/transfer-service:cmdb_transferservice" ;; \
      *) echo "unsupported STANDALONE_PROFILE: ${STANDALONE_PROFILE}" >&2; exit 1 ;; \
    esac; \
    for target in ${targets}; do \
      src="${target%%:*}"; bin="${target##*:}"; \
      mkdir -p "/out/${bin}"; \
      go build -tags=disable_crypto -o "/out/${bin}/${bin}" "configcenter/src/${src}"; \
    done


# ---------- 3. 运行时 ----------
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl tzdata procps \
    && rm -rf /var/lib/apt/lists/* \
    && ln -snf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && echo Asia/Shanghai > /etc/timezone

ENV CMDB_HOME=/data/cmdb

COPY --from=go-builder /out/ ${CMDB_HOME}/

# 错误码 / 多语言资源(admin 与 web_server 本地加载)
COPY resources/errors/    ${CMDB_HOME}/resources/errors/
COPY resources/language/  ${CMDB_HOME}/resources/language/
# 前端版本日志(web_server 版本日志页)
COPY docs/support-file/changelog_user/ ${CMDB_HOME}/changelog_user/

# 前端静态产物(Vue3 + Element Plus,web_server 以 /static 托管 assets)
COPY --from=ui-builder /build/dist/ ${CMDB_HOME}/cmdb_webserver/web/

# 独立模式配置文件
COPY deploy/standalone/configs/migrate.yaml   ${CMDB_HOME}/cmdb_adminserver/configures/migrate.yaml
COPY deploy/standalone/configs/mongodb.yaml   ${CMDB_HOME}/cmdb_adminserver/configures/mongodb.yaml
COPY deploy/standalone/configs/redis.yaml     ${CMDB_HOME}/cmdb_adminserver/configures/redis.yaml
COPY deploy/standalone/configs/common.yaml    ${CMDB_HOME}/cmdb_adminserver/configures/common.yaml
COPY deploy/standalone/configs/extra.yaml     ${CMDB_HOME}/cmdb_adminserver/configures/extra.yaml
COPY deploy/standalone/configs/web.yaml       ${CMDB_HOME}/cmdb_webserver/web.yaml

COPY deploy/standalone/run.sh /run.sh
RUN chmod +x /run.sh && mkdir -p ${CMDB_HOME}/logs

WORKDIR ${CMDB_HOME}
EXPOSE 8090

ENTRYPOINT ["/run.sh"]
