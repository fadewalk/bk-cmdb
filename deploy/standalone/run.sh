#!/bin/bash
#******************************************************************************
# bk-cmdb 独立模式容器内启动脚本
#
# 启动顺序:
#   1. 等待 ZooKeeper / MongoDB / Redis 就绪
#   2. 启动 admin_server(把本地配置刷入 ZK,充当配置中心)
#   3. 调用 admin HTTP 接口初始化数据库(内置模型等基础数据)
#   4. 启动其余服务(配置全部从 ZK 拉取;web_server 的 web.yaml 走本地文件)
#
# 独立模式要点:
#   - 全部服务监听/注册 127.0.0.1(单容器内互访,无需感知容器 IP)
#   - 不调用任何蓝鲸平台组件(ESB/GSE/权限中心/监控)
#******************************************************************************
set -e

CMDB_HOME=/data/cmdb
LOG_DIR=${CMDB_HOME}/logs
ZK_ADDR=zookeeper:2181
STANDALONE_PROFILE=${STANDALONE_PROFILE:-core}
STANDALONE_ENV=${STANDALONE_ENV:-development}
STANDALONE_LISTEN_ADDR=${STANDALONE_LISTEN_ADDR:-127.0.0.1:8090}
CMDB_API_KEY_REQUIRED=${CMDB_API_KEY_REQUIRED:-0}
# 内置账号登录开关:development 默认 skip-login(免登录);
# shared/production 建议显式 CMDB_LOGIN_VERSION=opensource + CMDB_SESSION_USERINFO=用户:密码[,用户:密码...]
CMDB_LOGIN_VERSION=${CMDB_LOGIN_VERSION:-}
CMDB_SESSION_USERINFO=${CMDB_SESSION_USERINFO:-}
if [ -n "${CMDB_LOGIN_VERSION}" ] && [ -f "${CMDB_HOME}/cmdb_webserver/web.yaml" ]; then
    sed -i "s/^    version: skip-login/    version: ${CMDB_LOGIN_VERSION}/" "${CMDB_HOME}/cmdb_webserver/web.yaml"
    echo "login version overridden to ${CMDB_LOGIN_VERSION}"
fi
if [ -n "${CMDB_SESSION_USERINFO}" ] && [ -f "${CMDB_HOME}/cmdb_webserver/web.yaml" ]; then
    sed -i "s/^    userInfo: .*/    userInfo: ${CMDB_SESSION_USERINFO}/" "${CMDB_HOME}/cmdb_webserver/web.yaml"
    echo "session userInfo overridden (value not printed)"
fi
case "${STANDALONE_ENV}" in
    development|shared|production) ;;
    *) echo "unsupported STANDALONE_ENV: ${STANDALONE_ENV}" >&2; exit 1 ;;
esac
case "${STANDALONE_LISTEN_ADDR}" in
    127.0.0.1:*|localhost:*) external_listener=0 ;;
    *) external_listener=1 ;;
