#!/usr/bin/env bash
set -euo pipefail

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

if [ -n "$(lsof -ti tcp:8080 -sTCP:LISTEN || true)" ]; then
  echo "Run ./stop.sh first." >&2
  exit 1
fi

echo "Building..."
./mvnw -q package

echo "Expenses Manager V2 at http://localhost:8080"
echo "Demo logins: em_user1 / 123456 (User), em_admin / 123456 (Administrator)"
echo "Stop with Ctrl+C or ./stop.sh."
exec "$JAVA_CMD" -jar target/expenses-manager.jar
