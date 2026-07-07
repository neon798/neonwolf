/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* eslint-env mozilla/chrome-window */

/**
 * Neonwolf filter-list status panel (display layer).
 */
var gNeonwolfShieldsLists = {
  PREF_LAST_REFRESH: "neonwolf.shields.lists.lastRefresh",
  PREF_AUTO_REFRESH: "neonwolf.shields.lists.autoRefresh",
  PREF_REFRESH_NOW: "neonwolf.shields.lists.refreshNow",
  OBS_BRANCH: "neonwolf.shields.lists.",

  BUNDLED_LISTS: [
    "easylist",
    "easyprivacy",
    "ubo-filters",
    "ubo-badware",
    "ubo-privacy",
    "ubo-quickfixes",
    "peterlowe",
    "adguard-base",
    "adguard-mobile",
    "adguard-tracking",
  ],

  _refreshPending: false,
  _lastRefreshSeen: 0,
  _renderPending: false,

  get _rows() {
    delete this._rows;
    return (this._rows = document.getElementById("neonwolf-lists-rows"));
  },

  get _lastRefreshLabel() {
    delete this._lastRefreshLabel;
    return (this._lastRefreshLabel = document.getElementById(
      "neonwolf-lists-last-refresh"
    ));
  },

  get _refreshStatus() {
    delete this._refreshStatus;
    return (this._refreshStatus = document.getElementById(
      "neonwolf-lists-refresh-status"
    ));
  },

  _getLastRefresh() {
    return Services.prefs.getIntPref(this.PREF_LAST_REFRESH, 0);
  },

  // lastRefresh is epoch SECONDS (getIntPref is 32-bit; ms would overflow).
  _formatRefresh(seconds) {
    if (!seconds) {
      return "Never (bundled)";
    }
    return new Date(seconds * 1000).toLocaleString();
  },

  _scheduleRender() {
    if (this._renderPending) {
      return;
    }
    this._renderPending = true;
    window.requestAnimationFrame(() => {
      this._renderPending = false;
      this._render();
    });
  },

  _render() {
    let lastRefresh = this._getLastRefresh();
    let formatted = this._formatRefresh(lastRefresh);

    this._lastRefreshLabel.setAttribute(
      "value",
      `Last refresh: ${formatted}`
    );

    if (this._refreshPending && lastRefresh != this._lastRefreshSeen) {
      this._refreshPending = false;
      this._refreshStatus.setAttribute("value", "");
    }

    let container = this._rows;
    container.textContent = "";

    for (let name of this.BUNDLED_LISTS) {
      let row = document.createXULElement("hbox");
      row.className = "neonwolf-lists-row";
      row.setAttribute("align", "center");

      let nameLabel = document.createXULElement("label");
      nameLabel.className = "neonwolf-lists-col-name";
      nameLabel.setAttribute("value", name);
      row.appendChild(nameLabel);

      let timeLabel = document.createXULElement("label");
      timeLabel.className = "neonwolf-lists-col-updated";
      timeLabel.setAttribute("value", formatted);
      row.appendChild(timeLabel);

      container.appendChild(row);
    }
  },

  _syncAutoRefresh() {
    let checkbox = document.getElementById("neonwolf-lists-auto-refresh");
    if (!checkbox) {
      return;
    }
    checkbox.checked = Services.prefs.getBoolPref(
      this.PREF_AUTO_REFRESH,
      true
    );
  },

  _onAutoRefreshChange() {
    let checkbox = document.getElementById("neonwolf-lists-auto-refresh");
    if (!checkbox) {
      return;
    }
    Services.prefs.setBoolPref(this.PREF_AUTO_REFRESH, checkbox.checked);
  },

  _onRefreshNow() {
    this._lastRefreshSeen = this._getLastRefresh();
    this._refreshPending = true;
    this._refreshStatus.setAttribute("value", "refreshing…");
    Services.prefs.setBoolPref(this.PREF_REFRESH_NOW, true);
  },

  observe(aSubject, aTopic, aPrefName) {
    if (aTopic != "nsPref:changed") {
      return;
    }
    if (aPrefName == this.PREF_AUTO_REFRESH) {
      this._syncAutoRefresh();
    }
    if (
      aPrefName == this.PREF_LAST_REFRESH ||
      aPrefName == this.PREF_REFRESH_NOW
    ) {
      this._scheduleRender();
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

    let auto = document.getElementById("neonwolf-lists-auto-refresh");
    if (auto) {
      auto.addEventListener("command", () => this._onAutoRefreshChange());
    }

    let refreshBtn = document.getElementById("neonwolf-lists-refresh-now");
    if (refreshBtn) {
      refreshBtn.addEventListener("command", () => this._onRefreshNow());
    }

    window.addEventListener("unload", () => this._onUnload(), { once: true });

    this._lastRefreshSeen = this._getLastRefresh();
    this._syncAutoRefresh();
    this._render();
  },
};

window.addEventListener("load", () => gNeonwolfShieldsLists.init(), {
  once: true,
});