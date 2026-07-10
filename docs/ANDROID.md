# Neonwolf for Android — build notes

**Status (2026-07-10):** builds happen on **GitHub Actions**
(`.github/workflows/android-build.yml` — manual dispatch or push to an
`android/**` branch; APKs land as run artifacts). Local full-source builds
**OOM this machine**: a single rustc crate peaks ~17GB RSS, and with the qemu
VM resident the kernel oom-killer hangs the box (observed 2026-07-10 02:56,
`journalctl -k`). If building locally anyway: stop the VM first and set
`NEONWOLF_BUILD_JOBS=2`.

## What this is

Android port of Neonwolf: **GeckoView (full source, Neonwolf-patched toolkit)** + **Fenix shell**, package id `org.neonwolf.browser` (debug: `org.neonwolf.browser.debug`).

Not artifact mode. Not WebView. Not “install uBO as extension.” Native content-classifier / UBONetFilter rides shared `toolkit/`.

## Prerequisites

```sh
# From patched tree after desktop make dir
cd neonwolf-152.0.1-3
./mach --no-interactive bootstrap --application-choice=mobile_android
rustup target add aarch64-linux-android
mkdir -p ~/.mozbuild/android-device/avd   # skip broken AVD bootstrap
```

SDK: `~/.mozbuild/android-sdk-linux` (platforms android-37.0, build-tools 37.0.0)  
NDK: `~/.mozbuild/android-ndk-r29`  
JDK: `~/.mozbuild/jdk/jdk-17.0.18+8` (Gradle needs 17; system JDK 26 is too new)

## Build

```sh
# From repo root
make build-android          # or: scripts/build-android.sh
# Log: android-build.log
make package-android        # copy APKs to dist-android/
```

Objdir: `neonwolf-152.0.1-3/obj-android` (does not clobber desktop `obj-x86_64-pc-linux-gnu`).

## Privacy prefs (Android)

Injected into `mobile/android/app/geckoview-prefs.js` from  
`assets/android/neonwolf-geckoview-prefs.js`:

- Native adblock enable + list names + defer annotation
- RS dump allowlist including `main/content-classifier-lists`
- FPP-forward, RFP off
- Mullvad TRR-only DoH
- Safe Browsing off
- Telemetry/Nimbus off
- Autofill/passwords off

## How the Android delta is captured (all reproducible via `make dir` + `make build-android`)

- Fenix `applicationId` → `org.neonwolf` + `.browser` / `.browser.debug` and
  `app_name` → Neonwolf: `patches/android/fenix-neonwolf-appid.patch`
  (wired into `assets/patches.txt`, applied by `make dir`).
- GeckoView prefs append: done by `scripts/neonwolf-patches.py` during
  `make dir` (from `assets/android/neonwolf-geckoview-prefs.js`), with a
  belt-and-suspenders re-check in `make build-android`.
- `mozconfig` → `assets/mozconfig.android` (copied by `make build-android`).
- **`browser/config/version.txt` must be pure `152.0.1`** (not `152.0.1-3`):
  desktop bakes `-release` into version.txt; Android Gradle
  `computeVersionCode()` parseInts each dotted part and dies on `"1-3"`.
  `make build-android` now normalizes both version files automatically (a
  desktop rebuild in the same tree shows the plain version until the next
  `make dir`). Full Neonwolf build id stays in pref `neonwolf.version.full`.


## Verify after install

```sh
adb install -r dist-android/*.apk
adb logcat | rg -i 'UBONetFilter|ContentClassifier|neonwolf'
# about:config → check network.trr.mode=3, fingerprintingProtection=true,
# privacy.trackingprotection.content.protection.enabled=true
```

## Honest gaps for morning tech-preview

- Full Fenix liberate (strip Contile/Nimbus/telemetry UI) not done yet
- Shields mobile UI not done — engine prefs only
- Emulator system image download flaky; physical arm64 preferred
- Scorecard harness not yet run on device

See plan: capability matrix still applies; this night’s bar is **installable APK with Gecko prefs + native engine compiled in**.
