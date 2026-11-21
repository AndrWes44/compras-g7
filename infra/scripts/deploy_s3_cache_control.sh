#!/bin/bash
set -e

BUCKET="g7-dev-frontend-aura-021686096746"
SOURCE_DIR="/tmp/frontend_deploy"

echo ">> 1. Sincronizando scripts y assets con Cache-Control: no-cache..."
aws s3 sync "${SOURCE_DIR}/" "s3://${BUCKET}/" \
  --exclude "index.html" \
  --cache-control "no-cache, must-revalidate" \
  --delete

echo ">> 2. Subiendo index.html con Cache-Control estricto (no-cache, no-store)..."
aws s3 cp "${SOURCE_DIR}/index.html" "s3://${BUCKET}/index.html" \
  --cache-control "no-cache, no-store, must-revalidate" \
  --content-type "text/html"

echo ">> ✅ ¡Despliegue con Cache-Control completado!"
