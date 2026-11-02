#!/usr/bin/env bash
# Stop and remove the app container. The pm-data volume, and the database in it, is kept.
set -euo pipefail

docker rm -f pm-app >/dev/null 2>&1 || true
echo "App stopped. Data volume pm-data kept."
