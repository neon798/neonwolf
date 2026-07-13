# Spoofing Strategy Research

## Goal

Present a common, indistinguishable browser profile — not just resist fingerprinting
(which stands out), but **spoof** values that blend into the largest crowd.

---

## The Approaches: Uniformity vs. Randomization

| Browser | Strategy | How it works |
|---------|----------|-------------|
| **Tor Browser** | Uniformity | All users on same version get identical fingerprint values |
| **Mullvad Browser** | Uniformity | Same approach as Tor, via Firefox RFP + extra hardening |
| **Firefox RFP** | Uniformity | Hardcoded spoofed values for each platform |
| **Brave** | Randomization (farbling) | Values randomized per eTLD+1/session; different every time |

**For Neonwolf, the uniformity approach (Tor/Mullvad/Firefox RFP) is the right fit**
because Brave's farbling requires a C++ engine rewrite. RFP is already enabled in
LibreWolf's baseline — the question is: what values should we spoof?

---

## 1. `navigator.userAgent`

### Market share (desktop, useragents.me June 2026)

| UA Pattern | Share |
|---|---|
| Safari 17 on macOS 10_15_7 | 43.03% |
| Chrome 134 on macOS 10_15_7 | 21.05% |
| Chrome 134 on Windows 10 x64 | 17.34% |
| Chrome 134 on Linux x86_64 | 3.72% |

### What Tor/Mullvad/RFP spoof (platform-dependent):

| Actual OS | Spoofed UA OS portion |
|---|---|
| Windows | `Windows NT 10.0; Win64; x64` |
| macOS | `Macintosh; Intel Mac OS X 10.15` |
| Linux | `X11; Linux x86_64` |

The Firefox version number matches the actual browser version.

### Recommendation

**Keep Firefox RFP's default per-platform spoof** — it's battle-tested and matches
Tor/Mullvad. Changing the UA to a Chrome string would break Firefox's existing
RFP machinery and cause site breakage (Mozilla-specific JS feature detection,
`navigator.userAgentData`, etc.). The spoofed Firefox UA on Windows (`Win64`)
blends into the 17% Chrome-on-Windows crowd well enough.

Don't change — existing RFP defaults are correct.

---

## 2. `navigator.platform`

### Real-world distribution

| Value | Est. Share | Notes |
|---|---|---|
| `Win32` | ~60% | All Windows versions, even 64-bit, return `Win32` (historical) |
| `MacIntel` | ~10% | All Intel Macs |
| `Linux x86_64` | ~3% | All Linux distributions |

### What Tor/Mullvad/RFP spoof:

| Actual OS | Spoofed `navigator.platform` |
|---|---|
| Windows | `Win32` |
| macOS | `MacIntel` |
| Linux | `Linux x86_64` |

These are already the most common values per platform. No change needed.

---

## 3. Screen Resolution

### Global data

| Resolution | Share (all platforms) | Share (desktop only) |
|---|---|---|
| **1920×1080** | 8.33% | **~17-20%** |
| 1366×768 | ~2-4% | ~6% |
| 1536×864 | ~2% | ~7% |
| 1440×900 | ~2% | ~4% |
| 1280×720 | ~2% | ~4% |

W3Schools (2023): 1920×1080 at **47.2%** on desktop.

### What Tor/Mullvad do: Letterboxing

Content window rounded to multiples of 200×100px. Users fall into buckets like
1000×700, 1200×700, 1400×900, etc. Margins are added to snap to the nearest bucket.

### Current Neonwolf state

`privacy.resistFingerprinting` is already enabled (from LibreWolf baseline). RFP
does NOT enable letterboxing by default — `privacy.resistFingerprinting.letterboxing`
is `false` in LibreWolf's baseline.

### Recommendation

**Not enabled.** Letterboxing creates a visible border around the content window
that hurts usability. RFP still rounds inner dimensions to +/-4px which
provides some protection without the UI cost.

---

## 4. Color Depth

| Value | Share |
|---|---|
| **24** | ~90-95% |
| 30 | <0.5% (HDR) |

### What Firefox RFP spoofs: `24`

Correct — no change needed. Already the overwhelming standard.

---

## 5. `navigator.hardwareConcurrency`

### Real-world distribution (desktop)

