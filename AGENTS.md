# AGENTS.md — Neonwolf

A LibreWolf fork that patches Firefox 129.0 source with privacy hardening, a synthwave theme, and Brave-style per-site shields.

## Project type

**Patch-distribution repo.** There is no application source code here. The repo holds patches, branding files, CSS themes, build config, and a Python orchestrator that takes a *stock Firefox tarball*, applies patches + copies in files, and produces a custom build. Think of it as a glorified `patch && ./mach build` wrapper.

## Build commands

Everything flows through the `Makefile`. Version and release numbers are read from the `version` and `release` files at the repo root.

| Command | What it does |
|---------|-------------|
| `make fetch` | Downloads `firefox-{version}.source.tar.xz` from Mozilla's archive |
| `make dir` | Extracts tarball, runs `scripts/neonwolf-patches.py` to apply all patches and copy in theming/branding/settings |
| `make bootstrap` | Installs system deps (apt/rpm) then runs `./mach bootstrap` in the patched tree |
| `make build` | `./mach build` in the patched tree |
| `make package` | `./mach package-multi-locale` and copies the bz2 to the repo root |
| `make run` | `./mach run` |
| `make check` | Checks for newer Firefox versions (reads remote) |
| `make check-patchfail` | Validates patches apply cleanly |
| `make check-fuzz` | Checks patches for fuzz |
| `make fixfuzz` | Fixes patch fuzz |
| `make clean` | Removes extracted source + build artifacts (keeps Firefox tarball) |
| `make veryclean` | Also removes the patched neonwolf source dir |
| `make distclean` | Removes everything including the Firefox tarball |
| `make docker-build-image` | Builds the Docker build image |
| `make docker-run-build-job` | Runs the full build inside Docker |

## Architecture and control flow

### Version control
- `./version` — Firefox base version (e.g. `129.0`)
- `./release` — Neonwolf release number (e.g. `1`)
- These are read by both the Makefile and CI (`.forgejo/workflows/build.yml`)

### Patching pipeline (`scripts/neonwolf-patches.py`)

This is the heart of the repo. Called by `make dir`, it:

1. Enters the extracted Firefox source dir (`neonwolf-{version}-{release}/`)
2. Copies `assets/mozconfig.new` → `mozconfig`
3. Copies entire `themes/browser/` tree into the source (branding + chrome content)
4. Copies `assets/search-config.json` → `services/settings/dumps/main/search-config.json`
5. Reads `assets/patches.txt` and applies each patch with `patch -p1` **in order**
6. **Injects neonwolf-theme.css into `browser/base/jar.mn`** via Python string replacement (not a patch!)
7. **Injects a `<link>` for neonwolf-theme.css into `browser/base/content/browser.xhtml`** via string replacement (not a patch!)
8. Applies `xmas.patch` separately (to avoid disturbing other workflows)
9. Copies `pack_vs.py` to `build/vs/`
10. Seeds `lw/` directory with `neonwolf.cfg`, `policies.json`, `local-settings.js`
11. Applies pref-pane patch (`pref-pane-small.patch`) and copies pref-pane files
12. Appends Neonwolf locale strings to `preferences.ftl`
13. Copies `mozfetch.sh` and other helper scripts into `lw/`
14. Overwrites `browser/config/version.txt` and `version_display.txt` with `{version}-{release}`
15. Runs `generate-locales.sh` to fetch and brand all shipped locales

### Settings loading chain

```
local-settings.js  →  loads neonwolf.cfg  →  lockPref() / defaultPref() / pref()
policies.json       →  enterprise policy enforcement (blocks Google/Bing, forces uBlock)
```

- `lockPref()` — cannot be changed by user; unlock+restart needed
- `pref()` — sets default but user can override
- `defaultPref()` — sets default, user can override

### Theme injection

Two files are modified at patch-time using Python string replacement (NOT via patch files):
- `browser/base/jar.mn` — adds `neonwolf-theme.css` entry so it gets packaged into `omni.ja`
- `browser/base/content/browser.xhtml` — adds a `<link rel="stylesheet">` to load the theme

### Branding

`themes/browser/branding/neonwolf/` is a complete Firefox branding replacement:
- `configure.sh` — critical: sets `MOZ_APP_NAME=neonwolf`, `MOZ_APP_VENDOR=Neonwolf`, etc.
- `moz.build` — calls `FirefoxBranding()` with custom icons
- `locales/en-US/brand.ftl` / `brand.properties` — all brand strings ("Neonwolf")
- `pref/firefox-branding.js` — startup URLs, update URLs, etc.

### Shields system

Brave-style per-site shields implemented as a XUL panel:
- `neonwolf-shields.xhtml` — panel layout with toggles (ads, trackers, fingerprinting, cookies, HTTPS upgrade)
- `neonwolf-shields-panel.js` — reads/writes `neonwolf.shields.*` prefs
- `neonwolf-shields.css` — synthwave styling for the panel

## Directory layout

