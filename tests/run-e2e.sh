#!/usr/bin/env bash
# TEST ONLY: runs the full browser test against the local test backend.
set -euo pipefail
cd "$(dirname "$0")/.."
pkill -f tests/local-backend/gateway.mjs 2>/dev/null || true
pkill -f "vite preview --outDir dist-e2e" 2>/dev/null || true
node tests/local-backend/setup-db.mjs
DATABASE_URL=${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/acilcep_e2e} node tests/local-backend/gateway.mjs > /tmp/acilcep-gateway.log 2>&1 &
VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=local-test-anon-key npx vite build --outDir dist-e2e --logLevel error ${E2E_BUILD_FLAGS:-}
npx vite preview --outDir dist-e2e --port 4173 --strictPort > /tmp/acilcep-preview.log 2>&1 &
sleep 2
node tests/e2e.mjs
