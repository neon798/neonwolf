# Neonwolf — No-Compromise Plan of Action

> **Status:** Approved. Refined via Ultraplan; implementation executing in Claude Code
> on the web (session `session_01Qvmyj53rMRrPac4eCCLyKe`) and landing as a pull request.

---

## Context — why this plan exists

Neonwolf set out (per `ROADMAP.md`) to be a browser that is **as effective as LibreWolf + uBlock Origin + CanvasBlocker with no extensions installed**, presenting a *convincingly common* fingerprint rather than a detectable "hardened" one. That is the original intent: native, no-extension privacy with a synthwave identity.

What actually shipped is real and builds (full `./mach build` succeeds, 91 MB Linux tarball packages, 49 patches apply clean, a genuine Rust-FFI → C++ → IDL → JSWindowActor cosmetic chain exists). **But every hard capability stops at its cheapest tier:**

| Pillar | Intended | Shipped | Evidence |
|---|---|---|---|
| Native ad/track blocking | uBO parity (>95% d3ward) | Phase 1 only: static domain-specific hide selectors. No MutationObserver, procedural filters, scriptlets, `$redirect`/`$csp`. Network ceiling ~55–61% d3ward, **never validated in a real GUI** | `patches/native-cosmetic-filtering.patch`, `docs/WIP-native-cosmetic-blocker.md:82` |
| Anti-fingerprinting | "Spoof a convincing profile" / farbling | RFP prefs + **two trivial patches** (a no-op marker, a one-line timezone constant). **Zero** canvas/audio/WebGL noise injection | `patches/rfp-pin-hardware-concurrency.patch`, `patches/rfp-spoof-timezone.patch`, `docs/spoofing-research.md` |
| Credential / surface removal | "Strip from the binary where possible" | DOM `.remove()` + a policy flag — code still compiled in | `patches/hide-passwordmgr.patch`, `assets/neonwolf.policies.json` |
| Shields per-site UI | Brave-style panel | **Dead stub** — `.xhtml/.css/.js` exist but are wired to nothing (no button, no actor) | `themes/browser/base/content/neonwolf-shields.*` |

**The root cause is governance, not the LibreWolf base.** LibreWolf is just patches + prefs — it never blocked a single native feature. The throttle is the self-imposed prime directive repeated across `README.md:31`, `CLAUDE.md:14-16`, and `scripts/neonwolf-patches.py:6-12`: *"keep everything identical to upstream LibreWolf except a minimal, marked delta, so version bumps stay a `git merge upstream` away."* That rule optimizes for cheap merges and quietly vetoes ambitious engine work. This plan removes that veto and treats the deferred native work as the product.

## Decisions locked (from review)

- **Stay a Firefox fork** on the Gecko engine. No new engine (correctly ruled out — a web-compatible engine is 100+ person-years).
- **Keep tracking LibreWolf upstream** for the hardening baseline (inherit their fixes for free) — but **delete the "minimal marked delta" prime directive**. Native features are now first-class and unbounded.
- **Build all four pillars:** uBO-parity blocking, farbling anti-fingerprint, Shields + picker + logger, binary-level stripping.
- **The synthwave theme/branding is a hard, non-negotiable keep** through every milestone.
- **Calibrated for solo + AI agents** — sequenced to ship measurable increments; effort flagged honestly, scope not trimmed.

---

## Part 1 — Governance & repo conventions (do first, cheap, unblocks everything)

1. **Rewrite the prime directive.** In `README.md`, `CLAUDE.md`, and the header of `scripts/neonwolf-patches.py`, replace "minimal marked delta / stay identical to upstream" with the new principle: *"Capability-first heavy fork. Inherit LibreWolf hardening; owned native features take priority over merge convenience. Delta size is not a constraint."* Update `ROADMAP.md` to mark it active, not aspirational.
2. **Namespace owned work.** Create `patches/native/` for Neonwolf feature patches (adblock Phase 2+, farbling, Shields, stripping), kept distinct from inherited LibreWolf/UI patches already in `patches/` and `patches/ui-patches/`. Add a `patches/native/MANIFEST.md` mapping each patch → the Firefox source files it touches → its rebase-fragility rating. `assets/patches.txt` keeps the load-bearing order; native patches append after `msix.patch` (where `native-cosmetic-filtering.patch` already sits).
3. **Rebase runbook.** Add `docs/REBASE.md`: the per-release procedure (bump `version`/`release`, `git merge` LW upstream, reapply `patches/native/*`, run the validation harness from Part 2). Accept that farbling and binary-stripping patches will need real per-release attention — that is the cost of the feature set, stated up front.

