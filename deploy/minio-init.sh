#!/bin/sh
# Create buckets. CORS is global on OSS MinIO via MINIO_API_CORS_ALLOW_ORIGIN on the minio service.
set -eu

sleep 3
mc alias set local "http://minio:9000" "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}"
mc mb "local/${GACHIFY_S3_BUCKET_MASTERS:-gachify-masters}" --ignore-existing
mc mb local/gachify-public --ignore-existing

ORIGINS="${GACHIFY_CORS_ORIGINS:-http://localhost,http://127.0.0.1,http://localhost:5173,http://127.0.0.1:5173}"
# Per-bucket mc cors set requires MinIO AIStor; use cluster-wide api CORS on community builds.
if mc admin config set local/ api "cors_allow_origin=${ORIGINS}" 2>/dev/null; then
  mc admin service restart local || true
  echo "minio-init: buckets ready, api CORS origins=${ORIGINS}"
else
  echo "minio-init: buckets ready (CORS via MINIO_API_CORS_ALLOW_ORIGIN on minio container)"
fi
