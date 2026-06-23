# Cutting a Neonwolf test release

Cross-platform builds run in GitHub Actions (`.github/workflows/release-builds.yml`)
and attach artifacts to a **draft** GitHub Release for basic functional testing.

## How it works

1. **`source` job** (Linux) runs `make fetch && make dir && make all` to produce
   the patched, platform-independent Neonwolf source tarball and uploads it.
2. **`linux` / `macos` / `windows` jobs** each download that tarball, unpack it,
   then `./mach bootstrap`, `./mach build`, `./mach package` on a *native* runner
   (so macOS/Windows use their real, licensed SDKs — no cross-compile SDK pain).
   - Linux also wraps the package into an AppImage via `scripts/make-appimage.sh`.
3. **`release` job** collects whatever built into a draft GitHub Release.

## Running it

Actions → **release-builds** → *Run workflow*. Toggles:

- `build_linux` (default **on**) — tar.xz + AppImage. Cheap; validate this first.
- `build_macos` (default off) — `.dmg`, Apple Silicon. **Billed 10× minutes.**
- `build_windows` (default off) — installer + zip. **Billed.**
- `draft` (default **on**) — leave on; review before publishing.

Recommended first pass: **Linux only**, confirm the AppImage launches, then
enable macOS/Windows.

Pushing a `v*` tag also triggers a full (all-platform) draft build.

## Caveats / first-run reality

- All builds are **unsigned** — testers get Gatekeeper (macOS) / SmartScreen
  (Windows) warnings.
- Native Firefox builds are multi-hour and disk-heavy. The Linux job frees disk
  via `jlumbroso/free-disk-space`; if it still runs out, that's the first place
  to look.
- The **Windows** job runs inside the MozillaBuild shell — the most likely step
  to need iteration on the first real run (MozillaBuild setup / `start-shell.bat`
  invocation, toolchain bootstrap).
- Version/release come from `./version` and `./release`; the release is tagged
  `v<version>-<release>` (e.g. `v152.0.1-2`).
