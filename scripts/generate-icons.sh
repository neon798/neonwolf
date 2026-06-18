#!/bin/sh
# Generate PNG icons from SVGs for Neonwolf branding.
# Requires librsvg (rsvg-convert) to be installed.

set -e

SVG_DIR="../themes/browser/base/content/icons"
BRANDING_DIR="../themes/browser/branding/neonwolf"

echo "Generating branding icons..."

# App icon (256x256)
rsvg-convert -w 256 -h 256 "${SVG_DIR}/neonwolf-logo.svg" > "${BRANDING_DIR}/default256.png"
rsvg-convert -w 128 -h 128 "${SVG_DIR}/neonwolf-logo.svg" > "${BRANDING_DIR}/default128.png"
rsvg-convert -w 64 -h 64 "${SVG_DIR}/neonwolf-logo.svg" > "${BRANDING_DIR}/default64.png"
rsvg-convert -w 48 -h 48 "${SVG_DIR}/neonwolf-logo.svg" > "${BRANDING_DIR}/default48.png"
rsvg-convert -w 32 -h 32 "${SVG_DIR}/neonwolf-logo.svg" > "${BRANDING_DIR}/default32.png"
rsvg-convert -w 16 -h 16 "${SVG_DIR}/neonwolf-logo.svg" > "${BRANDING_DIR}/default16.png"

# About logo (128x96)
rsvg-convert -w 128 -h 96 "${SVG_DIR}/about-logo.svg" > "${BRANDING_DIR}/about-logo.png"

# Shields icons
rsvg-convert -w 48 -h 48 "${SVG_DIR}/neonwolf-shields-up.svg" > "${BRANDING_DIR}/neonwolf-shields-up.png"
rsvg-convert -w 48 -h 48 "${SVG_DIR}/neonwolf-shields-down.svg" > "${BRANDING_DIR}/neonwolf-shields-down.png"

# Private browsing icons
cp "${BRANDING_DIR}/default48.png" "${BRANDING_DIR}/PrivateBrowsing_48.png"
cp "${BRANDING_DIR}/default32.png" "${BRANDING_DIR}/PrivateBrowsing_32.png"
cp "${BRANDING_DIR}/default16.png" "${BRANDING_DIR}/PrivateBrowsing_16.png"

# VisualElements
cp "${BRANDING_DIR}/default48.png" "${BRANDING_DIR}/VisualElements_48.png"
cp "${BRANDING_DIR}/default256.png" "${BRANDING_DIR}/VisualElements_256.png"

echo "Done. Icons generated in ${BRANDING_DIR}"
