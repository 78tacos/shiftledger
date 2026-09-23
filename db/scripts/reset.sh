#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "Resetting ShiftLedger (docker compose down -v, then up --build)"
docker compose down -v
docker compose up --build
