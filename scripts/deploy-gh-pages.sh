#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
deploy_dir="$(mktemp -d /tmp/portfel-pwa-gh-pages-XXXXXX)"

cleanup() {
  rm -rf "$deploy_dir"
}
trap cleanup EXIT

echo "Przygotowanie plików w $deploy_dir ..."
rsync -a \
  --exclude node_modules \
  --exclude .git \
  --exclude tests \
  --exclude coverage \
  --exclude functions \
  --exclude .github \
  --exclude scripts \
  "$repo_root/" "$deploy_dir/"

pushd "$deploy_dir" >/dev/null
git init -q
git config user.email "deploy@portfel-pwa.local"
git config user.name "Portfel PWA Deploy"
git checkout -b gh-pages -q
git add -A
git commit -q -m "Deploy $(date -u '+%Y-%m-%d %H:%M UTC')"

origin="$(git -C "$repo_root" remote get-url origin)"
git remote add origin "$origin"
echo "Wypychanie na origin/gh-pages ..."
git push -f origin gh-pages
echo "OK: gh-pages zaktualizowany."
popd >/dev/null
