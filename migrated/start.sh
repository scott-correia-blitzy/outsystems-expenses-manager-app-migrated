#!/usr/bin/env bash
# Start the migrated Expenses Manager demo on http://localhost:5280
set -euo pipefail
cd "$(dirname "$0")"

export PATH="$HOME/.dotnet:$PATH"
export DOTNET_CLI_TELEMETRY_OPTOUT=1
export DOTNET_NOLOGO=1

if ! command -v dotnet >/dev/null 2>&1; then
    echo "dotnet not found. Expected the SDK at ~/.dotnet" >&2
    exit 1
fi

PORT=5280

if lsof -ti tcp:$PORT >/dev/null 2>&1; then
    echo "Port $PORT is already in use. Run ./stop.sh first."
    exit 1
fi

echo "Building..."
dotnet build -c Release --nologo -v quiet

echo "Starting on http://localhost:$PORT"
echo "Log in as em_user1 / 123456, or em_admin / 123456 for the admin screens."
echo "Press Ctrl+C to stop."
exec dotnet run -c Release --no-build --urls "http://localhost:$PORT"
