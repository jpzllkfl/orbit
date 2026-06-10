#!/bin/sh
set -e
# TMDB is built into Orbit — ensure key is set even if compose env is missing.
if [ -z "$ORBIT_TMDB_API_KEY" ] || [ "$ORBIT_TMDB_API_KEY" = "undefined" ]; then
  export ORBIT_TMDB_API_KEY="b379792391747f1606e1d7a933dd2aea"
fi
# Named volume at /app/server/data is often root-owned on first mount
mkdir -p /app/server/data
chown -R node:node /app/server/data
exec su-exec node "$@"
