#!/bin/bash
#******************************************************************************
# bk-cmdb standalone Mongo 恢复脚本(B43,与 backup-mongo.sh 配对)
# 用法: ./restore-mongo.sh <备份目录或 archive 路径>
# 注意:恢复会覆盖当前数据,生产执行前必须停写(停止 cmdb 容器)并完成二次确认
#******************************************************************************
set -euo pipefail

ARCHIVE=${1:-}
CONTAINER=${MONGO_CONTAINER:-cmdb-mongodb}
# 兼容多 docker context 环境(如 colima)
docker_cmd() { docker ${DOCKER_CONTEXT:+--context "${DOCKER_CONTEXT}"} "$@"; }
if [ -z "${ARCHIVE}" ]; then
    echo "usage: $0 <backup-dir|dump.archive>" >&2
    exit 1
fi
if [ -d "${ARCHIVE}" ]; then
    ARCHIVE="${ARCHIVE}/dump.archive"
fi
if [ ! -f "${ARCHIVE}" ]; then
    echo "ERROR: archive not found: ${ARCHIVE}" >&2
    exit 1
fi

echo "restoring ${ARCHIVE} -> ${CONTAINER}"
docker_cmd cp "${ARCHIVE}" "${CONTAINER}:/tmp/restore.archive"
docker_cmd exec "${CONTAINER}" mongorestore --quiet --drop --gzip --archive=/tmp/restore.archive \
    -u "${MONGO_USER:-root}" -p "${MONGO_PASSWORD:-root1234}" --authenticationDatabase admin
docker_cmd exec "${CONTAINER}" rm -f /tmp/restore.archive
echo "restore done"
