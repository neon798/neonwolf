# Native Ad Blocker: uBO Parity via Brave-Style Shields

## Goal

Match uBlock Origin's filtering capabilities natively inside Firefox, paired with a
Brave-style per-site Shields UI. Eliminate the extension fingerprint (uBO is a
well-known, detectable extension ID) while maintaining or exceeding uBO's blocking
quality.

---

## 1. uBlock Origin Architecture — What We Need to Match

uBO runs as a WebExtension with five interdependent engines:

### 1.1 Static Network Filtering Engine (SNFE)

**What it does:** Blocks/allows/redirects network requests based on adblock filter
syntax (`||example.com^`, `@@`, `$script`, `$third-party`, etc.)

**How it works:**
- Tokenizes every filter's alphanumeric substrings into hash tokens
- Clusters rules by their rarest token — minimizes per-request candidate count
- Uses `BidiTrie` for bidirectional substring search, `HNTrie` for hostname suffix matching
- Realm system: 20-bit integer encodes block/allow/important, party constraint, resource type, modifier type
- Evaluates in order: exact hostname → `from=`/`to=` domains → token list match → trie match → regex

**Modifiers supported:** `$redirect`, `$csp`, `$removeparam`, `$replace`, `$urlskip`,
`$permissions`, `$uritransform`, `$header`, `$badfilter`, `$important`, `$all`,
`$popup`, `$doc`, `$frame`

**WebExtension APIs used:** `webRequest.onBeforeRequest`, `webRequest.onHeadersReceived`

**Native equivalent:** ✅ Firefox's content-classifier (`adblock-rust` engine) already
does URL-level network blocking via `check_network_request_preparsed()`. This is the
one part that's already wired up and working. Gaps below cover what's missing.

### 1.2 Cosmetic Filtering Engine

**What it does:** Hides DOM elements via CSS selectors. Two categories:

| Type | Syntax | Scope |
|---|---|---|
| Specific | `example.com##.ad-banner` | Only on matching hostname |
| Generic | `##.ad-banner` | All sites |
| Exception | `example.com#@#.ad-banner` | Re-enables on specific site |

Plus **procedural filters** that extend CSS with JS-evaluated operators:

| Operator | Function |
|---|---|
| `:has(selector)` | Elements containing matching children |
| `:has-text(text)` | Elements containing specific text |
| `:xpath(expr)` | XPath expression matching |
| `:upward(n)` / `:upward(selector)` | Walk up n ancestors or until selector match |
| `:min-text-length(n)` | Elements with at least n characters of text |
| `:if(selector)` / `:if-not(selector)` | Conditional: apply only if self matches |
| `:matches-css(prop)` / `:matches-css-before/after` | Match computed style |

**DOM observer strategy (critical for completeness):**
- **Primary `MutationObserver`**: `childList` + `subtree` — watches structural changes. Adaptive batching: 1ms delay for <100 node lists, immediate `requestAnimationFrame` for larger batches. SafeAnimationFrame debouncing prevents perf degradation.
- **`domSurveyor`** (separate observer): Watches `class` and `id` attribute changes (not covered by the structural observer). Hashes class/id values and checks against registered generic cosmetic hashes.
- **`domCollapser`**: When a network resource is blocked, hides the placeholder element (iframe, img, script) that remains in the DOM.
- **Listener pattern**: Components register for `onDOMCreated()` / `onDOMChanged()` callbacks.

**Native gap:**
- ❌ `url_cosmetic_resources()` never called — returns per-domain cosmetic rules but no injection pipeline exists
- ❌ `hidden_class_id_selectors()` never called — returns generic class/id tokens for `domSurveyor`-style matching
- ❌ No procedural filter execution engine in C++/JS

### 1.3 Scriptlet Injection Engine

**What it does:** Injects JavaScript into pages before page scripts execute.
Syntax: `example.com##+js(scriptlet-name, arg1, arg2)`

Scriptlets intercept/trap browser APIs to disable anti-adblock mechanisms:
- `abort-on-property-read` / `abort-on-property-write`
- `prevent-fetch`, `prevent-xhr`, `prevent-window-open`
- `nowoow` (disable WebRTC), `noeval` (disable eval)
- `set-constant`, `set-local-storage-item`
- `json-prune`, `xml-prune`, `inject-css-in-shadow-dom`
- ~60+ scriptlets in uBO's library

