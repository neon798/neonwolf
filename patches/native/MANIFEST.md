# patches/native/ — owned Neonwolf feature patches

This directory holds **Neonwolf-authored native engine features**, kept distinct
from inherited LibreWolf patches (`patches/*.patch`) and inherited UI tweaks
(`patches/ui-patches/*`). These are the patches that realize the capability-first
mandate (see `PLAN_OF_ACTION.md`): uBO-parity ad blocking, anti-fingerprint
farbling, the Shields panel, and binary-level surface stripping.

## Rules

- **Application order still lives in `assets/patches.txt`.** A patch placed here
  is not applied until it is listed there. Native patches append after
  `msix.patch` (where `native-cosmetic-filtering.patch` already sits).
- **Every native patch must anchor fail-loud.** Prefer `replace_or_die` /
  context that breaks if the upstream anchor moves, so a bad rebase fails
  `make check-patchfail` (CI) instead of silently shipping a no-op. This is the
  price of leaving "minimal delta" behind — make breakage loud.
- **Record every patch in the table below** with the FF source files it touches
  and a rebase-fragility rating, so the per-release rebase (`docs/REBASE.md`) has
  a triage order.

## Fragility scale

- **Low** — touches Neonwolf-owned files or rarely-changed config; near-zero
  rebase cost.
- **Medium** — touches stable-ish Gecko/JSActor surfaces; occasional anchor drift.
- **High** — touches hot, frequently-refactored Gecko internals; expect to
  reapply by hand most releases.

## Catalog

> Existing Neonwolf-owned patches currently still live in `patches/` for path
> stability; they are **scheduled to migrate here** (a follow-up that must update
> `assets/patches.txt` paths and re-run `make check-patchfail` in one step). New
> native work lands directly in `patches/native/`.

| Patch | Status | FF source touched | Fragility |
|---|---|---|---|
| `native-cosmetic-filtering.patch` *(in `patches/`, to migrate)* | shipped (Phase 1) | `content_classifier_engine` Rust crate (FFI), `ContentClassifierService.cpp`, `nsIContentClassifierService.idl`, `toolkit/actors/CosmeticFilter{Child,Parent}.sys.mjs`, `components.conf` | **High** |
| `rs-blocker.patch` *(in `patches/`, to migrate)* | shipped | `services/settings/RemoteSettingsClient.sys.mjs`, `Utils.sys.mjs` | Medium |
| `rfp-pin-hardware-concurrency.patch` *(in `patches/`, to migrate)* | shipped (guard) | `dom/workers/RuntimeService.cpp` | Medium |
| `rfp-spoof-timezone.patch` *(in `patches/`, to migrate)* | shipped | `toolkit/components/resistfingerprinting/nsRFPService.cpp` | Medium |
| `hide-passwordmgr.patch` / `neonwolf-hide-passwords-redesign.patch` *(in `patches/`)* | shipped (interim, superseded by M6) | `browser/components/preferences/privacy.js`, `browser-init.js` | Low |
| `native/native-cosmetic-generic-procedural.patch` (**M1** generic-cosmetic + procedural) | shipped (M1) | `content_classifier_engine/src/lib.rs` (cosmetic-selectors FFI), `content_classifier_engine/ContentClassifierEngine.h`, `ContentClassifierService.cpp`, `nsIContentClassifierService.idl`, `toolkit/actors/CosmeticFilter{Child,Parent}.sys.mjs`, new `toolkit/actors/CosmeticFilterProcedural.sys.mjs` (procedural executor), `toolkit/actors/moz.build`, `toolkit/modules/ActorManagerParent.sys.mjs` | **High** |
| `native/native-scriptlet-injection.patch` (**M2** scriptlet injection) | shipped (M2 — scriptlets PROVEN executing in-page end-to-end: a real uBO `set-constant` scriptlet set a page marker in-page via Marionette (needed the `scriptletGlobals` preamble fix, see `native-scriptlet-globals-fix.patch`). Remaining: vendor uBO ad-scriptlet/redirect content + implement `$redirect`/`$csp`) | `content_classifier_engine/src/lib.rs` (scriptlet FFI), `content_classifier_engine/Cargo.toml` + workspace `Cargo.lock` (`serde_json` dep), `content_classifier_engine/ContentClassifierEngine.h`, `ContentClassifierService.cpp`, `ContentClassifierService.h`, `nsIContentClassifierService.idl`, `toolkit/actors/CosmeticFilter{Child,Parent}.sys.mjs` | **High** |
| `native/native-shields-panel.patch` (**M3** Shields panel + logger) | shipped (M3 — per-site Shields validated: toggle disables blocking, UI wired); remaining: blocked-count badge, logger | `browser/base/jar.mn` (register shields chrome assets), `browser/base/content/browser.xhtml` (shields css/js), `browser/base/content/main-popupset.inc.xhtml` (shields panel include), `browser/base/content/navigator-toolbox.inc.xhtml` (urlbar shields button), `toolkit/actors/CosmeticFilterParent.sys.mjs` (shields-down guard), `netwerk/url-classifier/AsyncUrlChannelClassifier.cpp` (per-site shields-down skips native blocking) | Medium |
| `native/native-blocking-fixes.patch` (RS dump direct-read [native blocking now actually loads lists in real sessions], per-site blocked counter, network blocking no longer gated on ETP `aPerformBlocking`) | shipped | `content-classifier/ContentClassifierRemoteSettingsClient.sys.mjs` (read bundled dump via `resource://`), `ContentClassifierService.cpp` (`mBlockedCounts` tally + `GetBlockedCount`), `ContentClassifierService.h` (`mBlockedCounts` member), `nsIContentClassifierService.idl` (`getBlockedCount` + uuid bump), `content_classifier_engine/ContentClassifierEngine.h` (`SourceSite()` accessor), `netwerk/url-classifier/AsyncUrlChannelClassifier.cpp` (`ClassifyForCancel` no longer gated on `aPerformBlocking`) | **High** |
| `native/native-scriptlet-globals-fix.patch` (inject `const scriptletGlobals={}` preamble so uBO scriptlets execute in-page instead of throwing ReferenceError — the fix that makes YouTube/scriptlet blocking actually work) | shipped | `toolkit/actors/CosmeticFilterChild.sys.mjs` (`_injectScriptlets`: prepend `scriptletGlobals` preamble to injected script) | Medium |
| **M4** canvas/audio/WebGL farbling | planned | `dom/canvas/`, `dom/media/webaudio/`, WebGL sources, `nsRFPService.cpp` | **High** |
| **M6** binary stripping | planned | `assets/mozconfig.new`, target `moz.build` files | Medium |
