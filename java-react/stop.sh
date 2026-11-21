#!/usr/bin/env bash
set -euo pipefail

if ! command -v lsof >/dev/null 2>&1; then
  echo "lsof is required to find the app on port 8080." >&2
  exit 1
fi

# Listeners only, so a browser connected to the app is not killed with it.
pids=$(lsof -ti tcp:8080 -sTCP:LISTEN || true)

if [ -z "$pids" ]; then
  echo "Nothing listening on port 8080."
  exit 0
fi

# shellcheck disable=SC2086
kill $pids
sleep 1
echo "Stopped."
