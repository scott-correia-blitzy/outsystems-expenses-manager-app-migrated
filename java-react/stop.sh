#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -gt 0 ]; then
  usage="Usage: ./stop.sh (stops the app listening on port 8080; takes no arguments)"
  for arg in "$@"; do
    case "$arg" in
      -h | --help) ;;
      *)
        echo "Unknown argument: $arg" >&2
        echo "$usage" >&2
        exit 2
        ;;
    esac
  done
  echo "$usage"
  exit 0
fi

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
remaining=$(lsof -ti tcp:8080 -sTCP:LISTEN || true)
waited=1
while [ -n "$remaining" ] && [ "$waited" -lt 5 ]; do
  sleep 1
  waited=$((waited + 1))
  remaining=$(lsof -ti tcp:8080 -sTCP:LISTEN || true)
done
if [ -n "$remaining" ]; then
  echo "Port 8080 is still in use by PID ${remaining//$'\n'/ }." >&2
  exit 1
fi
echo "Stopped."
