#!/bin/bash
# Weekly reclaim of rotated Gorse logs, unused Docker build cache, and
# impression feedback older than 7 days (see gorse-impression-purge.sh).
# Does not touch model blobs, other MySQL data, live logs, or containerd.
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
  KEEP_DAYS=7 "$(dirname "$0")/gorse-impression-purge.sh" || echo "impression purge failed"
  echo "=== after ==="
  df -h / | tail -1
} >> "$LOG" 2>&1
