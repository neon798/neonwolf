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
  PREF_SUBSCRIPTIONS: "neonwolf.shields.lists.subscriptions",
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
    "neonwolf-extra",
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

  get _subRows() {
    delete this._subRows;
    return (this._subRows = document.getElementById("neonwolf-lists-sub-rows"));
  },

  get _subInput() {
    delete this._subInput;
    return (this._subInput = document.getElementById(
      "neonwolf-lists-sub-input"
    ));
  },

  get _subError() {
    delete this._subError;
    return (this._subError = document.getElementById(
      "neonwolf-lists-sub-error"
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

  _loadSubscriptions() {
    return Services.prefs
      .getStringPref(this.PREF_SUBSCRIPTIONS, "")
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean);
  },

  _saveSubscriptions(urls) {
    Services.prefs.setStringPref(this.PREF_SUBSCRIPTIONS, urls.join("\n"));
  },

  _setSubError(msg) {
    let err = this._subError;
    if (!err) {
      return;
    }
    err.setAttribute("value", msg || "");
  },

  _renderSubscriptions() {
    let container = this._subRows;
    if (!container) {
      return;
    }
    container.textContent = "";
    let urls = this._loadSubscriptions();
    if (!urls.length) {
      let empty = document.createXULElement("label");
      empty.className = "neonwolf-filters-subscribe-empty";
      empty.setAttribute("value", "No subscribed lists.");
      container.appendChild(empty);
      return;
    }
    for (let url of urls) {
      let row = document.createXULElement("hbox");
      row.className = "neonwolf-lists-row";
      row.setAttribute("align", "center");

      // textContent (not innerHTML) — URL is user/pref-derived.
      let urlLabel = document.createXULElement("label");
      urlLabel.className = "neonwolf-filters-subscribe-item";
      urlLabel.setAttribute("flex", "1");
      urlLabel.setAttribute("crop", "end");
      urlLabel.setAttribute("value", url);
      row.appendChild(urlLabel);

      let removeBtn = document.createXULElement("button");
      removeBtn.className = "neonwolf-lists-btn";
      removeBtn.setAttribute("label", "Remove");
      removeBtn.addEventListener("command", () =>
        this._onSubscribeRemove(url)
      );
      row.appendChild(removeBtn);

      container.appendChild(row);
    }
  },

  _onSubscribeRemove(url) {
    let urls = this._loadSubscriptions().filter(u => u !== url);
    this._saveSubscriptions(urls);
    this._setSubError("");
    this._renderSubscriptions();
  },

  _onSubscribeAdd() {
    let input = this._subInput;
    if (!input) {
      return;
    }
    let raw = input.value.trim();
    this._setSubError("");

    if (!raw) {
      this._setSubError("Enter a URL.");
      return;
    }

    let parsed;
    try {
      parsed = new URL(raw);
    } catch (e) {
      this._setSubError("Invalid URL.");
      return;
    }

    if (parsed.protocol !== "https:") {
      this._setSubError("Only https:// URLs are allowed.");
      return;
    }

    let urls = this._loadSubscriptions();
    if (urls.includes(raw)) {
      this._setSubError("Already subscribed.");
      return;
    }

    urls.push(raw);
    this._saveSubscriptions(urls);
    input.value = "";
    this._renderSubscriptions();
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
    if (aPrefName == this.PREF_SUBSCRIPTIONS) {
      this._renderSubscriptions();
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

    let subAdd = document.getElementById("neonwolf-lists-sub-add");
    if (subAdd) {
      subAdd.addEventListener("command", () => this._onSubscribeAdd());
    }

    window.addEventListener("unload", () => this._onUnload(), { once: true });

    this._lastRefreshSeen = this._getLastRefresh();
    this._syncAutoRefresh();
    this._render();
    this._renderSubscriptions();
  },
};

window.addEventListener("load", () => gNeonwolfShieldsLists.init(), {
  once: true,
});
