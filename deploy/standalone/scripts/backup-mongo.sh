#!/bin/bash
#******************************************************************************
# bk-cmdb standalone Mongo 逻辑备份脚本(B43)
# 用法: ./backup-mongo.sh [备份目录]
#   默认备份到 ./backups,保留最近 BACKUP_KEEP 份(默认 7)
# 恢复: 使用同目录 restore-mongo.sh
#******************************************************************************
set -euo pipefail

BACKUP_DIR=${1:-./backups}
KEEP=${BACKUP_KEEP:-7}
STAMP=$(date +%Y%m%d-%H%M%S)
TARGET="${BACKUP_DIR}/cmdb-${STAMP}"
CONTAINER=${MONGO_CONTAINER:-cmdb-mongodb}
# 兼容多 docker context 环境(如 colima)
docker_cmd() { docker ${DOCKER_CONTEXT:+--context "${DOCKER_CONTEXT}"} "$@"; }

mkdir -p "${TARGET}"
echo "dumping mongodb from ${CONTAINER} -> ${TARGET}"
docker_cmd exec "${CONTAINER}" mongodump --quiet --gzip --archive=/tmp/dump.archive \
    -u "${MONGO_USER:-root}" -p "${MONGO_PASSWORD:-root1234}" --authenticationDatabase admin
docker_cmd cp "${CONTAINER}:/tmp/dump.archive" "${TARGET}/dump.archive"
docker_cmd exec "${CONTAINER}" rm -f /tmp/dump.archive

# 集合级校验:archive 非空且大小超过 1KB 视为有效
SIZE=$(stat -f%z "${TARGET}/dump.archive" 2>/dev/null || stat -c%s "${TARGET}/dump.archive")
if [ "${SIZE}" -lt 1024 ]; then
    echo "ERROR: backup archive too small (${SIZE} bytes), refusing to keep" >&2
    exit 1
fi
echo "backup ok: ${TARGET}/dump.archive (${SIZE} bytes)"

# 保留最近 KEEP 份
ls -1dt "${BACKUP_DIR}"/cmdb-* 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
    echo "pruning ${old}"
    rm -rf "${old}"
done