## Part 2 — Validation harness (do second; you cannot claim parity you can't measure)

The single biggest credibility gap is "never validated on d3ward in a real GUI." Build the measurement rig before chasing numbers:

- **Automated benchmark runner** (`scripts/validate/`): drive the built binary headfully via **Marionette/geckodriver** against `toolz.d3ward.org/tools/adblock/` (adblock score), plus `browserleaks.com` (canvas/audio/WebGL/fonts) and `coveryourtracks.eff.org` (fingerprint uniqueness). Emit a JSON scorecard per run.
- **Baseline now**, before any new feature, so every milestone reports a delta. Expected baseline: ~55–61% d3ward (network-only), RFP-uniform fingerprint.
- **Tests-enabled build path** for the in-tree mochitests already captured in `native-cosmetic-filtering.patch` (they can't run in the `--disable-tests` dist build today). Add a `make build-tests` target.
- This harness is the definition of "done" for every milestone below.

---

## STRATEGY UPDATE (2026-07): the engine is now uBO's actual code, run native

The adblock milestones below (M1/M2) were executed on the vendored
adblock-rust engine and shipped working generic/procedural cosmetics,
scriptlets and network blocking — but chasing uBO parity on a *different*
engine meant perpetually lagging it. Decision (user-locked): **adapt uBlock
Origin's own engine code to run as native browser code** — never as an
extension, which is a fingerprint vector. Branding: "powered by uBlock".

Progress:

- **uBO-M1 (DONE, E2E-verified):** uBO's `StaticNetFilteringEngine`
  (@gorhill/ubo-core) runs in parent-process privileged JS
  (`UBONetFilter.sys.mjs` + `UBOSnfe.sys.mjs` bundle, rebuilt via
  `scripts/vendor-ubo/build-snfe.sh`) and cancels matching channels from an
  `http-on-opening-request` observer. Lists come from the same RemoteSettings
  dump; compiled engine cached as a profile selfie; per-site Shields toggle and
  blocked counter wired. The adblock-rust network cancel is a dormant fallback
  (`privacy.trackingprotection.content.network_cancel.enabled=false`).
  The LibreWolf policy force-installing the uBO *extension* was removed from
  the policy merge — it had been silently double-blocking in every online GUI
  session. Patch: `patches/native/native-ubo-snfe.patch`.
- **uBO-M2 (DONE 2026-07-02):** uBO's real cosmetic engine
  (`cosmetic-filtering.js`) serves specific + generic (hash-surveyed) hide CSS
  and procedural filters through the `CosmeticFilter` actor
  (`UBOCosmeticFilter.sys.mjs` + `UBOCosmetic.sys.mjs` bundle); the
  adblock-rust cosmetic path remains the pref-gated fallback. uBO scriptlets
  are bundled but **held off** (`privacy.trackingprotection.ubo.scriptlet.enabled=false`)
  pending a document_start race fix — scriptlets still ride the adblock-rust
  path. Patch: `patches/native/native-ubo-cosmetic.patch`.
- **uBO-M3:** `$redirect` / `$csp` / domCollapser / dynamic filtering from the
  uBO engine; safe live list refresh; d3ward >95% GUI validation.
- **uBO-M4 (IN PROGRESS 2026-07-03):** Shields UI drives the native uBO engine
  directly ("powered by uBlock"): per-site master toggle (permission) wired to
  both engines; global category toggles mapped to the real enforcement prefs
  with a live network kill-switch; urlbar blocked-count badge + tooltip;
  Shields Logger page fed by the `neonwolf-blocked-request` observer topic.
  Remaining: GUI validation pass, patch-capture of the logger/panel deltas.
- **uBO-M5:** retire the adblock-rust engine (keep dormant as fallback).

The original M1–M3 below are complete on the old engine and remain the
integration substrate (channel hook, actor injection, RemoteSettings lists,
Shields panel). M4–M6 (farbling, picker, stripping) are unaffected.

---

## Milestones (dependency-ordered for solo + AI)

### M1 — Adblock Phase 2: generic cosmetic + procedural filters
*Biggest single jump in d3ward; most sites use generic, not domain-specific, rules.*

- **Rust FFI** (extend the crate patched in `native-cosmetic-filtering.patch`): add `content_classifier_engine_hidden_class_id_selectors()` (wraps `engine.hidden_class_id_selectors(...)`) and a fuller `url_cosmetic_resources()` accessor returning the procedural chains, not just `hide_selectors`.
- **C++/IDL**: extend `ContentClassifierService.cpp` + `nsIContentClassifierService.idl` with `getGenericSelectors()` and `getProceduralFilters()` (bump interface UUID, as the existing patch already does).
- **JSActor** (`toolkit/actors/CosmeticFilterChild.sys.mjs`): add a **domSurveyor-style MutationObserver** watching `class`/`id` attribute + `childList`/`subtree` changes; hash observed tokens against the generic set; re-inject the agent sheet on new matches (adaptive batching per `docs/native-adblocker-research.md:60-64`).
- **Procedural executor in JS** (same actor): evaluate `:has-text()`, `:has()`, `:upward()`, `:xpath()` (`document.evaluate`), `:min-text-length()`, `:matches-css()`, `:if()/:if-not()`.
- **Done when:** d3ward cosmetic checks flip true; score jumps materially from the network-only baseline.

### M2 — Adblock Phase 3/4: scriptlets, `$redirect`, `$csp` (reach uBO parity)
*This is what makes uBO actually removable.*

- **Vendor a resource bundle**: uBO's ~60 scriptlets + ~30 neutered redirect resources as a JSON blob in-tree, loaded via `include_str!()` into a Rust `ResourceStorage`; wire `engine.use_resources()` (new FFI). (`docs/native-adblocker-research.md:270-289`.)
- **Scriptlet injection**: expose `url_cosmetic_resources().injected_script`; inject in the **MAIN world at `DOMDocElementInserted`** via the JSWindowActor (before page scripts), per Decision 3 in the research doc.
- **`$redirect`**: intercept blocked channels at the nsIChannel level and serve the bundled neutered resource instead of a hard block.
- **`$csp`**: wire `engine.get_csp_directives()` → inject via `nsIHttpChannel.setResponseHeader()`.
- **domCollapser**: hide leftover placeholders (iframe/img/script) for blocked network resources.
- **Live list updates**: today lists are dump-only (`rs-blocker.patch` + `gen-adblock-dump.py`) because network sync would *delete* the bundled dump. Add a safe periodic refresh that updates without tripping the sync-delete hazard (keep dump as offline fallback).
- **Done when:** **>95% d3ward in a real GUI**, validated by the Part 2 harness — the headline goal.

### M3 — Shields panel + logger (give the engine a face and an audit trail)
*The dead `neonwolf-shields.*` stub becomes a real per-site control surface.*

- **Wire the stub**: register a toolbar + address-bar button and panel; back it with an **origin-keyed `neonwolf.shields.*` pref store**; hook into `gProtectionsHandler` / `browser/components/controlcenter/` (`docs/native-adblocker-research.md:213-235, 300-330`).
- **Per-site toggles that actually drive the engine**: ads/trackers on·off, scripts, fingerprinting (block·farble·allow — the `farble` state lands in M4), cookies, HTTPS-upgrade. Blocked-count badge aggregated from `nsIContentBlockingLog`.
- **Logger** (`chrome://neonwolf/content/logger.xhtml`): subclass `nsIWebProgressListener`, virtualized list, filter/search, reverse-lookup (which list/rule blocked this).
- Style strictly within the existing synthwave tokens (`--neonwolf-*`, palette in `CLAUDE.md:206`).

### M4 — Convincing anti-fingerprint farbling (the hardest engine work)
*Move past RFP uniformity — which the project's own `spoofing-research.md` admits "stands out" — to Brave-style per-site noise.*

- **Per-eTLD+1 deterministic noise**: a seed manager keyed on `eTLD+1 + session`. Patch Gecko read paths to perturb outputs reproducibly within a site:
  - **Canvas**: `dom/canvas/` — perturb `toDataURL` / `getImageData` readback.
  - **AudioContext**: `dom/media/webaudio/` — perturb channel data.
  - **WebGL**: `readPixels` noise + parameter/renderer string handling.
- **Integrate with Shields**: the per-site fingerprinting toggle selects block / farble / allow, reading the M3 pref store.
- Keep RFP value spoofs (UA, platform, hw concurrency, timezone) but make them coherent with the farble layer; supersede the two placeholder `rfp-*.patch` files with real implementations.
- **Highest rebase fragility** — these touch hot, frequently-refactored Gecko code. Mark accordingly in `patches/native/MANIFEST.md`; lean on `replace_or_die`-style fail-loud anchors so a bad rebase fails CI instead of silently shipping.
- **Done when:** browserleaks shows site-varying canvas/audio/WebGL hashes; coveryourtracks reports no obvious "this is a privacy browser" tell.

### M5 — Element picker + custom filters (complete the uBO replacement)
- **Element picker**: privileged browser chrome with an SVG highlight overlay, candidate filter generation (network URL + cosmetic selector), specificity/depth controls; write to user filter storage and rebuild the engine.
- **Custom filters page** (`chrome://neonwolf/content/shields-filters.xhtml`): editable rules, validation, rebuild-on-save.

### M6 — Binary-level stripping (attack-surface reduction; sequenced last because it's destructive)
*Convert "hidden + policy" into actually-not-compiled. Risky for build stability — do once features are stable.*

- **Low-risk first** (extend existing telemetry removals `remove-pingsender.patch`, `disable-data-reporting-at-compile-time.patch`): compile out remaining telemetry/data-reporting, Pocket, and `remove-openai`-adjacent components via `mozconfig`/`moz.build` conditionals in `assets/mozconfig.new`.
- **Higher-risk**: remove the password-manager (`signon`) and `formautofill` components at build time — replacing today's `hide-passwordmgr.patch` + `neonwolf-hide-passwords-redesign.patch` DOM-hiding with real component exclusion. Each removal gated behind a clean `./mach build` + smoke run.
- Keep the existing "recommended password managers" pref-pane section as the replacement UX.
- Document every disabled component in `docs/binary-surface.md` (what, how disabled, breakage risk).

---

## Critical files (where the work lands)

- **Orchestrator / wiring**: `scripts/neonwolf-patches.py`, `assets/patches.txt`
- **Adblock engine**: `patches/native-cosmetic-filtering.patch` (extend), the vendored `content_classifier_engine` Rust crate (FFI), `ContentClassifierService.cpp`, `nsIContentClassifierService.idl`, `toolkit/actors/CosmeticFilter{Child,Parent}.sys.mjs`
- **List distribution**: `scripts/gen-adblock-dump.py`, `patches/rs-blocker.patch`, `assets/adblock/*`
- **Shields/UI**: `themes/browser/base/content/neonwolf-shields.{xhtml,css,js}`, `browser/components/controlcenter/`, new `chrome://neonwolf/content/*`
- **Farbling/RFP**: `toolkit/components/resistfingerprinting/nsRFPService.cpp`, `dom/canvas/`, `dom/media/webaudio/`, WebGL sources; supersedes `patches/rfp-*.patch`
- **Stripping**: `assets/mozconfig.new`, target `moz.build` files, `assets/neonwolf.overrides.cfg`, `assets/neonwolf.policies.json`
- **Reference (already written, reuse heavily)**: `docs/native-adblocker-research.md` (the engine design), `docs/spoofing-research.md`, `docs/WIP-native-cosmetic-blocker.md`

## Verification (per milestone, via the Part 2 harness)

1. `make dir && make check-patchfail` — all patches (incl. `patches/native/*`) apply clean.
2. `make build` (or `make build-tests`) — compiles; run mochitests for the cosmetic/scriptlet/farbling chains in a tests-enabled build.
3. Launch the dist binary with a fresh profile (`LANG=en_US.UTF-8 MOZ_ENABLE_WAYLAND=1 … --no-remote --profile /tmp/nw-profile`) and run the automated scorecard:
   - **d3ward** adblock score (M1/M2 target: >95%)
   - **browserleaks** + **coveryourtracks** (M4 target: site-varying hashes, no privacy-browser tell)
   - Shields per-site toggles change behavior live; logger records blocks (M3)
   - Stripped components absent from `about:buildconfig` / fail to instantiate (M6)
4. **Theme regression check every milestone**: synthwave chrome, glowing new-tab, search-bar halo eyeballed in a real GUI (no automated coverage — `CLAUDE.md:230`).

## Risks & honest effort (solo + AI)

- **M2 (parity) and M4 (farbling) are each multi-month.** Farbling touches the most volatile Gecko internals and carries the highest per-release rebase tax — this is the real price of leaving "minimal delta" behind, and it's accepted deliberately.
- **Rebase burden grows** with every native patch. The `patches/native/` namespace + fail-loud anchors + the rebase runbook are what keep it tractable; budget real time each FF/LW release.
- **M6 can destabilize the build.** Gate every removal behind a clean compile + smoke run; never batch removals.
- **Sequencing rationale**: M1→M2 first (largest measurable win, makes uBO removable), then M3 (control/observe the engine), then M4 (hardest, now has a UI to hang per-site control on), M5 (finishes uBO replacement), M6 last (destructive, wants a stable tree).
