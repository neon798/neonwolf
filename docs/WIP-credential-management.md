# Credential management — remove, don't manage

ROADMAP pillar 3. Neonwolf ships **no built-in credential store**. Rather than
managing passwords/cards (a weaker, less portable choice), it disables the
built-in machinery and points users at a dedicated password manager.

## Status: DONE (config + UI)

| Goal | Mechanism | Status |
|------|-----------|--------|
| Disable built-in password manager + block `about:logins` | `PasswordManagerEnabled: false` policy | done (verified) |
| Hide the Passwords section in preferences | `librewolf.hidePasswdmgr=true` + `neonwolf-hide-passwords-redesign.patch` (two UIs) | done (verified) |
| Disable + hide address / credit-card autofill | `lockPref` on `extensions.formautofill.*` | done (verified) |
| Recommend a dedicated manager | section in the Neonwolf preferences pane | done (verified) |

## How it's wired

### 1. Policy: `PasswordManagerEnabled: false`
Neonwolf has no per-repo `policies.json` (it comes from the `settings`
submodule, kept as a clean upstream mirror). To add a Neonwolf delta without
dirtying the submodule, `scripts/neonwolf-patches.py` **deep-merges**
`assets/neonwolf.policies.json` onto the copied `policies.json` at patch time —
the policies analog of how `assets/neonwolf.overrides.cfg` is appended onto
`librewolf.cfg`. Add future locked policies to `assets/neonwolf.policies.json`.

`PasswordManagerEnabled: false` locks the `signon.*` prefs and makes
`about:logins` inaccessible. **Important correction (verified in a built tree):**
the policy only *disables* (greys out) the Passwords section in
`about:preferences#privacy` — it does **not** remove it. Hiding it is done by the
pref + patch in step 2a below.

### 2. Autofill prefs (no policy exists for these)
Locked in `assets/neonwolf.overrides.cfg` (Credential management block). Setting
the `extensions.formautofill.{addresses,creditCards}.supported` gate to `"off"`
disables the engine **and** hides the "Forms and Autofill" preferences section;
`lockPref` prevents re-enabling.

### 2a. Hiding the Passwords section (two UIs)
FF152 renders **two** passwords UIs in `about:preferences#privacy`: a legacy
`#passwordsGroup` and a redesigned `<setting-group groupid="passwords">`. Both
must be removed:
- `defaultPref("librewolf.hidePasswdmgr", true)` in `neonwolf.overrides.cfg`
  activates LibreWolf's existing `patches/hide-passwordmgr.patch`, which removes
  the legacy `#passwordsGroup` **and** the app-menu passwords button. (The
  baseline ships this pref defaulting to `false`; we flip it.)
- `patches/neonwolf-hide-passwords-redesign.patch` extends that same
  `librewolf.hidePasswdmgr` block in `privacy.js` to also remove the redesigned
  setting-group. Ordered **after** `hide-passwordmgr.patch` in `patches.txt`
  (it anchors on lines that patch adds).

Both are read at runtime by `privacy.js`, so verified end-to-end: the privacy
pane now goes Cookies → History with no Passwords or Forms & Autofill sections.

### 3. Recommended-managers UI
Lives in the existing **Neonwolf preferences pane** (`about:preferences#neonwolf`,
internally `paneLibrewolf`) — already wired, rebranded and translatable, and it
sits exactly where the old password UI used to be.

- Markup: a new `groupbox` in `patches/pref-pane/librewolf.inc.xhtml`, using
  `<label is="text-link" href=...>` so links open in a browser tab with **no JS**.
- Strings: `neonwolf-pwmgr-*` keys in
  `l10n/en-US/browser/browser/preferences/preferences.inc.ftl`. Non-en-US
  locales fall back to en-US until translated (brand names + one-line blurbs).
- Style: `.neonwolf-pwmgr-*` rules in `patches/pref-pane/librewolf.css`.
- Managers listed: Bitwarden, 1Password, Proton Pass, KeePassXC.

> Note: the new strings use a `neonwolf-` prefix (not `librewolf-`) because this
> is a Neonwolf-only section with no upstream translation key to match — unlike
> the rest of the pane, which keeps `librewolf-*` keys on purpose.

## Verifying (needs a built tree)
1. `make dir` (or `make check-patchfail`) must apply cleanly — validates the
   pref-pane patch, the JSON merge and the l10n append.
2. In a GUI session: `about:preferences#privacy` has **no** Logins & Passwords
   or Forms & Autofill sections; `about:logins` is blocked; the Neonwolf pane
   shows the Password Managers section with four working links.
