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

## Quick test workflow (no full rebuild needed)

A pre-built tarball exists at `docker-dist/neonwolf-129.0-1.en-US.linux-x86_64.tar.bz2`. To test theme/CSS changes without a 4-hour rebuild:

```sh
# 1. Extract to temp dir (if not already)
mkdir -p /tmp/neonwolf-test
tar xf docker-dist/neonwolf-129.0-1.en-US.linux-x86_64.tar.bz2 -C /tmp/neonwolf-test

# 2. Extract browser/omni.ja (this is a zip file containing chrome content)
mkdir -p /tmp/ja-work
python3 -c "
import zipfile, os
src = '/tmp/neonwolf-test/neonwolf/browser/omni.ja'
os.makedirs('/tmp/ja-work/extracted', exist_ok=True)
with zipfile.ZipFile(src) as z: z.extractall('/tmp/ja-work/extracted')
"

# 3. Copy updated files into extracted tree
cp themes/browser/base/content/neonwolf-theme.css /tmp/ja-work/extracted/chrome/browser/content/browser/

# 4. Repack omni.ja (ALWAYS use ZIP_STORED, not deflated)
python3 -c "
import zipfile, os
out = '/tmp/neonwolf-test/neonwolf/browser/omni.ja'
with zipfile.ZipFile(out, 'w', zipfile.ZIP_STORED) as zout:
    for root, dirs, files in os.walk('/tmp/ja-work/extracted'):
        for f in files:
            fp = os.path.join(root, f)
            zout.write(fp, fp[len('/tmp/ja-work/extracted/'):], zipfile.ZIP_STORED)
"

# 5. Restart browser (set locale to avoid CJK fallback)
pkill -f 'neonwolf/neonwolf'; sleep 1
rm -rf /tmp/neonwolf-profile; mkdir -p /tmp/neonwolf-profile
LANG=en_US.UTF-8 DISPLAY=:0 /tmp/neonwolf-test/neonwolf/neonwolf --no-remote --profile /tmp/neonwolf-profile &
```

**Important:** Firefox `omni.ja` files MUST be ZIP_STORED (uncompressed). Using ZIP_DEFLATED will cause startup failures.

## Architecture and control flow

### Version control
- `./version` — Firefox base version (e.g. `129.0`)
- `./release` — Neonwolf release number (currently `2`)
- These are read by both the Makefile and CI (`.forgejo/workflows/build.yml`)

### Patching pipeline (`scripts/neonwolf-patches.py`)

This is the heart of the repo. Called by `make dir`, it:

1. Enters the extracted Firefox source dir (`neonwolf-{version}-{release}/`)
2. Copies `assets/mozconfig.new` → `mozconfig`
3. Copies entire `themes/browser/` tree into the source (branding + chrome content)
4. Copies `assets/search-config.json` → `services/settings/dumps/main/search-config.json`
5. Copies replacement logo SVGs over Firefox-branded files (newtab, Firefox View, all about:debugging channel icons, browsers/firefox.svg)
6. Reads `assets/patches.txt` and applies each patch with `patch -p1` **in order**
7. Registers `neonwolf-theme.css` and `synthwave-mountains.svg` in `browser/base/jar.mn` via Python string replacement
8. Injects a `<link rel="stylesheet">` for `neonwolf-theme.css` into `browser/base/content/browser.xhtml`
9. Copies `synthwave-mountains.svg` into `browser/base/content/`
10. **Appends synthwave new tab CSS to `browser/components/newtab/css/activity-stream.css`** — this is how `about:newtab` gets themed (see "New tab theming" below)
11. Applies `xmas.patch` separately (to avoid disturbing other workflows)
12. Copies `pack_vs.py` to `build/vs/`
13. Seeds `lw/` directory with `neonwolf.cfg`, `policies.json`, `local-settings.js`
14. Applies pref-pane patch (`pref-pane-small.patch`) and copies pref-pane files
15. Appends Neonwolf locale strings to `preferences.ftl`
16. Copies `mozfetch.sh` and other helper scripts into `lw/`
17. Overwrites `browser/config/version.txt` and `version_display.txt` with `{version}-{release}`
18. Runs `generate-locales.sh` to fetch and brand all shipped locales

### Settings loading chain

```
local-settings.js  →  loads neonwolf.cfg  →  lockPref() / defaultPref() / pref()
policies.json       →  enterprise policy enforcement (blocks Google/Bing, forces uBlock)
```

- `lockPref()` — cannot be changed by user; unlock+restart needed
- `pref()` — sets default but user can override
- `defaultPref()` — sets default, user can override

### New tab theming (critical architecture decision)

`about:newtab` and `about:home` are **content documents**, not chrome documents. CSS loaded via `browser.xhtml` `<link>` or `@-moz-document` rules in chrome CSS **will not affect** `about:newtab`. The theming must be injected directly into the activity stream's own stylesheet:

- **Target file:** `browser/components/newtab/css/activity-stream.css`
- **Method:** Python `file.write()` append at the end of `neonwolf-patches.py`
- The synthwave CSS block starts with `/* === Neonwolf Synthwave New Tab Background === */`

