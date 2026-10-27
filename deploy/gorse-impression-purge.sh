#!/bin/bash
# Delete Gorse "impression" feedback older than KEEP_DAYS, in small batches.
# dd-api freshness only needs ~1 day of impressions and Gorse never trains on
# them, but dd-api writes ~450k/day, so without this the feedback table grows
# without bound and every per-user feedback lookup gets slower.
#
# Walks the (feedback_type, user_id, item_id) primary key in user_id chunks so
# each batch is a short indexed range scan instead of re-scanning kept rows.
#
# Env: KEEP_DAYS (7) CHUNK (50000) DRY_RUN (0) OPTIMIZE (0) CONTAINER (gorse-mysql)
set -euo pipefail

KEEP_DAYS=${KEEP_DAYS:-7}
CHUNK=${CHUNK:-50000}
DRY_RUN=${DRY_RUN:-0}
OPTIMIZE=${OPTIMIZE:-0}
CONTAINER=${CONTAINER:-gorse-mysql}

sql() {
  docker exec -i "$CONTAINER" sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot -N -B gorse'
}

CUTOFF=$(echo "SELECT NOW() - INTERVAL $KEEP_DAYS DAY" | sql)
OLD="feedback_type='impression' AND time_stamp < '$CUTOFF'"
echo "$(date -u +%FT%TZ) impression purge: cutoff=$CUTOFF chunk=$CHUNK dry_run=$DRY_RUN"

if [ "$DRY_RUN" = 1 ]; then
  echo "would delete: $(echo "SELECT COUNT(*) FROM feedback WHERE $OLD" | sql)"
  exit 0
fi

# Cursor is hex-encoded so arbitrary user ids are safe inside SQL.
from="" # empty = start of range
total=0
while :; do
  if [ -z "$from" ]; then lo="1=1"; else lo="user_id >= UNHEX('$from')"; fi
  next=$(echo "SELECT HEX(user_id) FROM feedback WHERE feedback_type='impression' AND $lo
    ORDER BY user_id, item_id LIMIT 1 OFFSET $CHUNK" | sql)
  if [ -z "$next" ]; then hi="1=1"; else hi="user_id < UNHEX('$next')"; fi
  n=$(echo "DELETE FROM feedback WHERE $OLD AND $lo AND $hi; SELECT ROW_COUNT();" | sql)
  total=$((total + n))
  [ -z "$next" ] && break
  # A single user with more than CHUNK rows would stall the cursor; step past it.
  if [ "$next" = "$from" ]; then
    n=$(echo "DELETE FROM feedback WHERE $OLD AND user_id = UNHEX('$from'); SELECT ROW_COUNT();" | sql)
    total=$((total + n))
    next=$(echo "SELECT HEX(user_id) FROM feedback WHERE feedback_type='impression'
      AND user_id > UNHEX('$from') ORDER BY user_id LIMIT 1" | sql)
    [ -z "$next" ] && break
  fi
  from=$next
  sleep 0.2
done
echo "deleted: $total"

if [ "$OPTIMIZE" = 1 ]; then
  echo "optimizing feedback table"
  echo "OPTIMIZE TABLE feedback" | sql
fi
