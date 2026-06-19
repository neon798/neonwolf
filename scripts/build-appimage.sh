#!/bin/bash
# Build Neonwolf AppImage from an existing neonwolf build directory
# Usage: ./scripts/build-appimage.sh <neonwolf-build-dir> <output-dir>
set -e

NW_DIR="${1:-/tmp/neonwolf-test/neonwolf}"
OUT_DIR="${2:-$PWD/docker-dist}"

if [ ! -x "$NW_DIR/neonwolf" ]; then
    echo "ERROR: $NW_DIR/neonwolf not found. Specify a neonwolf build directory."
    exit 1
fi

APPDIR="/tmp/neonwolf-AppDir"
rm -rf "$APPDIR"
mkdir -p "$APPDIR"

echo "Copying neonwolf from $NW_DIR..."
cp -a "$NW_DIR" "$APPDIR/neonwolf"

# AppRun entry point
cat > "$APPDIR/AppRun" << 'APPRUN'
#!/bin/sh
HERE="$(dirname "$(readlink -f "$0")")"
exec "$HERE/neonwolf/neonwolf" "$@"
APPRUN
chmod +x "$APPDIR/AppRun"

# Desktop file
cat > "$APPDIR/neonwolf.desktop" << 'DESKTOP'
[Desktop Entry]
Type=Application
Name=Neonwolf
Comment=Privacy-focused web browser with synthwave aesthetics
Exec=AppRun %u
Icon=neonwolf
Categories=Network;WebBrowser;
StartupWMClass=neonwolf
MimeType=text/html;text/xml;application/xhtml+xml;x-scheme-handler/http;x-scheme-handler/https;
Terminal=false
DESKTOP

# Icon
cp "$APPDIR/neonwolf/browser/chrome/icons/default/default256.png" "$APPDIR/neonwolf.png" 2>/dev/null || \
cp "$(dirname "$0")/../themes/browser/branding/neonwolf/default256.png" "$APPDIR/neonwolf.png"

ln -sf neonwolf.png "$APPDIR/.DirIcon"

# Download appimagetool if not present
AITOOL="$(which appimagetool 2>/dev/null || echo /tmp/appimagetool)"
if [ ! -x "$AITOOL" ]; then
    echo "Downloading appimagetool..."
    python3 -c "
import urllib.request
url = 'https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage'
urllib.request.urlretrieve(url, '/tmp/appimagetool')
"
    chmod +x /tmp/appimagetool
    AITOOL="/tmp/appimagetool"
fi

# Build
mkdir -p "$OUT_DIR"
OUTPUT="$OUT_DIR/Neonwolf-x86_64.AppImage"
echo "Building AppImage..."
ARCH=x86_64 "$AITOOL" --no-appstream "$APPDIR" "$OUTPUT"

rm -rf "$APPDIR"
echo "Done: $OUTPUT"
ls -lh "$OUTPUT"