The current new tab layout stacks:
1. **Sky gradient** — `body` background (linear gradient: purple → pink → orange → yellow → back to purple)
2. **Search bar glow** — CSS on `.search-handoff-button` with `::after` pseudo-element glow behind the bar (`z-index: -1`)
3. **Neonwolf logo** — `body::before`, centered at `top: 38%`, `width/height: 420px`, base64-encoded SVG as `background-image`
4. **Mountains + grid** — `body::after`, `bottom: 0`, `height: 35%`, loads `chrome://browser/content/synthwave-mountains.svg`

The logo SVG is base64-encoded at patch time and inlined as a `data:image/svg+xml;base64,...` URI because `chrome://` URIs don't resolve from content documents.

### Search bar glow pattern

The glow uses a **pseudo-element behind the element** approach — not `filter: drop-shadow()` (which can bleed into adjacent elements) and not direct `box-shadow` on the input (which also glows internally):

```css
.search-handoff-button {
  position: relative;
  z-index: 1;
  border: 1.5px solid #00ffff;
  background: rgba(13,0,26,0.95);
  box-shadow: none;           /* no inner glow */
  overflow: visible;
}
.search-handoff-button::after {
  content: "";
  position: absolute;
  inset: -4px;
  border-radius: 12px;
  box-shadow: 0 0 8px #00ffff, 0 0 16px rgba(0,255,255,0.9), ...;
  z-index: -1;               /* behind the bar */
  pointer-events: none;
}
```

This pattern is reliable across Firefox versions. Do not switch to `outline` or `filter` approaches — those bled into the input interior.

### Logo asset strategy

All neonwolf logo replacements flow from a **single source SVG**: `themes/browser/base/content/icons/neonwolf-logo.svg`. Derivative assets:

| Asset | Path | Method |
|-------|------|--------|
| Branding PNGs (16/32/48/64/128/256) | `themes/browser/branding/neonwolf/default*.png` | `generate-icons.sh` (rsvg-convert) |
| Settings category icon | `patches/pref-pane/category-neonwolf.svg` | Stripped copy of source SVG |
| New tab Firefox logo replacement | `assets/neonwolf-newtab-logo.svg` | Stripped copy of source SVG |
| Firefox View toolbar icon | `assets/neonwolf-firefox-view.svg` | Stripped copy of source SVG |
| Devtools about:debugging icons | copied at build time in `neonwolf-patches.py` | Source SVG copied directly |
| New tab hero logo | Base64 inlined in CSS | Encoded at patch time in Python |

All `.png` files in `themes/browser/branding/neonwolf/` and `assets/` are **generated from SVGs** — never edited directly.

### Theme injection

Three files are modified at patch-time using Python string replacement (NOT via patch files):
- `browser/base/jar.mn` — adds `neonwolf-theme.css` and `synthwave-mountains.svg` entries so they get packaged into `omni.ja`
- `browser/base/content/browser.xhtml` — adds a `<link rel="stylesheet">` to load the chrome theme
- `browser/components/newtab/css/activity-stream.css` — **appends** synthwave new tab CSS (critical for content page styling)

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
│   ├── neonwolf-newtab-logo.svg        # Logo for about:newtab replacement
│   ├── neonwolf-firefox-view.svg       # Logo for Firefox View toolbar icon
│   └── Dockerfile           # Ubuntu 24.04 Docker build image
├── patches/                 # All patches applied to Firefox source
│   ├── *.patch              # Core patches (branding, prefs, JXL, uBlock, Nvidia, etc.)
│   ├── ui-patches/          # UI modifications
│   │   ├── neonwolf-logo-devtools.patch  # Routes about:debugging icon to neonwolf SVG
│   │   └── *.patch          # Other UI patches (cookie dialogs, Firefox View, etc.)
│   ├── sed-patches/         # Sed-based text replacements
│   ├── pref-pane/           # Neonwolf settings pane (patch + JS + CSS + XHTML + FTL)
│   ├── removed-patches/     # Patches removed from upstream LibreWolf (kept for reference)
│   └── unity_kde/           # KDE/Unity integration patches
├── themes/browser/
│   ├── branding/neonwolf/   # Firefox branding replacement (icons, strings, configure.sh)
│   └── base/content/        # Chrome content injected into omni.ja
│       ├── neonwolf-theme.css           # Main synthwave CSS theme (chrome only)
│       ├── neonwolf-shields.{css,js,xhtml}  # Shields panel
│       ├── aboutDialog.{css,js,xhtml}        # Custom about dialog
│       └── icons/                         # SVG source icons
│           ├── neonwolf-logo.svg          # THE canonical logo — all derivatives flow from this
│           ├── about-logo.svg             # Copy of neonwolf-logo.svg
│           ├── synthwave-mountains.svg    # Mountain silhouette for newtab background
│           ├── neonwolf-shields-up.svg    # Shield icon (shields ON)
│           └── neonwolf-shields-down.svg  # Shield icon (shields OFF)
├── settings/
│   ├── neonwolf.cfg          # Autoconfig prefs (the big one — 200+ prefs)
│   ├── distribution/policies.json  # Enterprise policies (forces uBlock, blocks Google/Bing)
│   └── defaults/pref/local-settings.js  # Loads neonwolf.cfg
├── scripts/
│   ├── neonwolf-patches.py   # Patch orchestrator (CORE — read this first)
│   ├── generate-locales.sh   # Downloads & brands l10n from hg.mozilla.org
│   ├── generate-icons.sh     # SVG → PNG conversion (requires rsvg-convert)
│   ├── mozfetch.sh           # Fetches + bootstraps Firefox Nightly
│   └── resize-png.py         # PNG resizer utility
├── .forgejo/workflows/build.yml  # CI (Forgejo Actions, GitHub-compatible syntax)
├── Makefile                  # All build targets
├── version                   # Firefox base version (129.0)
├── release                   # Neonwolf release number (2)
├── AGENTS.md                 # This file
└── docker-dist/              # Pre-built Docker distribution artifacts
    └── neonwolf-129.0-1.en-US.linux-x86_64.tar.bz2  # Quick-test build
