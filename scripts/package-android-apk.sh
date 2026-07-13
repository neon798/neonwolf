#!/usr/bin/env bash
# Collect Neonwolf Android APKs from obj-android into dist-android/ (local only).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TREE="${NEONWOLF_TREE:-$ROOT/neonwolf-152.0.1-3}"
OBJ="${TREE}/obj-android"
OUT="${ROOT}/dist-android"
mkdir -p "$OUT"

echo "Searching for APKs under $OBJ ..."
mapfile -t APKS < <(find "$OBJ" -type f -name '*.apk' 2>/dev/null | sort)
if [ ${#APKS[@]} -eq 0 ]; then
  echo "No APKs found yet. Is the build still running? See android-build.log"
  exit 1
fi

for apk in "${APKS[@]}"; do
  base="$(basename "$apk")"
  # Prefer named copies for the night tech-preview
  case "$base" in
    *fenix*|*browser*|*geckoview*|*neonwolf*)
      cp -v "$apk" "$OUT/$base"
      ;;
    *)
      cp -v "$apk" "$OUT/$base"
      ;;
  esac
done

# Symlink / copy a stable name for the primary arm64 debug Fenix if present
PRIMARY=$(find "$OUT" -name '*arm64*.apk' -o -name '*debug*.apk' 2>/dev/null | head -1 || true)
if [ -n "${PRIMARY:-}" ]; then
  cp -f "$PRIMARY" "$OUT/neonwolf-android-arm64-techpreview.apk"
  echo "Primary: $OUT/neonwolf-android-arm64-techpreview.apk"
fi

ls -lh "$OUT"
echo "Install: adb install -r $OUT/neonwolf-android-arm64-techpreview.apk"
