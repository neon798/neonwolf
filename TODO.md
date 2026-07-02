# TODO

## Password manager & autofill removal
Tracked in `docs/WIP-credential-management.md`.
- [x] Disable/remove Firefox's built-in password manager (`signon.*` prefs) — `PasswordManagerEnabled:false` policy
- [x] Disable/remove credit card and address autofill (`extensions.formautofill.*`) — `lockPref` in overrides
- [x] Remove or hide the password manager UI from `about:preferences#privacy` — policy blocks about:logins + disables controls; `librewolf.hidePasswdmgr=true` and `neonwolf-hide-passwords-redesign.patch` remove both the legacy and redesigned Passwords sections
- [x] Add a recommended-password-managers section (Bitwarden, 1Password, Proton Pass, KeePassXC) to the Neonwolf preferences pane

## DNS protection
- [x] Set `network.trr.mode` and `network.trr.uri` to use Mullvad base DNS by default
- [x] Set `network.trr.default_provider_uri` to Mullvad DOH endpoint
- [x] Enable `network.trr.wait-for-portal` and `network.trr.skip-address-validation` for reliability
- [x] Force DNS-over-HTTPS with fallback hardening (disable plain DNS fallback)

## Native uBlock-parity blocker
Already tracked in `docs/WIP-native-cosmetic-blocker.md`:
- Phase 1 (cosmetic hide selectors) — DONE
- Phase 2 (generic cosmetic via MutationObserver) — TODO
- Phase 3 (scriptlet injection) — TODO
- D3ward benchmark pass target: >95%

## Browser fingerprinting spoofing
Tracked in `docs/spoofing-research.md`. Conclusion: the uniformity (RFP) approach
covers every property — no C++ patch is needed on FF152.
- [x] Research FF152 spoofing surface (navigator properties, canvas, WebGL, audio, fonts) — `docs/spoofing-research.md`
- [x] Spoof `navigator.userAgent`, `navigator.platform`, `navigator.hardwareConcurrency` — RFP per-platform defaults; **FF152 already spoofs hardwareConcurrency to 4 (8 on macOS)**, no patch needed
- [x] Spoof screen resolution / color depth — color depth `24` via RFP; resolution via RFP ±4px rounding (letterboxing intentionally left off — usability cost, see doc §3)
- [x] Spoof timezone to UTC — RFP spoofs `Intl`/`Date` timezone to UTC by default
- [x] Spoof content languages (`Accept-Language: en-US,en;q=0.5`) — `privacy.spoof_english=2` in overrides
- [x] Canvas fingerprinting protection — RFP blocks no-user-input canvas extraction; WebGL disabled (`webgl.disabled`)
- [x] Evaluate `privacy.resistFingerprinting` versus selective spoofing — chose RFP uniformity (matches Tor/Mullvad); see doc

Beyond the doc's baseline recommendation (both implemented):
- [x] Defensive Neonwolf patch pinning the spoofed `hardwareConcurrency` value — `patches/rfp-pin-hardware-concurrency.patch` (anchors 4/8; CI fails loud on upstream regression)
- [x] Timezone spoof — `patches/rfp-spoof-timezone.patch` sets RFP timezone to `America/New_York` (UTC-5), coherent with the en-US locale spoof; single constant to retarget