```

## Naming and style conventions

- **CSS custom properties**: `--neonwolf-*` prefix (e.g., `--neonwolf-bg-darkest`, `--neonwolf-accent-pink`)
- **Color palette**: Backgrounds are deep purple (`#0d001a` → `#2d004f`), accents are neon pink (`#ff00ff`) and cyan (`#00ffff`), text is lavender (`#b0b0ff`/`#e0b0ff`), dim text is `#604080`
- **Branding**: Everything is "Neonwolf" — the `configure.sh` sets all Mozilla branding variables. Locale generation sed-replaces "Mozilla Firefox" → "Neonwolf", "Firefox" → "Neonwolf", "Mozilla" → "Neonwolf"
- **Shields prefs**: `neonwolf.shields.*` namespace
- **Patches**: Named descriptively, applied in the order listed in `assets/patches.txt`. Order matters — later patches may depend on earlier ones.
- **Mozconfig**: Uses `ac_add_options` style, disables crashreporter/telemetry/updater/tests, enables JXL/hardening/release/optimize, uses system clang
- **Pref pane**: Follows Firefox's existing preferences module pattern — registers as `paneNeonwolf` in `preferences.js`

## Critical gotchas

### about:newtab is a content page, not chrome
This is the single most important architectural fact. Chrome CSS (`neonwolf-theme.css` linked from `browser.xhtml`) does NOT apply to `about:newtab` or `about:home`. All new tab theming must go into `browser/components/newtab/css/activity-stream.css` via append in `neonwolf-patches.py`.

### omni.ja must be ZIP_STORED
Firefox `omni.ja` files MUST use zero-compression ZIP format. Using `ZIP_DEFLATED` causes startup failures. Always use `zipfile.ZIP_STORED` when repacking.

### Version bumps require changes in multiple places
- `version` file
- `release` file
- `.forgejo/workflows/build.yml` (hardcoded `NEONWOLF_VERSION` and `NEONWOLF_RELEASE` env vars)
- `assets/Dockerfile` (hardcoded path `neonwolf-129.0-1`)

### neonwolf-theme.css injection is NOT a patch
The theme CSS file is registered via Python string replacement in `neonwolf-patches.py`. If the upstream Firefox source changes the text that's being searched for in `browser/base/jar.mn` or `browser/base/content/browser.xhtml`, the injections will silently fail. No error is raised — the string just won't be found and replaced.

### Patch order is load-bearing
`assets/patches.txt` defines the exact order patches are applied. Some patches depend on earlier ones (e.g., branding patches must run before UI patches). Never reorder without testing full patch application.

### xmas.patch is special
Applied separately at the end of `neonwolf-patches.py` because not all builders use the same workflow. This is intentional, not an oversight.

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
`neonwolf-patches.py` verifies the source dir by checking for `configure.py`. If the extraction or renaming fails, the script exits with an error.

### Remember to set LANG when launching
Firefox can fall back to CJK locale detection. Always launch with `LANG=en_US.UTF-8`:
```sh
LANG=en_US.UTF-8 DISPLAY=:0 /path/to/neonwolf --no-remote --profile /tmp/neonwolf-profile &
```

## Release process

1. Bump `release` file (e.g. `2` → `3`)
2. Update `NEONWOLF_RELEASE` in `.forgejo/workflows/build.yml`
3. Commit both with message: `bump release to N for alpha N`
4. Push to trigger CI build
5. Create GitHub release:
   ```sh
   gh release create v129.0-N --title "Neonwolf 129.0-N (Alpha N)" --notes "..."
   ```

## Current state (Alpha 2, v129.0-2)

- **Tab theme**: Fully synthwave — no grey backgrounds, `.tab-background` shadow DOM styled, internal Firefox variables overridden
- **New tab**: Sunset gradient + mountain silhouette SVG + centered neonwolf logo (420x420, top:38%) + cyan neon search bar glow
- **Logo**: All LibreWolf flame icons replaced with actual neonwolf logo source SVG
- **Settings**: Neonwolf logo in sidebar, custom Neonwolf preferences pane
- **omni.ja repack**: Quick-test workflow established for theme iteration without full rebuild
- **No remaining LibreWolf references** in any active source file or build artifact
