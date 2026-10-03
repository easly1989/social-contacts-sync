#!/usr/bin/env bash
# Boots the built server with the built web app, the way the container runs
# them, and checks that the API and the single-page app answer.
# Run after `npm run build` in server/ and web/.
set -euo pipefail

repo="$(cd "$(dirname "$0")/../.." && pwd)"
port="${PORT:-18080}"
log="$(mktemp)"

rm -rf "$repo/server/public"
cp -r "$repo/web/dist" "$repo/server/public"

(cd "$repo/server" && PORT="$port" node build/server/main.js >"$log" 2>&1) &
server_pid=$!
cleanup() {
  kill "$server_pid" 2>/dev/null || true
  rm -rf "$repo/server/public" "$log"
}
trap cleanup EXIT

base="http://127.0.0.1:$port"
for _ in $(seq 1 30); do
  curl -fsS "$base/api/" >/dev/null 2>&1 && break
  if ! kill -0 "$server_pid" 2>/dev/null; then
    cat "$log"
    echo "server exited during startup" >&2
    exit 1
  fi
  sleep 1
done

check() { # description, path, expected substring
  local body
  if ! body="$(curl -fsS "$base$2")"; then
    cat "$log"
    echo "FAIL: $1 ($2 did not answer)" >&2
    exit 1
  fi
  if [[ "$body" != *"$3"* ]]; then
    cat "$log"
    echo "FAIL: $1 ($2 did not contain '$3')" >&2
    exit 1
  fi
  echo "ok - $1"
}

check "API root" /api/ "{}"
check "session status" /api/status '"whatsappConnected":false'
check "status reports payments off" /api/status '"enforcePayments":false'
check "web app index" / '<div id="app">'
check "SPA fallback for client routes" /options '<div id="app">'
echo "smoke test passed"