| Cores | Est. Share | Notes |
|---|---|---|
| **8** | ~35-40% | Modern Intel 4P+4E, AMD 6+2, M1/M2 base |
| **4** | ~25-30% | Older i5/i7, budget laptops |
| **6** | ~15-20% | Mid-range (Ryzen 5, i5-12400) |
| 2 | ~3-5% | Budget/VMs/very old |

### What Firefox RFP spoofs in FF152: `4` (8 on macOS)

> **Corrected June 2026 against the FF152 source.** Older Firefox (and the
> original draft of this doc) spoofed to `2`. FF152 already spoofs to **4** on
> Windows/Linux and **8** on macOS. See
> `dom/workers/RuntimeService.cpp::ClampedHardwareConcurrency` — the in-tree
> comment reads *"34% of Firefox users have exactly 4 cores ... spoof
> navigator.hardwareConcurrency = 4 ... On OSX, the majority of Macs have 8
> cores."* When full `privacy.resistFingerprinting` is enabled (baseline:
> `settings/librewolf.cfg:234`), the `NavigatorHWConcurrency` RFP target is
> unconditionally active (`nsRFPService.cpp` `IsRFPEnabledFor` returns `true`
> for every target in RFP mode), so this spoof is **live**.

### What Brave spoofs (Standard): 2 to real-value (random per session)

### Recommendation

**No action needed.** FF152's RFP default (`4`, or `8` on macOS) already matches
the ideal value this doc identified. The previously-planned 2→4 C++ patch is
obsolete — upstream now ships the desired behavior.

---

## 6. Timezone

### Top timezones by internet users

| UTC Offset | Users | Major Regions |
|---|---|---|
| **UTC+8** | ~503M | China, Philippines, SE Asia |
| **UTC+1** | ~357M | Germany, France, Italy, Nigeria |
| **UTC-5** | ~161M | US East Coast, Colombia, Peru |
| **UTC+2** | ~150M | Eastern Europe, Egypt, South Africa |
| **UTC+5** | ~140M | India, Pakistan |

### What Firefox RFP spoofs: `UTC+0`

Making everyone report UTC is the uniformity approach — all RFP/Mullvad/Tor users
are in one bucket. But UTC-only users are almost entirely RFP/Tor users, which is
a detectable signal.

### Recommendation

**Trade-off**: UTC uniformity vs. blending into a real crowd.

- **Pro-UTC**: Eliminates timezone as a distinguishing signal among all
  RFP/Mullvad/Tor users (millions). Every privacy browser does this.
- **Pro-real-timezone**: Blends into a population bucket of 100-500M people.
  But then the spoofed value matters — UTC+8 is largest, UTC+1 is 2nd.

For now: **keep UTC** (RFP default). In a future Phase, consider spoofing
to UTC+8 (largest bucket) or UTC+1 (2nd largest, European-friendly). This
would require a C++ patch.

---

## 7. Accept-Language

### Global distribution

| Header | Est. Share |
|---|---|
| **`en-US,en;q=0.9`** | ~40% |
| `de-DE,de;q=0.9` | ~11% |
| `fr-FR,fr;q=0.9` | ~8% |
| `zh-CN,zh;q=0.9` | ~7% |

### What RFP/Tor do: `en-US, en` (via `privacy.spoof_english=2`)

### What Brave does: randomizes via farbling

### Current Neonwolf state

`privacy.spoof_english = 2` — just added to `neonwolf.overrides.cfg`. This
spoofs `Accept-Language` and `navigator.language` to `en-US`.

### Recommendation

Keep `privacy.spoof_english = 2`. `en-US` is the single largest language bucket
(~40%). No change needed.

---

## 8. Canvas / WebGL / Audio Fingerprinting

### Current state with RFP enabled

| Surface | RFP behavior |
|---|---|
| **Canvas** | `autoDeclineNoUserInputCanvasPrompts` — requires user click to extract |
| **WebGL readPixel** | Disabled |
| **WebGL renderer** | Spoofed to generic strings per platform |
| **AudioContext** | Timer jitter (1000µs precision), but no data randomization like Brave |
| **Fonts** | Limited enumeration; only standard fonts visible |

### What Brave does that RFP doesn't

Brave adds controlled noise to Canvas and AudioContext outputs even *before*
permission prompts. RFP just blocks or returns generic values.

### Recommendation

