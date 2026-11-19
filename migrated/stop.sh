#!/usr/bin/env bash
# Stop the demo app if it is running in the background.
PORT=5280
PIDS=$(lsof -ti tcp:$PORT 2>/dev/null || true)
if [ -z "$PIDS" ]; then
    echo "Nothing listening on port $PORT."
    exit 0
fi
echo "$PIDS" | xargs kill 2>/dev/null || true
sleep 1
echo "Stopped."
