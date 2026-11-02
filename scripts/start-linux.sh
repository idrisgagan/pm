#!/usr/bin/env bash
# Build the image and start the app in the background at http://127.0.0.1:8000.
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
IMAGE=pm-app
CONTAINER=pm-app
VOLUME=pm-data
URL=http://127.0.0.1:8000

run_container() {
  docker run -d --name "$CONTAINER" "$@" \
    -p 127.0.0.1:8000:8000 \
    -v "$VOLUME":/app/backend/data \
    "$IMAGE" >/dev/null
}

docker build -t "$IMAGE" "$ROOT_DIR"
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true

if [[ -f "$ROOT_DIR/.env" ]]; then
  run_container --env-file "$ROOT_DIR/.env"
else
  echo "Warning: $ROOT_DIR/.env not found. AI features will not work." >&2
  run_container
fi

for _ in $(seq 1 30); do
  if curl -sf "$URL/api/health" >/dev/null; then
    echo "App running at $URL"
    exit 0
  fi
  sleep 1
done

echo "App did not become healthy within 30 seconds. Container logs:" >&2
docker logs "$CONTAINER" >&2
exit 1