```
neonwolf/
├── assets/                  # Build inputs
│   ├── mozconfig.new        # Firefox build config (mozconfig)
│   ├── patches.txt          # Ordered list of patch files to apply
│   ├── search-config.json   # Default search engine config (DuckDuckGo + privacy engines)
│   └── Dockerfile           # Ubuntu 24.04 Docker build image
├── patches/                 # All patches applied to Firefox source
│   ├── *.patch              # Core patches (branding, prefs, JXL, uBlock, Nvidia, etc.)
│   ├── ui-patches/          # UI modifications (cookie dialogs, Firefox View, etc.)
│   ├── sed-patches/         # Sed-based text replacements
│   ├── pref-pane/           # Neonwolf settings pane (patch + JS + CSS + XHTML + FTL)
│   ├── removed-patches/     # Patches removed from upstream LibreWolf (kept for reference)
│   └── unity_kde/           # KDE/Unity integration patches
├── themes/browser/
│   ├── branding/neonwolf/   # Firefox branding replacement (icons, strings, configure.sh)
│   └── base/content/        # Chrome content injected into omni.ja
│       ├── neonwolf-theme.css      # Main synthwave CSS theme
│       ├── neonwolf-shields.{css,js,xhtml}  # Shields panel
│       ├── aboutDialog.{css,js,xhtml}       # Custom about dialog
│       └── icons/                    # SVG source icons
├── settings/
│   ├── neonwolf.cfg          # Autoconfig prefs (the big one — 200+ prefs)
│   ├── distribution/policies.json  # Enterprise policies (forces uBlock, blocks Google/Bing)
│   └── defaults/pref/local-settings.js  # Loads neonwolf.cfg
├── scripts/
│   ├── neonwolf-patches.py   # Patch orchestrator (core script)
│   ├── generate-locales.sh   # Downloads & brands l10n from hg.mozilla.org
│   ├── generate-icons.sh     # SVG → PNG conversion (requires rsvg-convert)
│   ├── mozfetch.sh           # Fetches + bootstraps Firefox Nightly
│   └── resize-png.py         # PNG resizer utility
├── .forgejo/workflows/build.yml  # CI (Forgejo Actions, GitHub-compatible syntax)
├── Makefile                  # All build targets
├── version                   # Firefox base version
├── release                   # Neonwolf release number
└── docker-dist/              # Pre-built Docker distribution artifacts
```

## Naming and style conventions

- **CSS custom properties**: `--neonwolf-*` prefix (e.g., `--neonwolf-bg-darkest`, `--neonwolf-accent-pink`)
- **Branding**: Everything is "Neonwolf" — the `configure.sh` sets all Mozilla branding variables. Locale generation sed-replaces "Mozilla Firefox" → "Neonwolf", "Firefox" → "Neonwolf", "Mozilla" → "Neonwolf"
- **Shields prefs**: `neonwolf.shields.*` namespace
- **Patches**: Named descriptively, applied in the order listed in `assets/patches.txt`. Order matters — later patches may depend on earlier ones.
- **Mozconfig**: Uses `ac_add_options` style, disables crashreporter/telemetry/updater/tests, enables JXL/hardening/release/optimize, uses system clang
- **Pref pane**: Follows Firefox's existing preferences module pattern — registers as `paneNeonwolf` in `preferences.js`

## Critical gotchas

### Version bumps require changes in multiple places
- `version` file
- `.forgejo/workflows/build.yml` (hardcoded `NEONWOLF_VERSION` env var)
- `assets/Dockerfile` (hardcoded path `neonwolf-129.0-1`)

### neonwolf-theme.css injection is NOT a patch
The theme CSS file is registered via Python string replacement in `neonwolf-patches.py` (lines 106-122). If the upstream Firefox source changes the text that's being searched for in `browser/base/jar.mn` or `browser/base/content/browser.xhtml`, the injections will silently fail. No error is raised — the string just won't be found and replaced.

### Patch order is load-bearing
`assets/patches.txt` defines the exact order patches are applied. Some patches depend on earlier ones (e.g., branding patches must run before UI patches). Never reorder without testing full patch application.

### xmas.patch is special
Applied separately at the end of `neonwolf-patches.py` (line 126) because not all builders use the same workflow. This is intentional, not an oversight.

### mozconfig uses system clang
The mozconfig exports `CC=clang`, `CXX=clang++`, `AR=llvm-ar` and does NOT use `--enable-bootstrap`. The Docker build installs Rust 1.79.0 specifically (newer versions cause `packed_simd` compatibility issues with Firefox 129).

### neonwolf.cfg first line requirement
The first line of `settings/neonwolf.cfg` MUST be a `//` comment. This is enforced by Firefox's autoconfig parser.

### Locked prefs need restart
Preferences set with `lockPref()` in `neonwolf.cfg` require unlocking AND a browser restart to take effect. The neonwolf pref pane in the settings UI handles this for some prefs.

### CI is Forgejo Actions, not GitHub Actions
The workflow file uses the same YAML syntax as GitHub Actions but runs on Forgejo (a Gitea fork). The `actions/checkout@v4` and `actions/cache@v4` actions are used.

### There are no tests
This project has no test suite. Validation is done via `make check-patchfail` (checks patches apply cleanly) and by building successfully.

### Docker version lock
The Dockerfile has `neonwolf-129.0-1` hardcoded in its `WORKDIR` and `COPY` paths. Any version bump must update the Dockerfile too.

### Locale generation is network-dependent
`generate-locales.sh` downloads locale data from `hg.mozilla.org/l10n-central`. It runs 8 parallel downloads, skips `en-US`, `ca`, and `ja` (these are bundled with Firefox source directly).

### Mozilla source dir verification
`neonwolf-patches.py` verifies the source dir by checking for `configure.py` (line 188). If the extraction or renaming fails, the script exits with an error.
