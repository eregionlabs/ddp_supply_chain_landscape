#!/usr/bin/env bash
set -euo pipefail
PORT="${1:-8787}"
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_ROOT"

if lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $PORT is already in use."
  echo "Try: bash run_local.sh 8788"
  exit 1
fi

echo "Serving project root at http://127.0.0.1:${PORT}"
echo "Open: http://127.0.0.1:${PORT}/presentation/cytoscape/"
python3 -m http.server "$PORT"