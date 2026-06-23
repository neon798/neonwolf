# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A **patch-distribution repo** — not application source code. As of the 152
migration, Neonwolf is a **thin overlay on LibreWolf**: it takes a stock
Firefox **152.0.1** tarball, runs LibreWolf's patch orchestrator plus a small,
clearly-marked Neonwolf delta (synthwave branding/theme + a settings override
layer), and produces the Neonwolf browser. Think of it as LibreWolf's
`patch && ./mach build` pipeline with a Neonwolf skin on top.

The guiding principle of the migration: **keep everything identical to upstream
LibreWolf except a minimal, marked delta**, so version bumps stay close to a
`git merge upstream` away.

Version is read from `./version` (`152.0.1`), release from `./release` (`1`).
The `settings/` directory is a **git submodule** tracking
`codeberg.org/librewolf/settings` — the privacy/hardening baseline updates by
bumping the submodule, not by editing prefs here.

## Build commands

All targets go through `make`.

```sh
make fetch          # Download firefox-{version}.source.tar.xz from Mozilla (curl + gpg verify)
make dir            # Extract tarball + apply all patches (calls scripts/neonwolf-patches.py)
make bootstrap      # Install system deps + run ./mach bootstrap in patched tree
make build          # ./mach build (takes hours)
make package        # ./mach package-multi-locale → copies .bz2 to repo root
make run            # ./mach run

make check-patchfail   # Validate all patches apply cleanly (CI-equivalent test)
make check-fuzz        # Check patches for fuzz
make fixfuzz           # Fix patch fuzz
make clean             # Remove extracted source + build artifacts (keeps Firefox tarball)
make distclean         # Remove everything including Firefox tarball
```

The patched source tree is extracted to `neonwolf-{version}-{release}/`
(e.g. `neonwolf-152.0.1-1/`); the built binary lands at
`neonwolf-152.0.1-1/obj-x86_64-pc-linux-gnu/dist/bin/neonwolf`.

### Resuming an interrupted build
Run `./mach build` **directly inside the source tree**, not `make build` —
`make build` depends on the source dir and may re-extract/re-patch from scratch,
wiping the `obj-*` directory.

## Quick test workflow (no rebuild needed)

> ⚠️ The `docker-dist/neonwolf-129.0-1.*.tar.bz2` tarball predates the 152
> migration and is stale. For 152, test against the freshly built tree
> (`neonwolf-152.0.1-1/obj-x86_64-pc-linux-gnu/dist/bin/neonwolf`).

To test CSS/theme changes in seconds without a full rebuild, repack `omni.ja`
in the built tree (extract → swap CSS → repack with **`ZIP_STORED`** →
relaunch with a fresh profile). The chrome theme css lives at
`chrome/browser/content/browser/neonwolf-theme.css` inside `omni.ja`; new-tab
CSS is baked into `activity-stream.css` (see below) so theme-only edits there
require the same repack.

Launch a built binary directly:

```sh
rm -rf /tmp/nw-profile; mkdir -p /tmp/nw-profile
LANG=en_US.UTF-8 MOZ_ENABLE_WAYLAND=1 \
  neonwolf-152.0.1-1/obj-x86_64-pc-linux-gnu/dist/bin/neonwolf \
  --no-remote --profile /tmp/nw-profile
```

## Architecture

### Patching pipeline (`scripts/neonwolf-patches.py`)

This is the core of the repo and is **upstream `librewolf-patches.py` with a
small, clearly-marked Neonwolf delta**. `make dir` calls it with
`(version, release)`. The Neonwolf-specific steps are:

1. Copies `assets/mozconfig.new` → `mozconfig` (branding `browser/branding/neonwolf`, app-name `neonwolf`)
2. Copies `assets/search-config.json` into `services/settings/dumps/main/`
3. Applies all patches in `assets/patches.txt` **in order**, then `xmas.patch` separately (by design)
4. Copies `themes/browser/` tree in (branding + synthwave theme assets)
5. **Synthwave theme injection (fail-loud)** — see below
6. **Settings overlay** — `settings/librewolf.cfg` (from submodule) + `assets/neonwolf.overrides.cfg` appended; `policies.json` and `local-settings.js` from the submodule
7. Applies the LibreWolf pref-pane machinery (`pref-pane-small.patch`, `paneLibrewolf`), rebranded for display: the nav icon is `category-neonwolf.svg` and the shown strings read "Neonwolf" (see Naming conventions). Internal `librewolf-*` identifiers are kept on purpose to preserve translation-key matches and clean upstream merges.
8. Fetches l10n from `mozilla-l10n/firefox-l10n` (via curl), rebrands `appstrings.properties`, applies Neonwolf locales

