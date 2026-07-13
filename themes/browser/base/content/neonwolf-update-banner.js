/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* eslint-env mozilla/browser-window */

/**
 * Neonwolf update-available banner (display layer).
 *
 * Shows when neonwolf.update.availableVersion is set and differs from
 * neonwolf.update.dismissedVersion. Notify only — no download logic.
 */
var gNeonwolfUpdateBanner = {
  PREF_AVAILABLE: "neonwolf.update.availableVersion",
  PREF_URL: "neonwolf.update.url",
  PREF_DISMISSED: "neonwolf.update.dismissedVersion",
  OBS_BRANCH: "neonwolf.update.",

  _banner: null,
  _textLabel: null,
  _downloadLink: null,

  _getAvailable() {
    return Services.prefs.getStringPref(this.PREF_AVAILABLE, "");
  },

  _getUrl() {
    return Services.prefs.getStringPref(this.PREF_URL, "");
  },

  _getDismissed() {
    return Services.prefs.getStringPref(this.PREF_DISMISSED, "");
  },

  _shouldShow() {
    let available = this._getAvailable();
    return available && available != this._getDismissed();
  },

  _ensureBanner() {
    if (this._banner) {
      return;
    }

    let toolbox = document.getElementById("navigator-toolbox");
    if (!toolbox || !toolbox.parentNode) {
      return;
    }

    let banner = document.createXULElement("hbox");
    banner.id = "neonwolf-update-banner";
    banner.className = "neonwolf-update-banner";
    banner.setAttribute("align", "center");
    banner.setAttribute("role", "alert");
    banner.hidden = true;

    this._textLabel = document.createXULElement("label");
    this._textLabel.className = "neonwolf-update-banner-text";
    this._textLabel.setAttribute("flex", "1");
    banner.appendChild(this._textLabel);

    this._downloadLink = document.createXULElement("label");
    this._downloadLink.className = "neonwolf-update-banner-link";
    this._downloadLink.setAttribute("value", "Download");
    this._downloadLink.addEventListener("click", () => this._onDownload());
    banner.appendChild(this._downloadLink);

    let close = document.createXULElement("toolbarbutton");
    close.className = "neonwolf-update-banner-close";
    close.setAttribute("label", "\u00d7");
    close.setAttribute("tooltiptext", "Dismiss");
    close.addEventListener("command", () => this._onDismiss());
    banner.appendChild(close);

    toolbox.parentNode.insertBefore(banner, toolbox.nextSibling);
    this._banner = banner;
  },

  _updateVisibility() {
    this._ensureBanner();
    if (!this._banner) {
      return;
    }

    if (!this._shouldShow()) {
      this._banner.hidden = true;
      return;
    }

    let version = this._getAvailable();
    this._textLabel.setAttribute(
      "value",
      `Neonwolf ${version} is available`
    );
    this._banner.hidden = false;
  },

  _onDownload() {
    let url = this._getUrl();
    if (url) {
      window.openTrustedLinkIn(url, "tab");
    }
  },

  _onDismiss() {
    let available = this._getAvailable();
    if (available) {
      Services.prefs.setStringPref(this.PREF_DISMISSED, available);
    }
    this._updateVisibility();
  },

  observe(aSubject, aTopic, aPrefName) {
    if (aTopic != "nsPref:changed") {
      return;
    }
    // The branch also carries lastCheckSeconds/checkEnabled (written on every
    // check); only visibility-relevant prefs matter here.
    if (
      aPrefName == this.PREF_AVAILABLE ||
      aPrefName == this.PREF_URL ||
      aPrefName == this.PREF_DISMISSED
    ) {
      this._updateVisibility();
    }
  },

  _onUnload() {
    Services.prefs.removeObserver(this.OBS_BRANCH, this);
  },

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;

    Services.prefs.addObserver(this.OBS_BRANCH, this);
    window.addEventListener("unload", () => this._onUnload(), { once: true });
    this._updateVisibility();
  },
};

window.addEventListener("load", () => gNeonwolfUpdateBanner.init(), {
  once: true,
});