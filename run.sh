#!/usr/bin/env sh
cd "$(dirname "$0")"
echo ""
echo "  Building and starting Orbit..."
echo ""
docker compose up --build
