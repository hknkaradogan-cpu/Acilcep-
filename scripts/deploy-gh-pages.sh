#!/usr/bin/env bash
# Builds ACİLCEP and publishes it to GitHub Pages (branch gh-pages).
# The Supabase URL and publishable key are public values (data is protected by RLS).
set -euo pipefail
cd "$(dirname "$0")/.."
: "${VITE_SUPABASE_URL:=https://sjcoopddwmfqoxhrjyqa.supabase.co}"
: "${VITE_SUPABASE_ANON_KEY:=sb_publishable_JtJ3tlwrs-3FKbWlI2BW_w_LjpnMQF8}"
export VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY BASE_PATH=/Acilcep-/
rm -rf dist && npx vite build
cp dist/index.html dist/404.html   # SPA routing on GitHub Pages
touch dist/.nojekyll
cd dist && git init -q -b gh-pages && git add -A && git commit -qm "Deploy $(date -u +%FT%TZ)"
git push -f https://github.com/hknkaradogan-cpu/Acilcep- gh-pages
