/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Neonwolf in-app update NOTIFIER (notify-only).
 *
 * The updater is compiled out (--disable-updater), so this never downloads or
 * applies anything. It periodically asks the GitHub Releases API whether a
 * newer Neonwolf build exists and, if so, records it in prefs for the UI to
 * surface (a banner + a download link). One HTTPS request to api.github.com on
 * a long interval; the whole thing is gated by neonwolf.update.checkEnabled.
 */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
  clearTimeout: "resource://gre/modules/Timer.sys.mjs",
});
ChromeUtils.defineLazyGetter(lazy, "log", () =>
  console.createInstance({
    maxLogLevelPref: "neonwolf.update.loglevel",
    prefix: "NeonwolfUpdateCheck",
  })
);

const ENABLED_PREF = "neonwolf.update.checkEnabled";
const AVAILABLE_PREF = "neonwolf.update.availableVersion";
const URL_PREF = "neonwolf.update.url";
const LASTCHECK_PREF = "neonwolf.update.lastCheckSeconds";
// Baked at build time by scripts/neonwolf-patches.py as "<version>-<release>"
// (e.g. "152.0.1-3"); Services.appinfo.version only carries the FF version.
const FULLVERSION_PREF = "neonwolf.version.full";
const RELEASES_API =
  "https://api.github.com/repos/neon798/neonwolf/releases?per_page=30";

const STARTUP_DELAY_MS = 90 * 1000;
const INTERVAL_MS = 24 * 60 * 60 * 1000;
// Don't hit the API more than ~4x/day even if many windows open in a session.
const MIN_RECHECK_SECONDS = 6 * 60 * 60;

export const NeonwolfUpdateCheck = {
  _initialized: false,
  _timer: null,

  // Idempotent: called from every browser window's shields init, but the
  // module is a singleton so only the first call schedules anything.
  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    if (!Services.prefs.getBoolPref(ENABLED_PREF, true)) {
      return;
    }
    this._timer = lazy.setTimeout(() => this._tick(), STARTUP_DELAY_MS);
  },

  _tick() {
    this.check().catch(e => lazy.log.error("update check failed:", e));
    this._timer = lazy.setTimeout(() => this._tick(), INTERVAL_MS);
  },

  async check() {
    if (!Services.prefs.getBoolPref(ENABLED_PREF, true)) {
      return;
    }
    // Throttle across sessions so reopening windows can't spam the API.
    const nowSec = Math.floor(Date.now() / 1000);
    const last = Services.prefs.getIntPref(LASTCHECK_PREF, 0);
    if (last && nowSec - last < MIN_RECHECK_SECONDS) {
      return;
    }
    let data;
    try {
      const resp = await fetch(RELEASES_API, {
        headers: { Accept: "application/vnd.github+json" },
        cache: "no-store",
      });
      if (!resp.ok) {
        return;
      }
      data = await resp.json();
    } catch (e) {
      // Offline / network error / rate limit: leave existing state untouched.
      return;
    }
    Services.prefs.setIntPref(LASTCHECK_PREF, nowSec);
    if (!Array.isArray(data)) {
      return;
    }
    let best = "";
    let bestUrl = "";
    for (const release of data) {
      if (release.draft === true) {
        continue;
      }
      const candidate = String(release.tag_name || "").replace(/^v/, "");
      if (!candidate) {
        continue;
      }
      if (!best || this._isNewer(candidate, best)) {
        best = candidate;
        bestUrl = String(release.html_url || "");
      }
    }
    if (best && this._isNewer(best, this._current())) {
      Services.prefs.setStringPref(AVAILABLE_PREF, best);
      Services.prefs.setStringPref(URL_PREF, bestUrl);
      lazy.log.info(`update available: ${best}`);
    } else {
      // Clear any stale "available" state once we're current again.
      Services.prefs.setStringPref(AVAILABLE_PREF, "");
    }
  },

  _current() {
    let full = Services.prefs.getStringPref(FULLVERSION_PREF, "");
    if (full) {
      return full;
    }
    try {
      return Services.appinfo.version;
    } catch (e) {
      return "";
    }
  },

  // Compare "152.0.1-3"-style version-release strings segment by segment
  // (dots and the -release dash all treated as numeric segments).
  _isNewer(a, b) {
    const parse = s => s.split(/[.-]/).map(n => parseInt(n, 10) || 0);
    const av = parse(a);
    const bv = parse(b);
    const len = Math.max(av.length, bv.length);
    for (let i = 0; i < len; i++) {
      const x = av[i] || 0;
      const y = bv[i] || 0;
      if (x !== y) {
        return x > y;
      }
    }
    return false;
  },
};
