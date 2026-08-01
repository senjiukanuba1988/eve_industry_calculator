#!/bin/sh
set -e

# On a fresh volume, mysql's healthcheck can briefly report healthy against its
# own temporary bootstrap server before it restarts into the real one - retry
# instead of failing outright on that race.
attempt=0
until php vendor/bin/phinx migrate -c phinx.php; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 10 ]; then
        echo "phinx migrate failed after ${attempt} attempts, giving up" >&2
        exit 1
    fi
    echo "phinx migrate failed (attempt ${attempt}), retrying in 2s..." >&2
    sleep 2
done

php vendor/bin/phinx seed:run -c phinx.php

exec "$@"
