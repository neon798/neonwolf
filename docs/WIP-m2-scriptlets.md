# M2 — native scriptlets + `$redirect` + `$csp` (uBO parity)

Goal: close the `script_ads`/`script_pagead` d3ward gap (the last 2/133) by adding
native `##+js()` scriptlet injection, `$redirect`, and `$csp` on the
content-classifier (`adblock 0.12.1`) engine. Verified against the 0.12.1 source.

## Engine API (all present in adblock 0.12.1 — no crate patch)
- `Engine::use_resources(impl IntoIterator<Item=Resource>)` (engine.rs:205) — load
  scriptlet + redirect bundle into `InMemoryResourceStorage`.
- `UrlSpecificResources.injected_script: String` (cosmetic_filter_cache.rs:45) —
  assembled scriptlet JS for a URL; populated by `get_scriptlet_resources()` once
  resources are loaded. **Currently the FFI ignores this field.**
- `BlockerResult.redirect: Option<String>` (blocker.rs:44) — a `data:<mime>;base64,…`
  URL for a `$redirect` match. **Current network FFI doesn't return it.**
- `Engine::get_csp_directives(&Request) -> Option<String>` (engine.rs:165).
- `Resource { name, aliases, kind, content(base64), dependencies, permission }`
  (resources/mod.rs:131).

## THE external dependency (the one offline blocker)
adblock 0.12.1 ships **no** scriptlet/redirect content. uBO publishes it at
`github.com/gorhill/uBlock/src/resources/` (`scriptlets.js`, `redirect-resources.js`).
adblock-rust ingests these via `adblock::resources::resource_assembler`
(`assemble_scriptlet_resources` + `assemble_redirect_resources`). This **must be
fetched once over the network** — it cannot be produced in the offline build env.
Plan: `scripts/fetch-ubo-resources.py` vendors them into
`assets/ubo-resources.json` (committed); `gen` step bundles into the tree; Rust
loads via `include_str!()` at engine build. Until fetched, a tiny **synthetic**
bundle (1–2 scriptlets) validates the injection mechanism offline.

## Implementation (by file, extends M1 patterns)
1. **Rust FFI** (`content_classifier_engine/src/lib.rs`):
   - `…_engine_use_resources(engine, json: &nsACString)` — parse the bundle JSON →
     `Vec<Resource>` → `engine.use_resources(...)`.
   - `…_engine_injected_script(engine, url, out: &mut nsCString)` — return
     `url_cosmetic_resources(url).injected_script`.
   - extend the network-check FFI to also return `BlockerResult.redirect`.
   - `…_engine_csp_directives(engine, url, &mut nsCString)`.
2. **C++ service + IDL**: `getInjectedScript(url)`, `getCspDirectives(url)`, and
   redirect surfaced from the classify path. Load the bundle into every engine at
   `InitFromRules`/`use_resources` time. Bump IDL uuid.
3. **Scriptlet injection** (`CosmeticFilterChild.sys.mjs`): in `_onDocElementInserted`,
   `sendQuery("GetInjectedScript",{url})`; if non-empty, inject MAIN-world at
   document_start via a `<script>` element appended to `document.documentElement`
   then removed (simplest, correct timing; precedent: userscript managers). No
   sandbox needed.
4. **`$redirect`** (`ContentClassifierService.cpp` CancelChannel path ~495): when the
   matched result carries a redirect data-URL, instead of `CancelByURLClassifier`,
   redirect the channel to the bundled `data:` resource (`nsIChannel`/data channel).
5. **`$csp`** (`ContentClassifierService.cpp` ~480, response-header phase): when
   `getCspDirectives` is non-empty, `nsIHttpChannel.setResponseHeader(
   "Content-Security-Policy", value, merge=true)` after headers received.
6. **Bundle wiring**: `scripts/fetch-ubo-resources.py` (network) →
   `assets/ubo-resources.json`; bundle copied into the tree + loaded via the
   use_resources FFI at startup, alongside the list dump.

## Validation
- Offline: CSP directives via test-injection; scriptlet injection mechanism via a
  synthetic 1-scriptlet bundle (assert the injected global/effect appears in a
  loopback page). `$redirect` via a synthetic redirect resource.
- Networked (user): run `fetch-ubo-resources.py`, rebuild, d3ward → target
  `script_ads:true`, `script_pagead:true`, 133/133.

## Status (M2 scriptlet round 1)
- **Code: done + compiles.** FFI (`use_resources`, `injected_script`), service
  `getInjectedScript`, IDL, graceful bundle loading, MAIN-world script-element
  injection. Full `./mach build` exit 0; **no M1 regression** (M1 engine test
  still passes on this build).
- **Bug fixed:** bundle read path was `<GreD>/defaults/settings/` but the packaged
  file lands at `<GreD>/browser/defaults/settings/` (app-specific defaults, same
  as the lists dump). Now prepends `browser`.
- **Synthetic offline validation: INCONCLUSIVE.** With a 1-scriptlet synthetic
  `ubo-resources.json` + a `##+js(nw-test)` rule, `getInjectedScript` returned
  empty and MOZ_LOG showed no `UseResources`/bundle line firing on the
  test-injection rebuild path. Needs one more debug pass (confirm
  `ApplyResourceBundle` runs on the test `applyFilterLists()` path and that
  `serde_json` parses the bundle) OR validate directly with the real uBO bundle.
- **Not yet captured as a patch** (lives in the tree); `$redirect`/`$csp` and the
  vendoring script are still pending.

### Remaining M2 work
1. Root-cause the empty `injected_script` (bundle-apply on the test path, or just
   validate with the real bundle on a networked machine).
2. `scripts/fetch-ubo-resources.py` (network) → `assets/ubo-resources.json`;
   durable packaging via `gen`/`neonwolf-patches.py` (mirror the lists dump,
   targeting `browser/defaults/settings/`).
3. `$redirect` (channel→data: resource) + `$csp` (`setResponseHeader`).
4. Capture all M2 changes as `patches/native/*` + wire into `assets/patches.txt`.
5. Networked d3ward → `script_ads`/`script_pagead` true, target 133/133.
