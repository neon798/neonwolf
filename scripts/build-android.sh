#!/usr/bin/env bash
# Local Neonwolf Android full-source build. Does not push/commit anywhere.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TREE="${NEONWOLF_TREE:-$ROOT/neonwolf-$(cat "$ROOT/version")-$(cat "$ROOT/release")}"
LOG="${ROOT}/android-build.log"

# mach bootstrap installs toolchains under ~/.mozbuild with versioned dirs —
# glob instead of hardcoding so this works on CI runners too.
if [ -z "${JAVA_HOME:-}" ]; then
  JAVA_HOME="$(ls -d "$HOME"/.mozbuild/jdk/jdk-17* 2>/dev/null | sort -V | tail -1)"
fi
export JAVA_HOME
export ANDROID_HOME="${ANDROID_HOME:-$HOME/.mozbuild/android-sdk-linux}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
if [ -z "${ANDROID_NDK_HOME:-}" ]; then
  ANDROID_NDK_HOME="$(ls -d "$HOME"/.mozbuild/android-ndk-* 2>/dev/null | sort -V | tail -1)"
fi
export ANDROID_NDK_HOME
# Dummy AVD dir so configure does not try (and fail) to create an emulator image.
export ANDROID_AVD_PATH="${ANDROID_AVD_PATH:-$HOME/.mozbuild/android-device/avd}"
mkdir -p "$ANDROID_AVD_PATH"
CMDLINE_TOOLS="$(ls -d "$ANDROID_HOME"/cmdline-tools/*/bin 2>/dev/null | sort -V | tail -1)"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools${CMDLINE_TOOLS:+:$CMDLINE_TOOLS}:$PATH"

# Prefer sccache if present
if command -v sccache >/dev/null 2>&1 || [ -x "$HOME/.mozbuild/sccache/sccache" ]; then
  export RUSTC_WRAPPER="${RUSTC_WRAPPER:-sccache}"
  export CCACHE="${CCACHE:-sccache}"
fi

cd "$TREE"

echo "=== Neonwolf Android build $(date -Is) ===" | tee -a "$LOG"
echo "TREE=$TREE JAVA_HOME=$JAVA_HOME" | tee -a "$LOG"
echo "mozconfig:" | tee -a "$LOG"
cat mozconfig | tee -a "$LOG"
echo "=== configure/build ===" | tee -a "$LOG"

# Full build (configure + compile + package fenix). Resume-safe.
# NEONWOLF_BUILD_JOBS caps parallelism (local box OOMs unthrottled; CI uses all cores).
./mach build -j"${NEONWOLF_BUILD_JOBS:-$(nproc)}" 2>&1 | tee -a "$LOG"
echo "=== mach build exit: $? ===" | tee -a "$LOG"

# Package / find APKs
./mach package 2>&1 | tee -a "$LOG" || true

echo "=== APK search ===" | tee -a "$LOG"
find obj-android -name '*.apk' 2>/dev/null | tee -a "$LOG" || true
find . -path './obj-android/*' -name '*-arm64*.apk' 2>/dev/null | head -20 | tee -a "$LOG" || true

echo "=== done $(date -Is) ===" | tee -a "$LOG"
