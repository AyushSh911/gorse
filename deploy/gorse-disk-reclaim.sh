#!/bin/bash
# Weekly reclaim of rotated Gorse logs and unused Docker build cache.
# Does not touch model blobs, MySQL data, live logs, or containerd.
set -euo pipefail

LOG_DIR=/home/ayush/DurlabhDarshan/Gorge/logs
LOG="$LOG_DIR/disk-reclaim.log"
GORSE_LOGS=/var/lib/docker/volumes/gorge_gorse_log/_data

mkdir -p "$LOG_DIR"

{
  echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) before ==="
  df -h / | tail -1
  if [ -d "$GORSE_LOGS" ]; then
    find "$GORSE_LOGS" -type f \
      ! -name 'worker.log' ! -name 'master.log' ! -name 'server.log' -delete
  fi
  docker builder prune -af
  echo "=== after ==="
  df -h / | tail -1
} >> "$LOG" 2>&1
