#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -gt 0 ]; then
  usage="Usage: ./start.sh (builds the app and runs it at http://localhost:8080; takes no arguments)"
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

cd "$(dirname "$0")"

if [ -n "${JAVA_HOME:-}" ]; then
  JAVA_CMD="$JAVA_HOME/bin/java"
else
  JAVA_CMD=java
fi

# A missing or broken java must reach the version message below, not trip set -e.
version_output=$("$JAVA_CMD" -version 2>&1 || true)
java_major=0
case "$version_output" in
  *'version "'*)
    java_version=${version_output#*version \"}
    java_version=${java_version%%\"*}
    java_major=${java_version%%[.-]*}
    ;;
esac
case "$java_major" in
  '' | *[!0-9]*) java_major=0 ;;
esac

java_home=""
if [ "$java_major" -ge 25 ]; then
  settings=$("$JAVA_CMD" -XshowSettings:properties -version 2>&1 || true)
  java_home=$(sed -n 's/^[[:space:]]*java\.home[[:space:]]*=[[:space:]]*\(.*[^[:space:]]\)[[:space:]]*$/\1/p' <<<"$settings")
fi
# A JRE alone cannot build: the wrapper also needs javac.
if [ -z "$java_home" ] || [ ! -x "$java_home/bin/javac" ]; then
  echo "Java 25 or newer is required. Install a JDK 25+ (any arm64 build on Apple Silicon)." >&2
  exit 1
fi
# The wrapper picks its JDK from JAVA_HOME, so it builds with the one checked above.
export JAVA_HOME="$java_home"

if ! command -v lsof >/dev/null 2>&1; then
  echo "lsof is required to check whether port 8080 is free." >&2
  exit 1
fi

if [ -n "$(lsof -ti tcp:8080 -sTCP:LISTEN || true)" ]; then
  echo "Run ./stop.sh first." >&2
  exit 1
fi

echo "Building..."
if ! ./mvnw -q package; then
  echo "Build failed. Run ./mvnw package to see the full output." >&2
  exit 1
fi

echo "Expenses Manager V2 at http://localhost:8080"
echo "Demo logins: em_user1 / 123456 (User), em_admin / 123456 (Administrator)"
echo "Stop with Ctrl+C or ./stop.sh."
exec "$JAVA_CMD" -jar target/expenses-manager.jar
