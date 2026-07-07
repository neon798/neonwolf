/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* eslint-env mozilla/browser-window */

/**
 * Neonwolf element picker coordinator (browser chrome).
 *
 * Loads a frame script into the active tab; on Add appends a cosmetic rule to
 * privacy.trackingprotection.ubo.userFilters.
 */
var gNeonwolfElementPicker = {
  FRAME_SCRIPT: "chrome://browser/content/neonwolf-element-picker-content.js",
  USER_FILTERS_PREF: "privacy.trackingprotection.ubo.userFilters",

  _browser: null,
  _active: false,
  _onAddMessage: null,
  _onCancelMessage: null,

  _canPick(browser) {
    if (!browser) {
      return false;
    }
    try {
      let uri = browser.currentURI;
      if (!uri) {
        return false;
      }
      return uri.schemeIs("http") || uri.schemeIs("https");
    } catch (e) {
      return false;
    }
  },

  start(browser) {
    if (this._active) {
      this.stop();
    }
    browser = browser || gBrowser.selectedBrowser;
    if (!this._canPick(browser)) {
      return;
    }

    this._browser = browser;
    this._active = true;

    let mm = browser.messageManager;
    this._onAddMessage = aMessage => {
      let { host, selector } = aMessage.data || {};
      if (host && selector) {
        this._appendFilter(host, selector);
      }
      this.stop();
    };
    this._onCancelMessage = () => this.stop();
    mm.addMessageListener("Neonwolf:PickerAdd", this._onAddMessage);
    mm.addMessageListener("Neonwolf:PickerCancel", this._onCancelMessage);
    mm.loadFrameScript(this.FRAME_SCRIPT, false);
    mm.sendAsyncMessage("Neonwolf:PickerStart");
  },

  stop() {
    if (!this._browser) {
      this._active = false;
      return;
    }
    let mm = this._browser.messageManager;
    mm.sendAsyncMessage("Neonwolf:PickerStop");
    if (this._onAddMessage) {
      mm.removeMessageListener("Neonwolf:PickerAdd", this._onAddMessage);
    }
    if (this._onCancelMessage) {
      mm.removeMessageListener("Neonwolf:PickerCancel", this._onCancelMessage);
    }
    this._onAddMessage = null;
    this._onCancelMessage = null;
    this._browser = null;
    this._active = false;
  },

  _appendFilter(host, selector) {
    let line = `${host}##${selector}`;
    let current = Services.prefs.getStringPref(this.USER_FILTERS_PREF, "");
    let trimmed = current.trimEnd();
    let next = trimmed ? `${trimmed}\n${line}` : line;
    Services.prefs.setStringPref(this.USER_FILTERS_PREF, next);
  },
};