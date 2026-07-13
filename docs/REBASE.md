# Rebase runbook — moving Neonwolf to a new Firefox/LibreWolf release

Neonwolf is a **capability-first heavy fork** (see `README.md` / `CLAUDE.md`). We
deliberately accept a heavier rebase than the old "minimal marked delta" model in
exchange for owning real native features. This runbook keeps that cost tractable.

## When

- A new Firefox release LibreWolf has rebased onto (the usual trigger), or
- A LibreWolf settings/patch update we want to pull in.

## Procedure

1. **Bump the version.** Edit `./version` (e.g. `152.0.1` → next) and reset
   `./release` to `1`. The `Makefile` reads both.
2. **Update the hardening baseline.** `make update` (or bump the `settings/`
   submodule) to pull LibreWolf's latest `librewolf.cfg`, `policies.json`, and
   `local-settings.js`. Neonwolf deltas stay only in
   `assets/neonwolf.overrides.cfg` / `assets/neonwolf.policies.json`.
3. **Fetch + extract the new source.** `make fetch` then `make dir`. `make dir`
   runs `scripts/neonwolf-patches.py`, which applies `assets/patches.txt` in
   order plus the theme/settings/l10n delta.
4. **Triage native patches by fragility (`patches/native/MANIFEST.md`).** Expect
   **High** patches to need hand reapplication every release:
   - adblock engine (`native-cosmetic-filtering.patch` + M1/M2 FFI/JSActor work)
   - farbling (`dom/canvas`, `dom/media/webaudio`, WebGL, `nsRFPService.cpp`)
   Reapply by editing inside the extracted `neonwolf-$(version)-$(release)/` tree,
   then re-diff (`git init && git add … && git diff > ../patches/native/x.patch`).
5. **Validate patch application.** `make check-patchfail` must report all patches
   (including `patches/native/*`) apply cleanly. Fail-loud anchors mean a moved
   upstream string surfaces here, not at runtime.
6. **Build.** `make build` (tests-enabled: `make build-tests`, see Makefile).
7. **Re-run the validation harness** (`scripts/validate/`, see its README):
   capture a fresh d3ward + browserleaks + coveryourtracks scorecard and diff it
   against the previous release's scorecard. A regression in the adblock score or
   the appearance of a "privacy-browser tell" is a release blocker.
8. **Theme regression check** — eyeball the synthwave chrome, new-tab background,
   and search-bar halo in a real GUI (no automated coverage; `CLAUDE.md`).

## Notes

- Internal `librewolf-*` identifiers (pref names, Fluent keys, `librewolf.cfg`,
  `paneLibrewolf`) are still kept on purpose — that decision is about
  translation-key matching, not the retired delta-size directive, and it lowers
  rebase cost for free.
- If an upstream refactor makes a High-fragility patch unmaintainable, prefer
  re-deriving the feature against the new code over forcing the old diff.