Firefox RFP's approach (block/restrict) is sufficient for now. Adding noise
injection like Brave's would require C++ patches. Defer.

---

## 9. Other Fingerprint Surfaces

### WebRTC Local IP leak

`media.peerconnection.ice.no_host = true` — already in `neonwolf.overrides.cfg`.
Prevents local IP disclosure via ICE candidate gathering.

### Battery, Sensors, Gamepad, Network Info APIs

All disabled via `neonwolf.overrides.cfg`:
- `dom.battery.enabled = false`
- `device.sensors.enabled = false`
- `dom.gamepad.enabled = false`
- `dom.netinfo.enabled = false`

### WebGL

`webgl.disabled = true` — already in overrides. Note: this is aggressive and may
break sites. Consider moving to `defaultPref` instead of locking it, or leaving
it as-is for max privacy at the cost of usability.

---

## Summary: What's Done vs. What's Left

| Property | Current Value | Ideal Value | Needs Patch? |
|---|---|---|---|
| `navigator.userAgent` | RFP per-platform default | RFP per-platform default | No |
| `navigator.platform` | RFP per-platform default | RFP per-platform default | No |
| Screen resolution | RFP letterboxing **OFF** | Real + RFP rounding | No |
| Color depth | 24 (RFP) | 24 | No |
| `hardwareConcurrency` | **4** (RFP, FF152) / 8 macOS | **4** | Pinned (defensive patch) |
| Timezone | **America/New_York** (Neonwolf patch) | UTC or a real zone | Yes (done) |
| Accept-Language | en-US (spoof_english=2) | en-US | No |
| Canvas | Blocked (RFP) | Blocked | No |
| WebGL | Disabled (Neonwolf) | Disabled or RFP-restricted | No |
| AudioContext | Timer jitter (RFP) | Timer jitter | No |
| WebRTC local IP | Blocked (Neonwolf) | Blocked | No |
| Fonts | Limited (RFP) | Limited | No |
| Battery/Sensors/Gamepad | Disabled (Neonwolf) | Disabled | No |

**No value-level patch was strictly required** on FF152 — RFP (enabled in the
baseline) plus the Neonwolf overrides already produce every recommended value.
Two small marked patches were nevertheless added by deliberate choice:

### Implemented patches

1. **`patches/rfp-pin-hardware-concurrency.patch`** — defensive anchor on
   `dom/workers/RuntimeService.cpp::ClampedHardwareConcurrency`. FF152 already
   returns `4` (non-macOS) / `8` (macOS); the patch is a marker comment on those
   return lines so that if a future Firefox regresses the spoofed value, the
   patch fails to apply and `make check-patchfail` (CI) flags it. Functional
   no-op today, purely a guard.

2. **`patches/rfp-spoof-timezone.patch`** — `nsRFPService::GetSpoofedJSTimeZone`
   returns `America/New_York` instead of RFP's UTC default
   (`Atlantic/Reykjavik`). See the timezone trade-off below.

### Timezone: decision

Implemented as `America/New_York` (US Eastern, UTC-5) via
`patches/rfp-spoof-timezone.patch`.

**Trade-off, eyes open:** RFP's UTC default keeps all Tor/Mullvad/RFP users in
one global bucket. Spoofing a real timezone moves Neonwolf into a *different*
bucket. The value chosen, US Eastern, is internally consistent with RFP's
forced `en-US` locale — an en-US + `Asia/Shanghai` (UTC+8) pairing would be
self-contradictory and *more* fingerprintable despite UTC+8 being the larger raw
population. To retarget, change the single constant in the patch (e.g.
`Asia/Shanghai` for UTC+8, `Europe/Berlin` for UTC+1).

> Caveat worth revisiting: because only the timezone is changed (UA, screen,
> fonts, etc. stay at RFP defaults), Neonwolf users form their own distinct
> bucket rather than blending into the real US-Eastern population. If evidence
> shows this hurts more than UTC uniformity helps, revert to UTC by dropping the
> patch.

### Not recommended: UA spoofing to Chrome

Tor Browser *removed* OS spoofing in v14.5 because asymmetric UA spoofing
(spoofed HTTP header but real JS `navigator.userAgent`, or vice versa) triggered
anti-fraud/bot detection. Spoofing Firefox-to-Chrome would be even worse —
JS feature detection would immediately expose the mismatch. Stay with Firefox UA.