esac
if [ "${external_listener}" -eq 1 ]; then
    if grep -Eiq 'version:[[:space:]]*skip-login' "${CMDB_HOME}/cmdb_webserver/web.yaml" 2>/dev/null && grep -A2 -Eiq '^[[:space:]]*auth:[[:space:]]*$' "${CMDB_HOME}/cmdb_webserver/web.yaml" 2>/dev/null | grep -Eiq 'enabled:[[:space:]]*false'; then
        echo "ERROR: external listener cannot use skip-login with disabled auth" >&2
        exit 1
    fi
    if [ "${STANDALONE_ENV}" != "development" ] && grep -Eiq 'insecureSkipVerify:[[:space:]]*true' "${CMDB_HOME}/cmdb_webserver/web.yaml" 2>/dev/null; then
        echo "ERROR: ${STANDALONE_ENV} listener cannot disable TLS certificate verification" >&2
        exit 1
    fi
    if [ "${STANDALONE_ENV}" != "development" ] && [ -z "${CMDB_API_KEY:-}" ]; then
        echo "ERROR: external ${STANDALONE_ENV} listener requires CMDB_API_KEY" >&2
        exit 1
    fi
    if [ "${STANDALONE_ENV}" != "development" ] && [ "${CMDB_API_KEY_REQUIRED}" != "1" ] && [ "${CMDB_API_KEY_REQUIRED}" != "true" ]; then
        echo "ERROR: external ${STANDALONE_ENV} listener requires CMDB_API_KEY_REQUIRED=true" >&2
        exit 1
    fi
    if [ "${STANDALONE_ENV}" != "development" ] && [ "${CMDB_API_USER:-}" = "" -o "${CMDB_API_USER:-}" = "admin" ]; then
        echo "ERROR: external ${STANDALONE_ENV} listener requires explicit non-admin CMDB_API_USER" >&2
        exit 1
    fi
    if [ "${STANDALONE_ENV}" != "development" ] && [ "${CMDB_API_SUPPLIER_ACCOUNT:-}" = "" ]; then
        echo "ERROR: external ${STANDALONE_ENV} listener requires CMDB_API_SUPPLIER_ACCOUNT" >&2
        exit 1
    fi
    if [ "${STANDALONE_ENV}" != "development" ] && [ "${CMDB_API_APP_CODE:-}" = "" ]; then
        echo "ERROR: external ${STANDALONE_ENV} listener requires CMDB_API_APP_CODE" >&2
        exit 1
    fi
    if [ "${STANDALONE_ENV}" != "development" ] && [ "${CMDB_SESSION_SECRET:-}" = "" ]; then
        echo "ERROR: external ${STANDALONE_ENV} listener requires CMDB_SESSION_SECRET" >&2
        exit 1
    fi
    if [ "${STANDALONE_ENV}" != "development" ]; then
        if grep -Eiq 'version:[[:space:]]*skip-login' "${CMDB_HOME}/cmdb_webserver/web.yaml" 2>/dev/null; then
            echo "ERROR: external ${STANDALONE_ENV} listener requires CMDB_LOGIN_VERSION=opensource (or oidc), not skip-login" >&2
            exit 1
        fi
        if [ -z "${CMDB_SESSION_USERINFO}" ]; then
            echo "ERROR: external ${STANDALONE_ENV} listener requires CMDB_SESSION_USERINFO (built-in accounts)" >&2
            exit 1
        fi
        if echo "${CMDB_SESSION_USERINFO}" | grep -q 'admin:admin'; then
            echo "ERROR: external ${STANDALONE_ENV} listener forbids default admin:admin credentials" >&2
            exit 1
        fi
    fi
fi
mkdir -p "${LOG_DIR}"

wait_port() {
    local host=$1 port=$2 name=$3
    echo "waiting for ${name} (${host}:${port}) ..."
    for _ in $(seq 1 90); do
        if (echo > /dev/tcp/${host}/${port}) >/dev/null 2>&1; then
            echo "${name} is up"
            return 0
        fi
        sleep 2
    done
    echo "ERROR: ${name} (${host}:${port}) not reachable" >&2
    exit 1
}

start_svc() {
    local name=$1 port=$2
    shift 2
    if [ ! -x "${CMDB_HOME}/${name}/${name}" ]; then
        echo "ERROR: ${name} is required by profile ${STANDALONE_PROFILE}, but its binary is missing" >&2
        exit 1
    fi
    cd "${CMDB_HOME}/${name}"
    mkdir -p logs
    nohup "./${name}" "$@" > logs/std.log 2>&1 &
    echo "started ${name} (pid $!) on port ${port}"
}

# ---------- 1. 等待中间件 ----------
wait_port zookeeper 2181 ZooKeeper
wait_port mongodb 27017 MongoDB
wait_port redis 6379 Redis

# ---------- 2. admin_server(配置中心引导 + 数据库初始化入口) ----------
start_svc cmdb_adminserver 60004 \
    --addrport=127.0.0.1:60004 \
    --config=${CMDB_HOME}/cmdb_adminserver/configures/migrate.yaml \
    --log-dir=${LOG_DIR} --v=3 --enable-auth=false
wait_port 127.0.0.1 60004 admin_server

