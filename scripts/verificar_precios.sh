#!/usr/bin/env bash
set -euo pipefail
API="https://prices.azure.com/api/retail/prices?currencyCode=USD"
R="armRegionName%20eq%20'centralus'"
q() {
  curl -fsS "${API}&\$filter=$1" | jq -r '.Items[] | [.serviceName, .productName, .skuName, .meterName, .unitOfMeasure, .retailPrice] | @tsv'
}
echo "== Functions (consumo)";  q "serviceName%20eq%20'Functions'%20and%20${R}%20and%20priceType%20eq%20'Consumption'" | grep -Ei "execution|total" || true
echo "== SQL Database serverless / Standard"; q "serviceName%20eq%20'SQL%20Database'%20and%20${R}%20and%20priceType%20eq%20'Consumption'" | grep -Ei "serverless|S0|S1 " | head -20 || true
echo "== Blob Hot LRS";         q "serviceName%20eq%20'Storage'%20and%20${R}%20and%20productName%20eq%20'General%20Block%20Blob%20v2'%20and%20priceType%20eq%20'Consumption'" | grep -Ei "Hot LRS" | head -10 || true
echo "== Key Vault";            q "serviceName%20eq%20'Key%20Vault'%20and%20${R}%20and%20priceType%20eq%20'Consumption'" | head -10 || true
echo "== Log Analytics / Monitor"; q "serviceName%20eq%20'Log%20Analytics'%20and%20${R}" | head -10 || true
echo "== Static Web Apps";      q "serviceName%20eq%20'Azure%20App%20Service'%20and%20contains(productName,'Static')%20and%20${R}" | head -10 || true