**Injection model:** Two worlds:
1. **MAIN world** — runs in page's JS context, can modify page globals
2. **ISOLATED world** — runs in content script context, cannot access page globals

**Native gap:**
- ❌ `use_resources()` never called — no `ResourceStorage` wired to the engine
- ❌ No scriptlet resource bundle loaded
- ❌ No injection mechanism (frame scripts, sandbox, or content policy)

### 1.4 HTML Filtering

**What it does:** Filters HTML response bodies before rendering. Syntax: `example.com##^selector`
Supports procedural selectors on the raw HTML. **Firefox-only** (uses `webRequest.filterResponseData`).

**Native gap:** ❌ No body-filtering pipeline in content-classifier. Would need stream interception.

### 1.5 Response Header Filtering

**What it does:** Removes/modifies HTTP response headers. Syntax: `##^responseheader(name)`

**Native gap:** ❌ Not wired up. `adblock-rust` doesn't natively support this (uBO handles it separately).

### 1.6 Element Picker & Zapper

**What it does:** Interactive tools for creating blocking rules by clicking on page elements.
- SVG overlay for highlighting without DOM modification
- `diff_match_patch` for generating wildcard URL filters
- Specificity slider (broad `div` → specific `body > div#ad > ...`)
- Depth control for ancestor inclusion
- Preview → Create workflow with CodeMirror editor

**Native gap:** ❌ No picker/zapper exists. Would need DevTools integration or privileged browser chrome.

### 1.7 Logger UI

**What it does:** Comprehensive diagnostic tool showing every blocked/allowed request.
- Virtualized viewport with row recycling
- Filtering by: blocked, allowed, third-party, request type, search regex
- Reverse lookup: which filter list does this rule come from?
- Net filtering dialog: shows matching filter + list source, create dynamic rules
- Cosmetic filtering dialog: preview/apply/exception creation

**Native gap:** ❌ No logger exists. Firefox has `nsIContentBlockingLog` that could feed one.

---

## 2. uBO Feature Gap Matrix

| Feature | uBO Support | `adblock-rust` Crate | FF CCS Wired? | Neonwolf Phase 1 |
|---|---|---|---|---|
| URL-level network blocking | ✅ | ✅ | ✅ | ✅ DONE |
| `$redirect` / `$redirect-rule` | ✅ | ✅ (`use_resources()`) | ❌ | ❌ |
| `$csp` injection | ✅ | ✅ (`get_csp_directives()`) | ❌ | ❌ |
| `$removeparam` | ✅ | ❌ (uBO-specific) | ❌ | ❌ |
| `$replace` | ✅ | ❌ (uBO-specific) | ❌ | ❌ |
| Domain-specific cosmetic (`##`) | ✅ | ✅ (`url_cosmetic_resources()`) | ❌ | ✅ DONE |
| Generic cosmetic (class/id) | ✅ | ✅ (`hidden_class_id_selectors()`) | ❌ | ❌ Phase 2 |
| Procedural cosmetics (`:has`, `:has-text`, etc.) | ✅ | ✅ (parsed but needs JS executor) | ❌ | ❌ Phase 2 |
| Scriptlet injection (`##+js()`) | ✅ | ✅ (parsed, needs resources + injector) | ❌ | ❌ Phase 3 |
| HTML filtering (`##^`) | ✅ (FF-only) | ❌ (not in adblock-rust) | ❌ | ❌ |
| Response header filtering | ✅ (extensions API) | ❌ (not in adblock-rust) | ❌ | ❌ |
| Dynamic URL filtering (user rules) | ✅ | N/A (UI feature) | ❌ | ❌ Phase 4 |
| Per-site toggle UI | ✅ | N/A (UI feature) | ❌ | ❌ Phase 4 |
| Element picker/zapper | ✅ | N/A (UI feature) | ❌ | ❌ Phase 4 |
| Logger UI | ✅ | N/A (UI feature) | ❌ | ❌ |
| Filter list auto-update | ✅ | N/A | ✅ (RemoteSettings) | ✅ DONE |
| CNAME uncloaking | ✅ (FF DNS API) | ❌ | ❌ | ❌ |

