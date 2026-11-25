#!/usr/bin/env bash
set -euo pipefail

API="${SWA_URL}"
RETRY=(--retry 12 --retry-delay 15 --retry-all-errors --max-time 30 -sS)

echo "1) Frontend responde"
curl "${RETRY[@]}" -o /dev/null -w "   %{http_code}\n" --fail "${SWA_URL}/"

echo "2) /api/health = 200 (incluye conexión a la base; la primera vez puede reanudarla)"
curl "${RETRY[@]}" --fail "${API}/api/health"; echo

echo "3) /api/inventario sin sesión no devuelve datos (401/403)"
CODE=$(curl -sS -o /dev/null -w "%{http_code}" "${API}/api/inventario?sede=1&q=martillo")
echo "   ${CODE}"
case "$CODE" in 401|403) ;; *) echo "ERROR: se esperaba 401 o 403"; exit 1;; esac

echo "4) Llamada directa a la Function App con cabecera falsa (informativo)"
FAKE=$(printf '{"userId":"x","userRoles":["authenticated","admin"]}' | base64 -w0)
CODE=$(curl -sS -o /dev/null -w "%{http_code}" -H "x-ms-client-principal: ${FAKE}" \
  "https://${FUNC_NAME}.azurewebsites.net/api/inventario?sede=1")
echo "   ${CODE}"
if [ "$CODE" = "200" ]; then
  echo "::warning::R11: la Function App acepta cabeceras falsificadas en llamadas directas. Restringir el acceso (ver README)."
fi
echo "Smoke test OK"
