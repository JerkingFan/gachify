#!/bin/sh
set -eu

sleep 3
mc alias set local "http://minio:9000" "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}"
mc mb "local/${GACHIFY_S3_BUCKET_MASTERS:-gachify-masters}" --ignore-existing
mc mb local/gachify-public --ignore-existing

ORIGINS="${GACHIFY_CORS_ORIGINS:-http://localhost,http://127.0.0.1,http://localhost:5173,http://127.0.0.1:5173}"

# Build JSON array: "http://a","http://b"
json_origins=""
IFS=,
for o in $ORIGINS; do
  o=$(echo "$o" | tr -d ' ')
  [ -z "$o" ] && continue
  json_origins="${json_origins}\"${o}\","
done
json_origins=${json_origins%,}

cat > /tmp/cors.json <<EOF
[{"AllowedOrigins":[${json_origins}],"AllowedMethods":["GET","PUT","HEAD"],"AllowedHeaders":["*"],"ExposeHeaders":["ETag"],"MaxAgeSeconds":3600}]
EOF

mc cors set "local/${GACHIFY_S3_BUCKET_MASTERS:-gachify-masters}" /tmp/cors.json || true
mc cors set local/gachify-public /tmp/cors.json || true
echo "minio-init: buckets ready, CORS applied for: ${ORIGINS}"
