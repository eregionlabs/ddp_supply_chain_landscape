#!/usr/bin/env bash
set -euo pipefail
PORT="${1:-8787}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Detect whether the full project tree exists (../../graph/) or we're standalone
if [ -d "$SCRIPT_DIR/../../graph" ]; then
  SERVE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
  OPEN_PATH="/presentation/cytoscape/"
else
  SERVE_ROOT="$SCRIPT_DIR"
  OPEN_PATH="/"
fi

if lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $PORT is already in use."
  echo "Try: bash run_local.sh $(( PORT + 1 ))"
  exit 1
fi

echo "Serving $SERVE_ROOT at http://127.0.0.1:${PORT}"
echo "Open: http://127.0.0.1:${PORT}${OPEN_PATH}"
cd "$SERVE_ROOT"
python3 -m http.server "$PORT"
