# WIP: native ad-blocker (content-classifier) + cosmetic filtering

Goal: native, no-extension ad blocking using FF152's bundled adblock-rust
engine (`toolkit/components/content-classifier`, dormant by default), eventually
matching uBO via cosmetic filtering. Tracked while uBO still ships.

## Validated (runtime, no rebuild)
- Engine + network blocking work. Enable via prefs:
  - `privacy.trackingprotection.content.protection.enabled = true`
  - `privacy.trackingprotection.content.protection.list_names = "<comma names>"`
- Lists load via a bundled RemoteSettings dump (collection `content-classifier-lists`):
  records `{"data":[{Name, attachment:{hash(sha256),size,filename,location,mimetype},id,last_modified}],"timestamp"}`
  + attachment files named `<id>` and `<id>.meta.json` (sidecar == record), in
  `services/settings/dumps/main/content-classifier-lists/`, packaged via moz.build
  `FINAL_TARGET_FILES.defaults.settings.main["content-classifier-lists"]`.
- CRITICAL: add `main/content-classifier-lists` to
  `librewolf.services.settings.allowedCollectionsFromDump` ONLY (NOT
  `allowedCollections`) — adding it to allowedCollections enables a network
  sync that DELETES the dump-loaded lists (rs-blocker.patch).
- Network-only ceiling ~55-61% on d3ward; cosmetic always off (the gap).

## List distribution — DONE (wired into the build)
The dump above is now generated and shipped automatically; blocking is on by default.
- `scripts/gen-adblock-dump.py` turns `assets/adblock/*.txt` into the
  `content-classifier-lists` dump (records JSON + `<id>`/`<id>.meta.json`
  attachments) and appends the `FINAL_TARGET_FILES.defaults.settings.main`
  packaging to `services/settings/dumps/main/moz.build`. Called from
  `neonwolf-patches.py` (right after the search-config dump copy). Bundled set:
  easylist, easyprivacy, peterlowe, ubo-filters, ubo-badware, ubo-privacy,
  ubo-quickfixes, adguard-mobile.
- `assets/neonwolf.overrides.cfg` enables it: `protection.enabled = true`,
  `protection.list_names = <the 8 names>`, and **appends** (does not clobber)
  `main/content-classifier-lists` to `allowedCollectionsFromDump` via `getPref`.
- **rs-blocker.patch fix (required):** the attachment `download()` gate was
  keyed on `isCollectionAllowed` (the *network* allow-list), so dump-only
  collections could load their records but not their attachments. The gate now
  also accepts `isCollectionAllowedFromDump`; with `fallbackToDump` the bundled
  attachment is served with no network request (the *sync* gate stays strict, so
  the network blocklist is unchanged). The sync-delete hazard is why we still
  must NOT add the collection to `allowedCollections`.
- Validated against the built dist via xpcshell (production startup path):
  `getService` -> RS client imports all 8 lists from the dump
  (`download ... source=dump_match`, no network) -> engines rebuilt ->
  `getCosmeticHideSelectors` returns ~500 selectors/site for advfn.com,
  thetvdb.com, seafoodsource.com, theguardian.com. Still **not** eyeballed on
  d3ward in a real GUI / full rebuild.

## Cosmetic filtering progress (Phase 1 foundation — DONE, in-tree)
Engine exposes cosmetic via `Engine::url_cosmetic_resources(url).hide_selectors`.

`content_classifier_engine/src/lib.rs` — added FFI:
```rust
#[no_mangle]
pub unsafe extern "C" fn content_classifier_engine_cosmetic_hide_selectors(
    engine: *const ContentClassifierFFIEngine,
    url: &nsACString,
    out_selectors: &mut ThinVec<nsCString>,
) -> nsresult {
    if engine.is_null() { return NS_ERROR_INVALID_ARG; }
    let engine = &(*engine).engine;
    let url_str = String::from_utf8_lossy(url.as_ref()).to_string();
    let resources = engine.url_cosmetic_resources(&url_str);
    out_selectors.clear();
    for selector in resources.hide_selectors { out_selectors.push(nsCString::from(selector)); }
    NS_OK
}
```

`content_classifier_engine/ContentClassifierEngine.h` — added wrapper:
```cpp
nsresult GetCosmeticHideSelectors(const nsACString& aUrl, nsTArray<nsCString>& aOut) {
  if (!mEngine) { return NS_ERROR_NOT_AVAILABLE; }
  return content_classifier_engine_cosmetic_hide_selectors(mEngine, &aUrl, &aOut);
}
```

## Phase 1 chain — DONE (captured in `patches/native-cosmetic-filtering.patch`)
1. [x] `ContentClassifierService::GetCosmeticHideSelectors` aggregates hide-selectors across `mBlockEngines`, dedup via `nsTHashSet`. No-ops (returns empty) unless `InitPhase::InitSucceeded`.
2. [x] `nsIContentClassifierService.idl`: `Array<ACString> getCosmeticHideSelectors(in AUTF8String aUrl);` (interface uuid bumped).
3. [x] `components.conf`: registered `@mozilla.org/content-classifier-service;1` via a new ungated `GetServiceSingleton()` (so `getService` works even when blocking is off; the methods gate internally).
4. [x] `CosmeticFilter` JSWindowActor pair (`toolkit/actors/CosmeticFilter{Child,Parent}.sys.mjs`, registered in `ActorManagerParent.sys.mjs`, `allFrames`, `messageManagerGroups: ["browsers"]`): child fires on `DOMDocElementInserted` for http(s), queries parent, injects `selectors{display:none!important}` via `loadSheetUsingURIString(..., AGENT_SHEET)`.
5. [x] Built (full `./mach build`, exit 0). Validation: the build ships `--disable-tests`, so the in-tree mochitest (`test/browser/browser_content_classifier_cosmetic.js`, also captured in the patch) can only run in a tests-enabled/CI build. Validated the native chain directly via xpcshell against the dist build: `setFilterListData("example.net##.neonwolf-test-ad")` + `applyFilterLists()` -> `getCosmeticHideSelectors("https://example.net/...")` returns `[".neonwolf-test-ad"]`, and an off-domain URL returns `[]`. **Not yet validated on d3ward** — that needs real lists loaded (see below), which is not yet wired.
6. [x] Captured as `patches/native-cosmetic-filtering.patch` (includes the Phase 1 foundation FFI + wrapper above), wired into `assets/patches.txt` after `msix.patch`.

### List distribution to make it block by default — DONE
The lists are now packaged and enabled by default; see "List distribution" above.
Remaining before this can be called shippable: a real GUI / full-rebuild d3ward
pass (`cosmetic_static_ad -> true`), and Phase 2 (generic cosmetic) to close the
gap on the many sites whose rules are generic rather than domain-specific.

## Phase 2/3
- Phase 2: generic cosmetic via `hidden_class_id_selectors` + content MutationObserver.
- Phase 3: scriptlet injection from `url_cosmetic_resources.injected_script`.

## Bundled list set (fetch-at-build)
easylist, easyprivacy, peterlowe, ubo-filters, ubo-badware, ubo-privacy,
ubo-quickfixes, adguard-mobile.
