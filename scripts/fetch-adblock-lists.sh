#!/usr/bin/env bash
# Refreshes the bundled adblock filter lists in assets/adblock/ from their
# canonical sources (the same URLs uBlock Origin's assets.json uses). Run on a
# networked machine, then regenerate the RemoteSettings dump:
#   bash scripts/fetch-adblock-lists.sh
#   python3 scripts/gen-adblock-dump.py assets/adblock <tree>
# List staleness is the #1 cause of YouTube/banner ads leaking: uBO the
# extension refreshed these hourly; the bundle only refreshes when this runs.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/../assets/adblock"

declare -A URLS=(
  [easylist]="https://ublockorigin.github.io/uAssetsCDN/thirdparties/easylist.txt"
  [easyprivacy]="https://ublockorigin.github.io/uAssetsCDN/thirdparties/easyprivacy.txt"
  [ubo-filters]="https://ublockorigin.github.io/uAssetsCDN/filters/filters.min.txt"
  [ubo-badware]="https://ublockorigin.github.io/uAssetsCDN/filters/badware.min.txt"
  [ubo-privacy]="https://ublockorigin.github.io/uAssetsCDN/filters/privacy.min.txt"
  [ubo-quickfixes]="https://ublockorigin.github.io/uAssetsCDN/filters/quick-fixes.min.txt"
  [peterlowe]="https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=1&mimetype=plaintext"
  [adguard-base]="https://filters.adtidy.org/extension/ublock/filters/2_without_easylist.txt"
  [adguard-mobile]="https://filters.adtidy.org/extension/ublock/filters/11.txt"
  [adguard-tracking]="https://filters.adtidy.org/extension/ublock/filters/3.txt"
)

for name in "${!URLS[@]}"; do
  echo "==> $name"
  curl -fsSL --retry 3 -o "$OUT/$name.txt.new" "${URLS[$name]}"
  # Sanity: a filter list is at least a few KB and mostly text.
  [ "$(wc -c < "$OUT/$name.txt.new")" -gt 10000 ] || {
    echo "ERROR: $name.txt suspiciously small, keeping old copy" >&2
    rm -f "$OUT/$name.txt.new"; continue
  }
  mv "$OUT/$name.txt.new" "$OUT/$name.txt"
done
echo "==> done"
ls -la "$OUT"
