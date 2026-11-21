#!/usr/bin/env bash
set -euo pipefail

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