### Impact assessment

- **$redirect and scriptlet injection** are tightly coupled — both need `use_resources()` + a resource bundle (uBO's scriptlet library + neutered redirect resources). uBO ships ~60 scriptlets and ~30 redirect resources.
- **$removeparam and $replace** are uBO-specific extensions to the adblock syntax not present in `adblock-rust`. These would either need patches to the crate or a separate Rust → JS pipeline.
- **Procedural cosmetics** require a JS execution engine for the procedural operators. The crate parses them, but someone has to evaluate `:has-text()`, `:xpath()`, `:upward()`, etc. in the page context.
- **Element picker and logger** are pure UI work — significant effort but no engine changes needed beyond exposing the right counters/APIs.

---

## 3. Brave Shields Architecture — What to Emulate

Brave's Shields is a **native** (not extension-based) protection panel with per-site
controls. The architecture has three layers:

### 3.1 Engine Layer: `adblock-rust` + Chromium Network Stack

- Same `adblock-rust` crate Firefox now vendors (v0.12.1 in FF152)
- Integrated at the `URLRequest` level — deeper than `webRequest`, no extension API
- FlatBuffers serialization: 75% memory reduction, zero-copy deserialization
- Tokenization + clustering algorithm (like uBO's SNFE, but in Rust)
- Performance: 4.6µs average per request (69x improvement over original C++)

Brave does **not** rely on `webRequest` — their Rust engine is called directly
from `URLRequestHttpJob`. This is what Firefox's content-classifier also does
(at the nsIChannel level), so Neonwolf is already on the same architectural path.

### 3.2 Distribution Layer: Component Updater

Brave uses Chromium's Component Extension system:
- `iodkpdag...` — Default adblock lists (EasyList, EasyPrivacy, uBO filters, etc.)
- `gkboaolp...` — List catalog (regional lists, language-specific)
- `mfddibmbl...` — Resources library (scriptlets + redirect resources)

Updates every 5 hours. Users can force-update at `brave://components/`.

**Neonwolf equivalent:** Already handled — RemoteSettings `content-classifier-lists`
dump + `gen-adblock-dump.py` bundles 8 lists at build time. For live updates, the
RemoteSettings sync path would kick in if the collection is allowed (currently
blocked — see `rs-blocker.patch` comments).

### 3.3 UI Layer: Shields Panel

Per-site toggle panel accessed via lion icon in address bar:

| Component | Description | Per-site |
|---|---|---|
| **Ad & tracker blocking** | Master toggle + aggressive mode | ✅ |
| **HTTPS upgrades** | Upgrade HTTP→HTTPS, strict mode shows interstitial | ✅ |
| **Block scripts** | Disable JavaScript | ✅ |
| **Block fingerprinting** | Toggle farbling + per-API toggles in advanced view | ✅ |
| **Block cookies** | Third-party cookie blocking levels | ✅ |
| **Forget me on close** | Clear site storage when last tab closes | ✅ |

**Architecture:**
- WebUI panel (not extension popup): C++ WebUI controller + React frontend
- Per-site preferences stored in custom `brave_shields` backend, keyed by origin/eTLD+1
- Advanced view: individual API-level fingerprinting toggles (canvas, WebGL, audio, etc.)
- Reported blocked counts in badge and panel header

---

## 4. Firefox's Protections Panel — The Foundation We Build On

Firefox already has a rich protections panel framework we can extend:

```
browser/components/controlcenter/content/protectionsPanel.inc.xhtml
    ├── ETP per-site toggle (protections-popup-tp-switch)
    ├── Category breakdown: trackers, social, cookies, cryptominers, fingerprinters
    ├── Blocked counts per category
    ├── "Protection Settings" link → about:preferences#privacy
    └── "Protections Dashboard" link → about:protections
```

**Key APIs we can hook into:**

| API | Purpose |
|---|---|
| `gProtectionsHandler` (`browser-siteProtection.js`) | Main JS controller for the panel |
| `nsIContentBlockingLog` | Per-channel blocking log → blocking statistics |
| `nsIWebProgressListener` | `STATE_BLOCKED_*` notifications when channels are blocked |
| `Services.prefs` | Pref management per-origin |
| `gBrowser.selectedBrowser.messageManager` | Inject scripts into page context |
| `devtools/inspector` API | Element inspection for picker/zapper |

---

## 5. Implementation Roadmap — Reaching uBO Parity

### Phase 1 — Cosmetic Hide Selectors ✅ DONE

Domain-specific CSS hiding via `url_cosmetic_resources().hide_selectors`.
- FFI: `content_classifier_engine_cosmetic_hide_selectors()`
- Service: `ContentClassifierService::GetCosmeticHideSelectors()`
- IDL: `nsIContentClassifierService.getCosmeticHideSelectors()`
- JSActor: `CosmeticFilter{Child,Parent}.sys.mjs`
- Injection: `loadSheetUsingURIString(..., AGENT_SHEAP)` with `display:none!important`

### Phase 2 — Generic Cosmetic + Procedural ✅ NEXT

**Required engine work:**
1. Call `hidden_class_id_selectors()` via new FFI to get generic class/id token list
2. Implement `domSurveyor`-style MutationObserver in the CosmeticFilterChild actor
   that watches `class` and `id` attribute changes
3. Hash observed class/id values and check against registered generic tokens
4. Re-inject CSS sheet when new selectors are discovered

**Required for procedural filters:**
1. Call `url_cosmetic_resources()` fully (not just `hide_selectors`), getting the
   full `CosmeticResources` struct including procedural filter chains
2. Implement a procedural filter executor in JS that can evaluate:
   - `:has-text()` — text content matching
   - `:has()` — child selector matching
   - `:upward()` — ancestor walking
   - `:xpath()` — XPath evaluation (use `document.evaluate`)
   - `:min-text-length()`, `:matches-css()`, `:if()`, `:if-not()`
3. Inject procedural-executed `<style>` blocks alongside static CSS

### Phase 3 — Scriptlet Injection

**Required engine work:**
1. Build or vendor a resource bundle (uBO's `resources/scriptlets.js` +
   `redirect-resources.js`). This is ~60 scriptlets + ~30 redirect resources.
2. Wire up `engine.use_resources()` in the FFI layer — needs a `ResourceStorage`
   backend in Rust that can be populated from a JSON bundle
3. Wire up `engine.url_cosmetic_resources().injected_script` — returns assembled
   scriptlet JS for the given URL
4. Implement injection mechanism:
   - Option A: Firefox frame scripts (`messageManager.loadFrameScript`)
   - Option B: `nsIContentPolicy` with `shouldLoad` hook
   - Option C: `DocumentLoadListener` interception
5. Handle `$redirect` rules — when a network filter matches with `$redirect=`,
   serve a bundled local resource (neutered JS, 1x1 pixel, etc.)

**Resource bundle approach:**
Bundle uBO's scriptlet library as a JSON file in the Firefox source tree. At
startup, load it via `include_str!()` in Rust and populate the engine's
`ResourceStorage`. This keeps the engine self-contained — no network dependency.

### Phase 4 — $redirect + $csp

**Required engine work:**
1. `$redirect`: After Phase 3's `use_resources()` is wired, `$redirect` rules will
   be parsed by the engine. Need to intercept blocked channels and serve redirect
   resources instead of just blocking.
2. `$csp`: Wire `engine.get_csp_directives()` to inject CSP headers into HTTP
   responses via `nsIHttpChannel.setResponseHeader()` or equivalent.

### Phase 5 — Shields Panel UI

**Extend the protections panel:**

```
protectionsPanel.inc.xhtml (existing)
├── ETP Toggle (existing)
├── [NEW] Shields section:
│   ├── "Shields Up/Down" master toggle (per-site)
│   ├── Blocked ads counter: N
│   ├── Hidden elements counter: N
│   ├── Blocked scripts counter: N
│   ├── Granular toggles:
│   │   ├── Block ads & trackers [on/off]
│   │   ├── Block scripts [on/off]
│   │   ├── Block fingerprinting [on/off/aggressive]
│   │   ├── Block cookies [cross-site/all/off]
│   │   └── Upgrade to HTTPS [on/off/strict]
│   └── Advanced view:
│       ├── Canvas fingerprinting [block/farble/allow]
│       ├── WebGL fingerprinting [block/farble/allow]
│       ├── Audio fingerprinting [block/farble/allow]
│       └── Font fingerprinting [limit/allow]
```

**UI implementation:**
- Modify `browser/components/controlcenter/content/protectionsPanel.inc.xhtml`
- Add new panel view or extend existing multiView
- Hook into `gProtectionsHandler` for panel lifecycle
- Store per-site prefs in a custom origin-keyed `neonwolf.shields.*` pref space
- Badge counter: aggregate blocked counts from `nsIContentBlockingLog`

### Phase 6 — Element Picker, Logger, Custom Filters

**Element picker:**
- Extend Firefox DevTools inspector or build as privileged browser chrome
- SVG overlay for element highlighting
- Filter candidate generation (network URL filters + cosmetic selectors)
- Specificity slider and depth control
- Write created filters to user filter storage
- Rebuild engines with user filters included

**Logger:**
- New browser page: `chrome://neonwolf/content/logger.xhtml`
- Subclass `nsIWebProgressListener` to capture all channel events
- Virtualized list view with filtering/search
- Reverse lookup: which filter list does this rule come from?
- Drill-down: net filter details, cosmetic filter details, dynamic rule creation

**Custom filters:**
- `chrome://neonwolf/content/shields-filters.xhtml` (settings page)
- Textarea for custom rules
- Syntax highlighting and validation
- Rebuild engine on save

---

## 6. What This Replaces (Extension Removal)

Once Phases 1-4 are complete with >95% d3ward pass:

| uBO Function | Native Equivalent | Status |
|---|---|---|
| Network blocking | content-classifier (`adblock-rust`) | ✅ Phase 1 |
| Cosmetic CSS hiding | CosmeticFilter JSActor | ✅ Phase 1 |
| Generic cosmetic | `domSurveyor` MutationObserver | 🔜 Phase 2 |
| Procedural cosmetics | JS executor in CosmeticFilterChild | 🔜 Phase 2 |
| Scriptlet injection | Frame scripts + ResourceStorage | 🔜 Phase 3 |
| $redirect | Channel interception + bundled resources | 🔜 Phase 4 |
| $csp | `get_csp_directives()` FFI | 🔜 Phase 4 |
| Per-site toggle | Shields panel | 🔜 Phase 5 |
| Element picker | DevTools integration | 🔜 Phase 6 |
| Logger | Native logger page | 🔜 Phase 6 |
| Custom filters | Settings page | 🔜 Phase 6 |
| Filter list updates | RemoteSettings sync | ✅ Done |
| **$removeparam, $replace, HTML filtering** | **Not in adblock-rust crate** | ❌ Future |

---

## 7. Key Architectural Decisions

### Decision 1: Stay with `adblock-rust` (don't port uBO's JS engine)

**Pro:** Already vendored in Firefox, maintained by Brave, C++ FFI already built.
uBO's JS engine would need a complete port to Rust or C++.

**Con:** Missing features (`$removeparam`, `$replace`) that uBO supports but
`adblock-rust` doesn't. These are edge-case features that affect <1% of filter
rules and can be deferred.

**Decision:** Stay with `adblock-rust`. Missing features can be PR'd upstream.

### Decision 2: JS executor for procedural cosmetics (not native C++)

**Pro:** uBO's procedural filter executor is already battle-tested JS. Porting
`:has-text()`, `:xpath()`, `:upward()` to C++ is a massive undertaking.
Evaluating in the content process avoids IPC overhead.

**Con:** JS execution in the page context has a tiny CPU cost per page load.
(It's what uBO already does.)

**Decision:** Implement procedural cosmetics as JS in the CosmeticFilterChild actor.

### Decision 3: Frame scripts for scriptlet injection (not content policy)

**Pro:** Frame scripts match uBO's approach — inject at `document_start` before
page scripts run. Firefox already supports this via `messageManager.loadFrameScript()`.

**Con:** Frame scripts are technically deprecated in favor of JSWindowActors.
But JSWindowActors don't support `document_start` injection timing as precisely.

**Decision:** Use JSWindowActors with `allFrames: true` + `matches` for docShell
filtering. Inject via `specialPowers` or `evalInSandbox` at `DOMDocElementInserted`.

### Decision 4: Bundle scriptlet resources (don't fetch dynamically)

**Pro:** Works offline, no network dependency, verifiable at build time, smaller
attack surface.

**Con:** Scriptlets don't auto-update with filter lists. Would need manual updates
when uBO adds new scriptlets.

**Decision:** Bundle scriptlets in the source tree, update when filter lists are
refreshed (semiannually or with Firefox releases).

---

## 8. Scriptlet Resource Inventory

### Critical scriptlets (high impact, high filter-list usage):

| Scriptlet | Purpose |
|---|---|
| `abort-on-property-read` | Prevents anti-adblock detection via property access probes |
| `abort-on-property-write` | Prevents anti-adblock scripts from setting globals |
| `abort-current-inline-script` | Stops inline scripts that detect adblock |
| `prevent-fetch` | Blocks `fetch()` calls to ad/tracker endpoints |
| `prevent-xhr` | Blocks `XMLHttpRequest` to ad/tracker endpoints |
| `nowoow` | Disables WebRTC-based tracking |
| `set-constant` | Sets JS globals/properties to values that disarm detection |
| `json-prune` | Removes ad-related keys from JSON API responses |
| `set-local-storage-item` | Plants fake values to disarm detection scripts |
| `noeval` | Disables `eval()` |
| `no-floc` | Disables Google FLoC |
| `prevent-window-open` | Stops popup windows |

### Redirect resources (neutered replacements):

| Resource | Replaces |
|---|---|
| `noop.js`, `noop.txt`, `noop.html` | Empty/no-op resources |
| `1x1.gif`, `1x1.png`, `2x2.png` | Blocked image placeholders |
| `32x32.png`, `32x32-transparent.png` | Blocked favicon/icon placeholders |
| `click2load.html` | Video player placeholder |
| `google-analytics.js` (neutered) | GA stubs that don't track |
| `googletagmanager.com/gtm.js` (neutered) | GTM stubs |
| `amazon_ads.js` (neutered) | Amazon ad stubs |
| `doubleclick_instream_ad.js` (neutered) | DFP video ad stubs |
| `outbrain-widget.js` (neutered) | Outbrain content widget stubs |
| `popads*.js` (neutered) | PopAds stubs |
| `scorecardresearch_beacon.js` (neutered) | Comscore stubs |

### Total bundle size
~60 scriptlets + ~30 redirect resources ≈ ~200KB of bundled JavaScript.

---

## 9. Brave's Tartar (`$removeparam` Equivalent)

Brave has a separate C++ component (`brave/components/brave_shields/content/browser/domain_block_navigation_throttle.cc`)
that strips URL query parameters (tracking params like `fbclid`, `utm_*`, `gclid`).
This is handled independently from the adblock engine — a custom `NavigationThrottle`
that rewrites URLs before navigation.

**For Neonwolf:** Firefox already has `privacy.query_stripping.strip_list` which does
the same thing (LibreWolf enables it with Brave's strip list). This covers the
`$removeparam` use case without needing engine changes.

---

## Summary

- **Phase 1 (done):** Domain-specific cosmetic hiding. ~500 selectors/site. Network blocking works.
- **Phase 2 (next):** Generic cosmetic + procedural filters. MutationObserver watching class/id changes + JS executor for `:has-text()`, `:has()`, etc.
- **Phase 3:** Scriptlet injection. Bundle uBO's ~60 scriptlets, wire `use_resources()`, inject via JSWindowActors.
- **Phase 4:** `$redirect` + `$csp`. Channel interception + bundled redirect resources.
- **Phase 5:** Shields panel UI. Extend Firefox's protections panel with per-site granular controls.
- **Phase 6:** Element picker, logger, custom filters. Pure UI work on top of complete engine.
