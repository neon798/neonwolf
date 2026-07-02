/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* eslint-env mozilla/browser-window */

/**
 * Neonwolf Shields per-site control (M3 frontend).
 *
 * Brave-Shields-style handler. The MASTER per-site toggle is the critical
 * piece: "shields down" for a site is stored as a permission of type
 * "neonwolf-shields" set to ALLOW on the page's content principal. ALLOW means
 * native ad/track blocking is DISABLED for that site. Absent/UNKNOWN means
 * shields up (blocking on, the default).
 *
 * This mirrors toolkit/components/antitracking/ContentBlockingAllowList but
 * with the "neonwolf-shields" permission type and EXPIRE_NEVER expiry.
 *
 * The five category checkboxes remain bound to the global `neonwolf.shields.*`
 * prefs for v1 and are presented as global defaults.
 */
var gNeonwolfShieldsHandler = {
  // Shared contract with the backend / CosmeticFilterParent.
  PERMISSION_TYPE: "neonwolf-shields",

  _categories: ["ads", "trackers", "fingerprinting", "cookies", "httpsUpgrade"],

  get _panel() {
    delete this._panel;
    return (this._panel = document.getElementById("neonwolf-shields-panel"));
  },

  get _button() {
    delete this._button;
    return (this._button = document.getElementById("neonwolf-shields-button"));
  },

  /**
   * The current tab's content principal, or null if the loaded document is not
   * a content document we can scope a permission to (about:, file:, etc.).
   * Mirrors ContentBlockingAllowList._basePrincipalForAntiTrackingCommon.
   */
  get _principal() {
    let principal =
      gBrowser.selectedBrowser.browsingContext.currentWindowGlobal
        ?.contentBlockingAllowListPrincipal;
    // We can only use content principals for this purpose.
    if (!principal || !principal.isContentPrincipal) {
      return null;
    }
    return principal;
  },

  /**
   * The native content-classifier service, or null if unavailable. Not cached,
   * since it may not be ready at first access; getService() returns the
   * singleton cheaply.
   */
  get _classifierService() {
    try {
      return Cc["@mozilla.org/content-classifier-service;1"].getService(
        Ci.nsIContentClassifierService
      );
    } catch (e) {
      return null;
    }
  },

  /**
   * The schemeless site key for the current tab. This MUST match the key the
   * C++ ContentClassifierService uses for its blocked-count map, which keys on
   * the request's source site == the loading principal's base domain
   * (nsIPrincipal::GetBaseDomain). nsIPrincipal.baseDomain is that same value,
   * so we derive the key from the document content principal. Empty string when
   * no base domain can be derived (e.g. about:, file:, IP hosts).
   */
  _currentSiteKey() {
    try {
      return gBrowser.selectedBrowser.contentPrincipal.baseDomain;
    } catch (e) {
      return "";
    }
  },

  /**
   * Number of network requests natively blocked for the current top-level
   * site this session: the uBO engine's count (UBONetFilter, the authoritative
   * network blocker) plus the C++ classifier's count (dormant fallback, and
   * still the counter for any annotate-path hits). 0 when unavailable.
   */
  getBlockedCount() {
    let site = this._currentSiteKey();
    if (!site) {
      return 0;
    }
    let count = 0;
    try {
      let { UBONetFilter } = ChromeUtils.importESModule(
        "resource://gre/modules/UBONetFilter.sys.mjs"
      );
      count += UBONetFilter.getBlockedCount(site);
    } catch (e) {}
    let service = this._classifierService;
    if (service) {
      try {
        count += service.getBlockedCount(site);
      } catch (e) {}
    }
    return count;
  },

  /**
   * Whether shields are down (native blocking disabled) for the current site.
   */
  isShieldsDown() {
    let principal = this._principal;
    if (!principal) {
      return false;
    }
    return (
      Services.perms.testPermissionFromPrincipal(
        principal,
        this.PERMISSION_TYPE
      ) == Services.perms.ALLOW_ACTION
    );
  },

  /**
   * Turn shields down (true) or up (false) for the current site, then reload
   * the tab so the change takes effect on the network + cosmetic paths.
   */
  setShieldsDown(down) {
    let principal = this._principal;
    if (!principal) {
      return;
    }
    if (down) {
      Services.perms.addFromPrincipal(
        principal,
        this.PERMISSION_TYPE,
        Services.perms.ALLOW_ACTION,
        Ci.nsIPermissionManager.EXPIRE_NEVER
      );
    } else {
      Services.perms.removeFromPrincipal(principal, this.PERMISSION_TYPE);
    }
    // Bypass the cache: subresources cancelled by the blocker on the previous
    // load can otherwise be served as cached failures and stay "blocked" even
    // though the engines now allow them (and vice versa after shields-up).
    gBrowser.selectedBrowser.reloadWithFlags(
      Ci.nsIWebNavigation.LOAD_FLAGS_BYPASS_CACHE |
        Ci.nsIWebNavigation.LOAD_FLAGS_BYPASS_PROXY
    );
  },

  /**
   * Open the panel from the urlbar button. Filters to left click / keyboard
   * activation.
   */
  onUrlbarButtonClicked(event) {
    if (event.type == "click" && event.button != 0) {
      return;
    }
    if (event.type == "keypress" && event.key != " " && event.key != "Enter") {
      return;
    }
    this.show(event);
  },

  /**
   * Anchor and open the panel to the urlbar button.
   */
  show(event) {
    let panel = this._panel;
    if (!panel) {
      return;
    }
    let anchor = this._button || event.target;
    panel.openPopup(anchor, "bottomright topright");
  },

  /**
   * Update the urlbar button's shields="up|down" attribute for styling.
   */
  updateButton() {
    let button = this._button;
    if (!button) {
      return;
    }
    let principal = this._principal;
    if (!principal) {
      // No content document - neutral (up) state.
      button.setAttribute("shields", "up");
      return;
    }
    button.setAttribute("shields", this.isShieldsDown() ? "down" : "up");
    // Surface the real blocked count in the urlbar button tooltip.
    button.setAttribute(
      "tooltiptext",
      `Neonwolf Shields - ${this.getBlockedCount()} blocked on this site`
    );
  },

  /**
   * Populate the panel when it is about to show.
   */
  onPopupShowing() {
    let principal = this._principal;
    let available = !!principal;

    let panel = this._panel;
    if (panel) {
      panel.setAttribute("shields-available", available ? "true" : "false");
    }

    // Host label.
    let hostEl = document.getElementById("neonwolf-shields-host");
    if (hostEl) {
      let host = "";
      try {
        host = gBrowser.currentURI.host;
      } catch (e) {
        host = "";
      }
      hostEl.textContent = available
        ? host || gBrowser.currentURI.spec
        : "Shields not available here";
    }

    // Master toggle reflects per-site shields state.
    let down = available && this.isShieldsDown();
    let masterEl = document.getElementById("neonwolf-shields-master");
    if (masterEl) {
      masterEl.disabled = !available;
      // "down" == shields disabled, so the master "Shields UP" control is
      // checked when shields are up. Support both checkbox and moz-toggle.
      let up = available && !down;
      if ("pressed" in masterEl) {
        masterEl.pressed = up;
      }
      masterEl.checked = up;
    }

    let statusEl = document.getElementById("neonwolf-shields-status");
    if (statusEl) {
      if (!available) {
        statusEl.textContent = "Shields are not available on this page";
      } else {
        statusEl.textContent = down
          ? "Shields are DOWN for this site"
          : "Shields are UP for this site";
      }
    }

    // Category checkboxes - global defaults (v1).
    for (let category of this._categories) {
      let el = document.getElementById(`neonwolf-shields-${category}`);
      if (el) {
        el.checked = Services.prefs.getBoolPref(
          `neonwolf.shields.${category}`,
          true
        );
        el.disabled = down || !available;
      }
    }

    // Real blocked-count from the native content classifier, keyed by the
    // current page's site (see _currentSiteKey / getBlockedCount).
    let countEl = document.getElementById("neonwolf-shields-count");
    if (countEl) {
      countEl.textContent = available ? this.getBlockedCount() : 0;
    }

    this.updateButton();
  },

  /**
   * Master toggle handler: shields up (true) means blocking enabled.
   */
  onMasterToggle(up) {
    this.setShieldsDown(!up);
  },

  /**
   * Category checkbox handler - writes the global default pref (v1).
   */
  onCategoryToggle(category, enabled) {
    Services.prefs.setBoolPref(`neonwolf.shields.${category}`, enabled);
  },

  /**
   * Tabs progress listener that refreshes the urlbar button when the selected
   * tab navigates. Lazily created.
   */
  get _progressListener() {
    delete this._progressListener;
    return (this._progressListener = {
      onLocationChange: aBrowser => {
        if (aBrowser == gBrowser.selectedBrowser) {
          gNeonwolfShieldsHandler.updateButton();
        }
      },
    });
  },

  /**
   * Wire up DOM event listeners. The browser-window CSP (script-src without
   * 'unsafe-inline') blocks inline on* handler attributes, so the urlbar
   * button, the panel and the toggles must be wired here in JS instead.
   */
  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;

    let buttonContainer = document.getElementById(
      "neonwolf-shields-button-container"
    );
    if (buttonContainer) {
      buttonContainer.addEventListener("click", event =>
        this.onUrlbarButtonClicked(event)
      );
      buttonContainer.addEventListener("keypress", event =>
        this.onUrlbarButtonClicked(event)
      );
    }

    let panel = document.getElementById("neonwolf-shields-panel");
    if (panel) {
      panel.addEventListener("popupshowing", () => this.onPopupShowing());
    }

    let master = document.getElementById("neonwolf-shields-master");
    if (master) {
      master.addEventListener("command", () =>
        this.onMasterToggle(master.checked)
      );
    }

    for (let category of this._categories) {
      let el = document.getElementById(`neonwolf-shields-${category}`);
      if (el) {
        el.addEventListener("command", () =>
          this.onCategoryToggle(category, el.checked)
        );
      }
    }

    gBrowser.tabContainer.addEventListener("TabSelect", () =>
      this.updateButton()
    );
    gBrowser.addTabsProgressListener(this._progressListener);
    this.updateButton();
  },
};

window.addEventListener("load", () => gNeonwolfShieldsHandler.init(), {
  once: true,
});
