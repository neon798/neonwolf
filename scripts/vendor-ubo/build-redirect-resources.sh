#!/usr/bin/env bash
# Builds UBORedirectResources.sys.mjs — uBO's $redirect neutered resources
# (noop js/media/images + ad-shim scripts) as a data-URI-servable module.
# Output lands in the source tree at toolkit/components/content-classifier/
# and is then captured in patches/native/native-ubo-snfe.patch.
# RUN ON A NETWORKED MACHINE (needs node >= 18 for global fetch).
#   bash scripts/vendor-ubo/build-redirect-resources.sh [ubo-tag]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
TREE="neonwolf-$(cat "$REPO/version")-$(cat "$REPO/release")"
OUT="$REPO/$TREE/toolkit/components/content-classifier/UBORedirectResources.sys.mjs"
TAG="${1:-1.72.0}"

node "$HERE/gen-redirect-resources.mjs" "$TAG" "$OUT"
echo "==> done: $OUT"
echo "Remember to regenerate patches/native/native-ubo-snfe.patch if this changed."
