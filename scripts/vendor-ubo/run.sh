#!/usr/bin/env bash
# Vendors uBlock Origin's REAL scriptlet + redirect library into Neonwolf's engine
# format via convert.mjs (imports uBO's modern ES-module registry directly).
# RUN ON A NETWORKED MACHINE (clones uBO; needs node).
#   bash scripts/vendor-ubo/run.sh            # vendor + regenerate dump
#   bash scripts/vendor-ubo/run.sh --build    # vendor + regenerate dump + ./mach build
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
TREE="neonwolf-$(cat "$REPO/version")-$(cat "$REPO/release")"

echo "==> cloning uBlock Origin (master)"
git clone --quiet --depth 1 https://github.com/gorhill/uBlock "$WORK/uBlock"

echo "==> converting uBO scriptlets + redirects -> adblock Resource JSON"
node "$HERE/convert.mjs" "$WORK/uBlock/src" "$REPO/assets/ubo-resources.json"

echo "==> regenerating dump"
cd "$REPO"
python3 scripts/gen-adblock-dump.py assets/adblock "$TREE"

if [ "${1:-}" = "--build" ]; then
  echo "==> building"
  ( cd "$TREE" && ./mach build )
fi
echo "==> done. assets/ubo-resources.json vendored ($(python3 -c "import json;print(len(json.load(open('assets/ubo-resources.json'))))") resources)."
