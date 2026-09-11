#!/usr/bin/env bash
# Create Cloudflare DNS for gorse.hindusanatanapp.com → origin VM.
# Requires: export CF_API_TOKEN=... (Zone.DNS Edit on hindusanatanapp.com)
set -euo pipefail

ZONE_NAME="${ZONE_NAME:-hindusanatanapp.com}"
RECORD_NAME="${RECORD_NAME:-gorse}"
ORIGIN_IP="${ORIGIN_IP:-35.200.209.133}"
PROXIED="${PROXIED:-true}"

if [[ -z "${CF_API_TOKEN:-}" ]]; then
  echo "Set CF_API_TOKEN first (Cloudflare API token with Zone.DNS Edit)." >&2
  exit 1
fi

ZONE_ID=$(curl -sS -H "Authorization: Bearer $CF_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones?name=${ZONE_NAME}" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); assert d.get("success"), d; print(d["result"][0]["id"])')

FQDN="${RECORD_NAME}.${ZONE_NAME}"
EXISTING=$(curl -sS -H "Authorization: Bearer $CF_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records?name=${FQDN}&type=A")

RECORD_ID=$(python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["result"][0]["id"] if d.get("result") else "")' <<<"$EXISTING")

BODY=$(python3 -c "import json; print(json.dumps({'type':'A','name':'${RECORD_NAME}','content':'${ORIGIN_IP}','ttl':1,'proxied':${PROXIED}}))")

if [[ -n "$RECORD_ID" ]]; then
  curl -sS -X PUT "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records/${RECORD_ID}" \
    -H "Authorization: Bearer $CF_API_TOKEN" -H "Content-Type: application/json" \
    --data "$BODY" | python3 -c 'import sys,json; d=json.load(sys.stdin); assert d.get("success"), d; r=d["result"]; print("updated", r["name"], "->", r["content"], "proxied="+str(r["proxied"]))'
else
  curl -sS -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records" \
    -H "Authorization: Bearer $CF_API_TOKEN" -H "Content-Type: application/json" \
    --data "$BODY" | python3 -c 'import sys,json; d=json.load(sys.stdin); assert d.get("success"), d; r=d["result"]; print("created", r["name"], "->", r["content"], "proxied="+str(r["proxied"]))'
fi
