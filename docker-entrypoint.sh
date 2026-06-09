#!/bin/sh
set -e
# Named volume at /app/server/data is often root-owned on first mount
mkdir -p /app/server/data
chown -R node:node /app/server/data
exec su-exec node "$@"
