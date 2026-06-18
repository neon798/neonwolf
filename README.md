# Neonwolf

A LibreWolf fork with a synthwave vision — retro arcade aesthetics meet uncompromising privacy.

## Features

- **Privacy Hardened**: All LibreWolf privacy protections (RFP, telemetry disabled, fingerprinting resistance)
- **Synthwave Theme**: Dark deep-purple/candy-pink/cyan aesthetic inspired by outrun and vaporwave
- **Brave-style Shields**: Per-site ad/tracker/fingerprinting blocking toggle
- **Privacy-First Search**: DuckDuckGo default, no Google/Bing trackers
- **No Telemetry**: All Mozilla telemetry, crash reporting, and data collection stripped out

## Structure

```
neonwolf/
├── assets/
│   ├── mozconfig.new               # Build configuration
│   ├── patches.txt                 # Ordered patch list
│   └── search-config.json          # Default search engines
├── patches/
│   ├── neonwolf-branding.patch     # App name/vendor branding
│   ├── neonwolf-dbus-name.patch    # DBus service name
│   ├── neonwolf-mozilla-dirs.patch # Directory paths
│   ├── neonwolf-prefs.patch        # Default preferences
│   ├── neonwolf-shields.patch      # Brave-style shields
│   ├── neonwolf-synthwave-theme.patch # Theme integration
│   ├── neonwolf-disable-data-reporting.patch
│   ├── neonwolf-devtools-bypass.patch
│   ├── neonwolf-remove-addons.patch
│   ├── neonwolf-context-menu.patch
│   ├── neonwolf-urlbarprovider-interventions.patch
│   ├── removed-patches/            # Patches removed from upstream
│   └── ui-patches/                 # UI customization patches
├── scripts/
│   ├── neonwolf-patches.py         # Patching engine
│   └── generate-icons.sh           # SVG -> PNG converter
├── settings/
│   ├── neonwolf.cfg                # Main configuration
│   ├── distribution/
│   │   └── policies.json           # Enterprise policies
│   └── defaults/pref/
│       └── local-settings.js       # Config loader
├── themes/browser/
│   ├── base/content/
│   │   ├── neonwolf-theme.css      # Synthwave chrome theme
│   │   ├── neonwolf-shields.css    # Shields panel styling
│   │   ├── neonwolf-shields.js     # Shields button logic
│   │   ├── neonwolf-shields-panel.js # Shields panel logic
│   │   ├── neonwolf-shields.xhtml  # Shields panel XUL
│   │   ├── aboutDialog.css         # About dialog styles
│   │   ├── aboutDialog.js          # About dialog logic
│   │   ├── aboutDialog.xhtml       # About dialog layout
│   │   └── icons/                  # SVG icons
│   └── branding/neonwolf/          # App icons
├── .forgejo/workflows/build.yml    # CI pipeline
├── Makefile                        # Build system
├── version                         # Firefox version
└── release                         # Build release number
```

## Building

### Prerequisites

- Linux x86_64 (Ubuntu 24.04 recommended)
- 16GB+ RAM, 80GB+ free disk
- Rust, Clang, Python 3, Node.js, NASM, Cargo

### Quick Start

```sh
# 1. Install build prerequisites (Ubuntu/Debian)
sudo apt-get install -y autoconf2.13 build-essential cargo ccache clang cmake \
  libasound2-dev libdbus-1-dev libgtk-3-dev libpulse-dev libx11-dev \
  libx11-xcb-dev libxcb-shm0-dev libxcb1-dev libxext-dev libxkbcommon-dev \
  libxrandr-dev mesa-common-dev nasm ninja-build nodejs npm python3 \
  python3-pip python3-setuptools rustc yasm libavcodec-dev libavutil-dev \
  libswresample-dev libclang-dev llvm-dev librsvg2-bin

# 2. Fetch Firefox source
make fetch

# 3. Apply Neonwolf patches
make dir

# 4. Bootstrap build environment
make bootstrap

# 5. Build (this takes hours)
make build

# 6. Package
make package
```

## How It Works

Neonwolf patches are applied on top of a clean Firefox source tarball, following the same approach as LibreWolf. The patching pipeline:

1. `make fetch` downloads `firefox-${version}.source.tar.xz` from Mozilla
2. `make dir` extracts it, runs `scripts/neonwolf-patches.py` which:
   - Copies the custom mozconfig
   - Applies all patches from `assets/patches.txt` in order
   - Seeds the `lw/` directory with neonwolf.cfg + policies
   - Sets version/release numbers
3. `./mach build` compiles the browser using the mozconfig

## Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `--neonwolf-bg-dark` | `#0d001a` | Deepest background |
| `--neonwolf-bg-mid` | `#1a0028` | Panel backgrounds |
| `--neonwolf-bg-light` | `#2d004f` | Hover states |
| `--neonwolf-accent-pink` | `#ff00ff` | Primary accent |
| `--neonwolf-accent-cyan` | `#00ffff` | Secondary accent |
| `--neonwolf-accent-purple` | `#cc00ff` | Tertiary accent |
| `--neonwolf-text-primary` | `#e0e0ff` | Body text |
| `--neonwolf-text-dim` | `#8866aa` | Muted text |

## Credits

- [LibreWolf](https://librewolf.net/) — The privacy-focused foundation
- Mozilla Firefox — The underlying browser engine