### Theme injection (fail-loud — this changed in the migration)

Theme injection is **not a patch file** — it's Python string replacement in
`neonwolf-patches.py`. The migration replaced the old silent-failure approach
with **`replace_or_die` / `require_file` helpers that abort the build** if an
upstream anchor string moves, instead of silently shipping an unthemed browser.
Three injections:

1. `replace_or_die` registers `neonwolf-theme.css` + `synthwave-mountains.svg` in `browser/base/jar.mn` (so they land in `omni.ja`)
2. `replace_or_die` injects a `<link rel="stylesheet">` for `neonwolf-theme.css` into `browser/base/content/browser.xhtml`
3. **Appends** synthwave new-tab CSS to `browser/extensions/newtab/css/activity-stream.css`

If upstream Firefox changes the anchor strings, the build now **stops with a
clear error** naming the file to fix — no more silent unthemed builds.

### Settings loading chain

```
local-settings.js → loads librewolf.cfg → lockPref() / defaultPref() / pref()
librewolf.cfg      = submodule baseline  +  assets/neonwolf.overrides.cfg (appended; later prefs win)
policies.json      → enterprise policy enforcement (forces uBlock, blocks Google/Bing)
```

The autoconfig file stays named **`librewolf.cfg`** (not `neonwolf.cfg`) so
upstream patches that reference `librewolf.*` prefs keep working. Neonwolf-only
pref deltas go in `assets/neonwolf.overrides.cfg` — **do not** copy the
LibreWolf baseline into it; that comes from the submodule.

### Logo asset strategy

All logo derivatives flow from **one source**:
`themes/browser/base/content/icons/neonwolf-logo.svg`

| Asset | Method |
|-------|--------|
| Branding PNGs (16–256px) | `scripts/generate-icons.sh` (rsvg-convert) |
| New tab hero logo | Base64-inlined into `activity-stream.css` at patch time, applied as the background of Firefox's in-flow `.logo-and-wordmark .logo` slot (`chrome://` URIs don't resolve from content pages) |
| All other SVG copies | Stripped copies of the source SVG |

PNGs in `themes/browser/branding/neonwolf/` are always generated — never edit them directly.

## Critical constraints

### `about:newtab` is a content page, not chrome
Chrome CSS (`neonwolf-theme.css` linked from `browser.xhtml`) **does not apply**
to `about:newtab`/`about:home`. New-tab theming must be appended to
`browser/extensions/newtab/css/activity-stream.css` in `neonwolf-patches.py`.
**Note:** this path moved in FF152 — it was `browser/components/newtab/...` on
the old 129 base. This is the most important architectural fact.

### New-tab layout must scale, not use fixed viewport positions
The synthwave new-tab CSS (the `NEWTAB_CSS` block in `neonwolf-patches.py`) is
built to scale across window sizes — earlier versions mixed fixed `px` sizes
with `top: 38%` / `height: 35%` viewport positioning and broke at sizes other
than the one they were tuned for. The rules now in force:

