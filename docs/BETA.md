# Neonwolf Beta

Neonwolf is a privacy-first Firefox fork. This is a public beta for Linux and Windows. Feedback is welcome via GitHub issues.

## Download

Beta builds are on the [GitHub Releases page](https://github.com/neon798/neonwolf/releases).

- **Linux:** `Neonwolf-x86_64.AppImage` (portable) or `*.linux-x86_64.tar.xz`
- **Windows:** `*.win64.installer.exe` (installer) or `*.win64.zip` (portable)
- **macOS:** no build yet (planned for a later beta)

## Installing (the builds are unsigned)

Beta builds are **not code-signed**, so the OS will show a warning. That is expected for a beta.

### Linux (AppImage)

1. Make the AppImage executable: `chmod +x Neonwolf-x86_64.AppImage`
2. Run it.

If it will not start, install FUSE (`libfuse2` on Debian/Ubuntu).

### Linux (tar.xz)

Extract the archive and run the `neonwolf` binary inside.

### Windows

SmartScreen may show **Windows protected your PC**. Click **More info**, then **Run anyway**, and continue through the installer.

## Updates

- Neonwolf checks GitHub for a newer build about once a day and shows a banner when one is available.
- There is **no automatic update** and **no background downloader** — by design. To update, download the new build from the Releases page and reinstall (Windows) or replace the AppImage / extracted folder (Linux).

## Known issues (beta)

- Ad and tracker **network** blocking is complete, but a few cosmetic / in-page ad-script checks do not pass yet (script-injection "scriptlets" are disabled pending a fix), so third-party ad-blocker test sites score around 94%, not 100%.
- Anti-fingerprinting randomizes **canvas and WebGL** per site, but **audio** fingerprinting is not randomized yet.
- **No macOS build** in this beta.
- Builds are **unsigned** (see install steps above).
- **No built-in password manager** — by design. Neonwolf recommends Bitwarden, 1Password, Proton Pass, or KeePassXC (the first-run wizard links these).
- **Windows is less tested than Linux**; please report anything odd.

## Reporting bugs

Please open a [GitHub issue](https://github.com/neon798/neonwolf/issues) with your OS, what you did, and what happened.
