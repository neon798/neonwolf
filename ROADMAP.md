# ROADMAP — Neonwolf native-privacy vision

> **ACTIVE.** This is no longer aspirational. The "minimal marked delta" prime
> directive has been retired (see `README.md` / `CLAUDE.md`); the native work
> below is now the product. Execution sequencing and milestones live in
> [`PLAN_OF_ACTION.md`](PLAN_OF_ACTION.md).

## Goal
Eliminate extension dependencies for core privacy/security. A fresh Neonwolf install should be as effective as LibreWolf + uBlock Origin + CanvasBlocker — without installing any extensions.

## Pillars

### 1. Native ad blocking (≥ uBO parity)
- [Phase 1] Domain-specific cosmetic filtering — DONE (in-tree)
- [Phase 2] Generic cosmetic filtering (hidden class/id selectors + MutationObserver) — NEXT
- [Phase 3] Scriptlet injection (anti-anti-adb) — NEXT
- [Phase 4] Dynamic filtering / noop rules / per-site toggle UI

### 2. DNS hardening (Mullvad base, max protection, on-by-default) — DONE
- Ship `network.trr.mode = 3` (TRR-only, no plain-DNS fallback) ✔️
- Default resolver: `https://base.dns.mullvad.net/dns-query` ✔️
- Hardened DNSSEC + OCSP via DOH ✔️

### 3. Credential management — remove, don't manage
- Strip all built-in password/autofill managers from the binary where possible
- Config-level disable where removal would conflict with upstream patches
- Ship a curated "recommended password managers" page replacing the old `about:logins`

### 4. Anti-fingerprinting spoofing
Goal: present a common, indistinguishable browser profile — not just resist fingerprinting (which stands out), but *spoof* a convincing one.

- **Spoofed surface** (all configurable in `neonwolf.overrides.cfg` / `policies.json`):
  - `navigator.userAgent` → latest Firefox ESR or Chrome stable string
  - `navigator.platform` → `Win64` / `Win32` (most common)
  - `navigator.hardwareConcurrency` → 4 or 8
  - Screen resolution → 1920x1080
  - Color depth → 24
  - Timezone → UTC
  - Content languages → `en-US,en;q=0.5`
  - Canvas / WebGL / AudioContext noise injection (via `privacy.resistFingerprinting` where compatible, custom patches where not)
- **Patch surface**: Where `resistFingerprinting` exposes the browser as "modified", write targeted patches that spoof specific properties to common values instead of returning random noise.

### 5. Delivery model
All preferences land in `assets/neonwolf.overrides.cfg` or `policies.json` (locked). Patch-level changes land in `patches/` and are wired in `assets/patches.txt`. Each pillar gets a tracking doc in `docs/` analogous to `WIP-native-cosmetic-blocker.md`.