- **Hero logo** rides Firefox's in-flow `.logo-and-wordmark .logo` slot (which
  sits directly above the search box inside `.search-wrapper`), *not* a
  `position: fixed` element. This guarantees a constant gap above the search
  bar at every size so it can never overlap it. Size scales via
  `clamp(140px, 34vmin, 360px)`; the `.wordmark` is hidden.
  This assumes the **search-only** new-tab layout (Neonwolf's privacy default):
  with Pocket/stories enabled, FF152 absolutely-positions `.logo-and-wordmark`
  into a corner and the hero logo would be misplaced.
- **Mountains** (`body::after`) are pinned to the bottom with height driven by
  the art's `aspect-ratio: 1920 / 480` (capped `max-height: 50vh`), so the base
  is never cropped. Do **not** go back to `height: %` + `background-size: cover`
  anchored top — that cut off the bottom on tall windows.

### `omni.ja` must be `ZIP_STORED`
Firefox `omni.ja` files must use zero-compression ZIP. `ZIP_DEFLATED` causes
startup failures. No exceptions.

### Theme injection fails loud, not silent
`jar.mn`/`browser.xhtml` injection uses `replace_or_die`. If upstream changes
the anchor strings the build **aborts with a named error** — fix the anchor in
`neonwolf-patches.py`.

### Patch order is load-bearing
`assets/patches.txt` defines the exact application order. Some patches depend on
earlier ones. Never reorder without testing with `make check-patchfail`.

### Settings come from the submodule
The privacy/hardening baseline lives in the `settings/` submodule. Update it by
bumping the submodule, not by hand-editing prefs. Neonwolf deltas go only in
`assets/neonwolf.overrides.cfg`.

### `librewolf.cfg` first-line requirement
The first line of the active autoconfig file (`librewolf.cfg`) **must** be a
`//` comment — enforced by Firefox's autoconfig parser. `neonwolf.overrides.cfg`
also starts with `//`.

### Version bumps
Update the `version` and `release` files; the Makefile reads them. The Docker/CI
path no longer hardcodes the version the way the old 129 setup did.

### CI
The repo lives on **GitHub**, where `.github/workflows/check-patches.yml` runs
the real CI: on push (`main`/`beta`/`rebase/**`), PRs, and manual dispatch it
fetches the **pinned** Firefox source (`./version`) and runs `make dir` —
validating that all patches + the Neonwolf delta (pref-pane patch, fail-loud
theme injections, settings overlay, l10n) apply cleanly. It does **not** compile
(too heavy for hosted runners); `make check-patchfail` is the equivalent local
check. A second workflow, **`.github/workflows/release-builds.yml`**, *does*
compile: on manual dispatch (per-platform toggles) or a `v*` tag it builds
Neonwolf for Linux/macOS/Windows on native runners and attaches the artifacts
(AppImage + tar.xz, `.dmg`, installer + zip) to a **draft** GitHub Release. See
`docs/RELEASE.md`. The **`.forgejo/workflows/`** are inherited upstream LibreWolf config —
they only run on Codeberg/Forgejo, still reference `librewolf-*` artifacts and
`detect-firefox-version.sh` (track-latest-stable), and are left **dormant and
untouched** so upstream merges stay clean. Only adapt them if mirroring to
Forgejo.

### Launch with `LANG=en_US.UTF-8`
Always set `LANG=en_US.UTF-8` when launching, or Firefox may fall back to CJK
locale detection. On Wayland sessions also set `MOZ_ENABLE_WAYLAND=1`.

## Naming conventions

- **CSS custom properties**: `--neonwolf-*` prefix
- **Color palette**: Backgrounds `#0d001a` → `#2d004f` (deep purple), accents `#ff00ff` (pink) and `#00ffff` (cyan), text `#e0e0ff`/`#b0b0ff`, dim text `#604080`/`#8866aa`
- **Pref pane**: rebranded for display only — the sidebar title, header, and in-pane strings read "Neonwolf" (across all 33 locales) and the nav icon is `category-neonwolf.svg`. Internal identifiers are **intentionally left as upstream** (`paneLibrewolf`, the `librewolf-*` Fluent keys, `librewolf.*` prefs, `librewolf.cfg`) to preserve translation-key matches and keep upstream merges clean — a deep rename was evaluated and rejected for that reason.

## Search bar glow pattern

The neon glow on the new tab search bar uses a pseudo-element behind the element
— not `filter: drop-shadow()` (bleeds) or direct `box-shadow` (glows internally).
**FF152 change:** the old `.search-handoff-button` element is gone — the search
box is now `<content-search-handoff-ui>` inside `.search-inner-wrapper`, so the
glow anchors to that wrapper (which already sets `position: relative`):

```css
.search-wrapper .search-inner-wrapper { position: relative; z-index: 1; }
.search-wrapper .search-inner-wrapper::after {
  content: ""; position: absolute; inset: 0; border-radius: 12px;
  box-shadow: 0 0 10px #00ffff, 0 0 20px rgba(0,255,255,1), ...;
  z-index: -1; pointer-events: none;
}
```

Use `inset: 0` (glow box matches the bar), not a negative inset — a negative
inset leaves a transparent ring between the border and the neon that shows the
background gradient through at smaller window sizes.

## No test suite

There are no automated tests. Patch validation is `make check-patchfail`.
Feature/theme validation requires the quick-test workflow above or a full
rebuild — and the synthwave theme must be eyeballed in a real GUI session
(chrome theme, new-tab background + glowing search bar).
