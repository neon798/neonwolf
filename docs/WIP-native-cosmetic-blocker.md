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

## Remaining Phase 1 chain
1. ContentClassifierService: aggregate hide-selectors across mBlockEngines (dedup).
2. nsIContentClassifierService.idl: `Array<ACString> getCosmeticHideSelectors(in AUTF8String aUrl);`
3. components.conf: register the service with a contract id (`@mozilla.org/content-classifier-service;1`) so JS can getService it (currently none).
4. New parent/child JSActor: child gets document URL on load -> parent queries service -> child injects `selectors{display:none!important}` via `windowUtils.loadSheetUsingURIString("data:text/css,...", AGENT_SHEET)`.
5. Build: `./mach build binaries` (Rust/C++) + `./mach build faster` (JSActor); verify d3ward `cosmetic_static_ad` -> true.
6. Capture all of the above as `patches/` + wire into patches.txt.

## Phase 2/3
- Phase 2: generic cosmetic via `hidden_class_id_selectors` + content MutationObserver.
- Phase 3: scriptlet injection from `url_cosmetic_resources.injected_script`.

## Bundled list set (fetch-at-build)
easylist, easyprivacy, peterlowe, ubo-filters, ubo-badware, ubo-privacy,
ubo-quickfixes, adguard-mobile.