# ---------- 3. 初始化数据库 ----------
echo "initializing database (migrate/community) ..."
code=""
for i in $(seq 1 60); do
    code=$(curl -s -o /tmp/migrate.out -w '%{http_code}' -X POST \
        -H 'Content-Type: application/json' \
        -H 'X-Bkcmdb-User: migrate' \
        -H 'X-Bkcmdb-Supplier-Account: 0' \
        http://127.0.0.1:60004/migrate/v3/migrate/community/0 || true)
    if [ "${code}" = "200" ]; then
        echo "database initialized"
        break
    fi
    echo "migrate attempt ${i}: http ${code}, retry in 3s"
    sleep 3
done
if [ "${code}" != "200" ]; then
    echo "ERROR: database migrate failed: $(cat /tmp/migrate.out 2>/dev/null)" >&2
    exit 1
fi

# ---------- 4. 其余服务 ----------
# 注意:--enable-auth 仅部分服务支持(与官方 init.py 生成的启动参数一致),
#       webserver/taskserver/coreservice 不带该 flag。
# 业务服务(cloud/synchronize/transfer/event/datacollection/operation)的源码保留;
# 当前核心 profile 启动下列 13 个进程(含云服务),避免把部署裁剪误认为源码删除。
AUTH_FLAG="--enable-auth=false"
COMMON="--log-dir=${LOG_DIR} --v=3 --register-ip=127.0.0.1"

start_svc cmdb_coreservice 50009 \
    --addrport=127.0.0.1:50009 --regdiscv=${ZK_ADDR} ${COMMON}
start_svc cmdb_cacheservice 50010 \
    --addrport=127.0.0.1:50010 --regdiscv=${ZK_ADDR} ${COMMON} ${AUTH_FLAG}
start_svc cmdb_toposerver 60002 \
    --addrport=127.0.0.1:60002 --regdiscv=${ZK_ADDR} ${COMMON} ${AUTH_FLAG}
start_svc cmdb_hostserver 60001 \
    --addrport=127.0.0.1:60001 --regdiscv=${ZK_ADDR} ${COMMON} ${AUTH_FLAG}
start_svc cmdb_procserver 60003 \
    --addrport=127.0.0.1:60003 --regdiscv=${ZK_ADDR} ${COMMON} ${AUTH_FLAG}
start_svc cmdb_eventserver 60009 \
    --addrport=127.0.0.1:60009 --regdiscv=${ZK_ADDR} ${COMMON} ${AUTH_FLAG}
start_svc cmdb_taskserver 60012 \
    --addrport=127.0.0.1:60012 --regdiscv=${ZK_ADDR} ${COMMON}
start_svc cmdb_datacollection 60005 \
    --addrport=127.0.0.1:60005 --regdiscv=${ZK_ADDR} ${COMMON} ${AUTH_FLAG}
start_svc cmdb_operationserver 60011 \
    --addrport=127.0.0.1:60011 --regdiscv=${ZK_ADDR} ${COMMON} ${AUTH_FLAG}
if [ "${STANDALONE_PROFILE}" = "cloud" ] || [ "${STANDALONE_PROFILE}" = "full" ]; then
    start_svc cmdb_cloudserver 60013 \
        --addrport=127.0.0.1:60013 --regdiscv=${ZK_ADDR} ${COMMON} ${AUTH_FLAG} --enable-cryptor=false
fi
if [ "${STANDALONE_PROFILE}" = "sync" ] || [ "${STANDALONE_PROFILE}" = "full" ]; then
    start_svc cmdb_synchronizeserver 60010 \
        --addrport=127.0.0.1:60010 --regdiscv=${ZK_ADDR} ${COMMON} ${AUTH_FLAG}
fi
if [ "${STANDALONE_PROFILE}" = "transfer" ] || [ "${STANDALONE_PROFILE}" = "full" ]; then
    start_svc cmdb_transferservice 50011 \
        --addrport=127.0.0.1:50011 --regdiscv=${ZK_ADDR} ${COMMON}
fi
start_svc cmdb_apiserver 8080 \
    --addrport=127.0.0.1:8080 --regdiscv=${ZK_ADDR} ${COMMON} ${AUTH_FLAG}
start_svc cmdb_webserver 8090 \
    --addrport=${STANDALONE_LISTEN_ADDR} --regdiscv=${ZK_ADDR} \
    --deployment-method=open_source \
    --config=${CMDB_HOME}/cmdb_webserver/web.yaml ${COMMON}

# ---------- 5. 状态检查并前台守护 ----------
sleep 3
echo
echo "---------- process status ----------"
pgrep -a cmdb_ || true
echo "------------------------------------"

dead=0
services="cmdb_adminserver cmdb_coreservice cmdb_cacheservice cmdb_toposerver cmdb_hostserver cmdb_procserver cmdb_eventserver cmdb_taskserver cmdb_datacollection cmdb_operationserver cmdb_apiserver cmdb_webserver"
case "${STANDALONE_PROFILE}" in
    cloud) services="${services} cmdb_cloudserver" ;;
    sync) services="${services} cmdb_synchronizeserver" ;;
    transfer) services="${services} cmdb_transferservice" ;;
    full) services="${services} cmdb_cloudserver cmdb_synchronizeserver cmdb_transferservice" ;;
esac
for svc in ${services}; do
    if ! pgrep -f "${svc}" > /dev/null; then
        echo "WARNING: ${svc} is not running, check ${LOG_DIR}/${svc} logs"
        dead=$((dead + 1))
    fi
done

 echo
if [ ${dead} -eq 0 ]; then
    echo "standalone profile ${STANDALONE_PROFILE} (${STANDALONE_ENV}) started successfully. web ui: http://${STANDALONE_LISTEN_ADDR}"
else
    echo "${dead} service(s) failed to start for profile ${STANDALONE_PROFILE}, see logs under ${LOG_DIR}"
fi

trap 'pkill -f "cmdb_" 2>/dev/null; exit 0' TERM INT
while true; do sleep 3600; done
