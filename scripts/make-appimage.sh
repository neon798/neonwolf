#!/usr/bin/env bash
#
# make-appimage.sh — wrap a packaged Neonwolf Linux build into an AppImage.
#
# Neonwolf ships no AppImage recipe of its own (the old docker-dist one was a
# hand-built relic); this builds one from the standard `./mach package` output
# so the release CI can attach a portable Linux binary for testers.
#
# Usage:
#   scripts/make-appimage.sh <neonwolf-dir|package.tar.xz> [output.AppImage]
#
#   <neonwolf-dir>   A directory containing the `neonwolf` launcher (i.e. the
#                    `neonwolf/` folder unpacked from dist/neonwolf-*.tar.xz),
#                    OR the dist tarball itself (we unpack it for you).
#   [output]         Defaults to ./Neonwolf-x86_64.AppImage
#
# Requires: curl (to fetch appimagetool), tar. No FUSE needed — we run
# appimagetool via --appimage-extract so it works on headless CI runners.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ICON_SRC="${ICON_SRC:-$REPO_ROOT/themes/browser/branding/neonwolf/default256.png}"

INPUT="${1:?usage: make-appimage.sh <neonwolf-dir|package.tar.xz> [output.AppImage]}"
OUTPUT="${2:-$REPO_ROOT/Neonwolf-x86_64.AppImage}"
ARCH="${ARCH:-x86_64}"

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

# --- Resolve the packaged tree ------------------------------------------------
if [ -d "$INPUT" ]; then
  if [ -x "$INPUT/neonwolf" ]; then
    pkgdir="$INPUT"
  elif [ -x "$INPUT/neonwolf/neonwolf" ]; then
    pkgdir="$INPUT/neonwolf"
  else
    echo "error: no 'neonwolf' launcher found under $INPUT" >&2
    exit 1
  fi
else
  echo "-> unpacking $INPUT"
  tar xf "$INPUT" -C "$workdir"
  pkgdir="$(dirname "$(find "$workdir" -maxdepth 3 -type f -name neonwolf -perm -u+x | head -n1)")"
  if [ -z "$pkgdir" ] || [ ! -x "$pkgdir/neonwolf" ]; then
    echo "error: could not locate the neonwolf launcher inside $INPUT" >&2
    exit 1
  fi
fi
echo "-> packaged tree: $pkgdir"

# --- Assemble the AppDir ------------------------------------------------------
appdir="$workdir/Neonwolf.AppDir"
mkdir -p "$appdir/usr/lib/neonwolf" "$appdir/usr/share/icons/hicolor/256x256/apps"
cp -a "$pkgdir/." "$appdir/usr/lib/neonwolf/"

if [ -f "$ICON_SRC" ]; then
  cp "$ICON_SRC" "$appdir/usr/share/icons/hicolor/256x256/apps/neonwolf.png"
  cp "$ICON_SRC" "$appdir/neonwolf.png"
else
  echo "warning: icon $ICON_SRC not found; AppImage will have no icon" >&2
fi

cat > "$appdir/neonwolf.desktop" <<'DESKTOP'
[Desktop Entry]
Name=Neonwolf
GenericName=Web Browser
Comment=Browse the web with a synthwave-themed, privacy-hardened Firefox
Exec=neonwolf %u
Icon=neonwolf
Type=Application
Categories=Network;WebBrowser;
StartupNotify=true
StartupWMClass=neonwolf
Terminal=false
MimeType=text/html;text/xml;application/xhtml+xml;x-scheme-handler/http;x-scheme-handler/https;
DESKTOP

# AppRun: resolve the AppDir at runtime and hand off to the real launcher.
cat > "$appdir/AppRun" <<'APPRUN'
#!/bin/sh
HERE="$(dirname "$(readlink -f "$0")")"
export LD_LIBRARY_PATH="$HERE/usr/lib/neonwolf:${LD_LIBRARY_PATH}"
exec "$HERE/usr/lib/neonwolf/neonwolf" "$@"
APPRUN
chmod +x "$appdir/AppRun"

# --- Fetch appimagetool (no FUSE: extract then run) ---------------------------
tool="$workdir/appimagetool-x86_64.AppImage"
echo "-> fetching appimagetool"
curl -fsSL -o "$tool" \
  "https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage"
chmod +x "$tool"
( cd "$workdir" && "$tool" --appimage-extract >/dev/null )

echo "-> building AppImage -> $OUTPUT"
# ARCH is required by appimagetool when it can't autodetect on a stripped binary.
ARCH="$ARCH" "$workdir/squashfs-root/AppRun" "$appdir" "$OUTPUT"

echo "-> done: $OUTPUT"
ls -lh "$OUTPUT"
