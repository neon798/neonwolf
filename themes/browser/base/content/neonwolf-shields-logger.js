/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* eslint-env mozilla/chrome-window */

/**
 * Neonwolf Shields Logger (M3 frontend).
 *
 * Subscribes to the "neonwolf-blocked-request" observer topic and renders a
 * capped ring buffer of blocking decisions. Display-only — no engine writes.
 */
var gNeonwolfShieldsLogger = {
  TOPIC: "neonwolf-blocked-request",
  MAX_ENTRIES: 5000,
  ROW_HEIGHT: 24,
  URL_MAX_LEN: 48,
  FOLLOW_THRESHOLD_ROWS: 2,

  _entries: [],
  _paused: false,
  _follow: true,
  _pinnedToTop: true,
  _filterText: "",
  _actionFilter: "all",
  _sortColumn: "time",
  _sortDir: "desc",
  // The drawer tracks the entry OBJECT, not its index: in newest-first sort
  // every arriving entry shifts all indexes, and an index-keyed drawer would
  // silently switch entries as the stream advances.
  _selectedEntry: null,
  _drawerOpen: false,
  _rowPool: [],
  _renderPending: false,

  get _scrollbox() {
    delete this._scrollbox;
    return (this._scrollbox = document.getElementById("neonwolf-logger-scroll"));
  },

  get _list() {
    delete this._list;
    return (this._list = document.getElementById("neonwolf-logger-list"));
  },

  get _emptyState() {
    delete this._emptyState;
    return (this._emptyState = document.getElementById("neonwolf-logger-empty"));
  },

  get _statusLabel() {
    delete this._statusLabel;
    return (this._statusLabel = document.getElementById(
      "neonwolf-logger-status-label"
    ));
  },

  get _drawer() {
    delete this._drawer;
    return (this._drawer = document.getElementById("neonwolf-logger-drawer"));
  },

  get _drawerFields() {
    delete this._drawerFields;
    return (this._drawerFields = document.getElementById(
      "neonwolf-logger-drawer-fields"
    ));
  },

  /**
   * nsIObserver entry point for blocking-engine notifications.
   */
  observe(aSubject, aTopic, aData) {
    if (aTopic != this.TOPIC || this._paused) {
      return;
    }
    let entry = this._parseData(aData);
    if (!entry) {
      return;
    }
    this._ingestEntry(entry);
  },

  /**
   * Parse the JSON payload passed as the observer's aData argument.
   */
  _parseData(aData) {
    try {
      return JSON.parse(aData);
    } catch (e) {
      return null;
    }
  },

  /**
   * Append to the ring buffer, dropping the oldest entry at capacity.
   */
  _ingestEntry(entry) {
    this._pushEntry(entry);
    this._scheduleRender();
  },

  _pushEntry(entry) {
    this._entries.push(entry);
    if (this._entries.length > this.MAX_ENTRIES) {
      this._entries.shift();
    }
  },

  /**
   * Case-insensitive filter across site, URL, rule, and list fields.
   */
  _matchesFilter(entry) {
    if (this._actionFilter != "all" && entry.action != this._actionFilter) {
      return false;
    }
    let needle = this._filterText.trim().toLowerCase();
    if (!needle) {
      return true;
    }
    let haystack = [
      entry.site,
      entry.url,
      entry.rule,
      entry.list,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  },

  _filteredEntries() {
    return this._entries.filter(entry => this._matchesFilter(entry));
  },

  _entryTime(entry) {
    let time = new Date(entry.time).getTime();
    return isNaN(time) ? 0 : time;
  },

  _compareEntries(a, b) {
    let dir = this._sortDir == "asc" ? 1 : -1;
    switch (this._sortColumn) {
      case "site": {
        let cmp = (a.site || "").localeCompare(b.site || "", undefined, {
          sensitivity: "base",
        });
        return cmp * dir;
      }
      case "action": {
        let cmp = (a.action || "").localeCompare(b.action || "", undefined, {
          sensitivity: "base",
        });
        return cmp * dir;
      }
      case "time":
      default: {
        return (this._entryTime(a) - this._entryTime(b)) * dir;
      }
    }
  },

  /**
   * Filtered view sorted for display; never mutates the ring buffer.
   */
  _sortedFilteredEntries() {
    return this._filteredEntries().slice().sort((a, b) => this._compareEntries(a, b));
  },

  _isDefaultTimeSort() {
    return this._sortColumn == "time" && this._sortDir == "desc";
  },

  _isNearTop(scrollTop) {
    return scrollTop <= this.ROW_HEIGHT * this.FOLLOW_THRESHOLD_ROWS;
  },

  _followActive() {
    return this._follow && this._isDefaultTimeSort();
  },

  /**
   * Format the backend time field as HH:MM:SS.
   */
  _formatTime(time) {
    let date = new Date(time);
    if (isNaN(date.getTime())) {
      return String(time ?? "");
    }
    return date.toLocaleTimeString("en-US", { hour12: false });
  },

  /**
   * Truncate long URLs in the middle; full value lives in the row tooltip.
   */
  _truncateMiddle(str, maxLen) {
    if (!str || str.length <= maxLen) {
      return str || "";
    }
    let keep = maxLen - 3;
    let front = Math.ceil(keep / 2);
    let back = Math.floor(keep / 2);
    return str.slice(0, front) + "..." + str.slice(str.length - back);
  },

  _ruleListLabel(entry) {
    let rule = entry.rule || "";
    let list = entry.list || "";
    if (rule && list) {
      return `${rule} (${list})`;
    }
    return rule || list || "—";
  },

  _actionClass(action) {
    switch (action) {
      case "blocked":
        return "neonwolf-logger-action-blocked";
      case "redirected":
        return "neonwolf-logger-action-redirected";
      case "allowed":
        return "neonwolf-logger-action-allowed";
      default:
        return "";
    }
  },

  _setLabel(parent, className, value, tooltip) {
    let label = document.createXULElement("label");
    label.className = className;
    label.setAttribute("value", value);
    if (tooltip) {
      label.setAttribute("tooltiptext", tooltip);
    }
    label.setAttribute("crop", "end");
    parent.appendChild(label);
  },

  _fillRow(row, entry) {
    row.setAttribute(
      "tooltiptext",
      `${entry.site} — ${entry.url}`
    );
    while (row.firstChild) {
      row.firstChild.remove();
    }
    this._setLabel(row, "neonwolf-logger-col neonwolf-logger-col-time",
      this._formatTime(entry.time));
    this._setLabel(row, "neonwolf-logger-col neonwolf-logger-col-site",
      entry.site || "—");
    this._setLabel(
      row,
      "neonwolf-logger-col neonwolf-logger-col-url",
      this._truncateMiddle(entry.url, this.URL_MAX_LEN),
      entry.url || ""
    );
    this._setLabel(row, "neonwolf-logger-col neonwolf-logger-col-type",
      entry.type || "—");
    this._setLabel(
      row,
      `neonwolf-logger-col neonwolf-logger-col-action ${this._actionClass(entry.action)}`,
      entry.action || "—"
    );
    this._setLabel(
      row,
      "neonwolf-logger-col neonwolf-logger-col-rule",
      this._ruleListLabel(entry),
      this._ruleListLabel(entry)
    );
  },

  _borrowRow(index) {
    if (index < this._rowPool.length) {
      return this._rowPool[index];
    }
    let row = document.createXULElement("hbox");
    row.className = "neonwolf-logger-row";
    row.setAttribute("align", "center");
    this._rowPool.push(row);
    return row;
  },

  _entryAtIndex(index) {
    let filtered = this._sortedFilteredEntries();
    if (index < 0 || index >= filtered.length) {
      return null;
    }
    return filtered[index];
  },

  _openDrawer(entry) {
    if (!entry) {
      return;
    }
    this._selectedEntry = entry;
    this._drawerOpen = true;
    this._drawer.hidden = false;
    this._updateDrawer();
    this._scheduleRender();
  },

  _closeDrawer() {
    this._drawerOpen = false;
    this._selectedEntry = null;
    this._drawer.hidden = true;
    this._scheduleRender();
  },

  _updateDrawer() {
    let entry = this._selectedEntry;
    let fields = this._drawerFields;
    if (!entry || !fields) {
      this._closeDrawer();
      return;
    }

    fields.textContent = "";
    let keys = Object.keys(entry).sort();
    for (let key of keys) {
      let row = document.createXULElement("hbox");
      row.className = "neonwolf-logger-drawer-row";
      row.setAttribute("align", "start");

      let keyLabel = document.createXULElement("label");
      keyLabel.className = "neonwolf-logger-drawer-key";
      keyLabel.setAttribute("value", `${key}:`);
      row.appendChild(keyLabel);

      let valueLabel = document.createXULElement("label");
      valueLabel.className = "neonwolf-logger-drawer-value";
      let value = entry[key];
      valueLabel.textContent = value === undefined || value === null
        ? ""
        : String(value);
      valueLabel.setAttribute("crop", "none");
      row.appendChild(valueLabel);

      fields.appendChild(row);
    }
  },

  _copyDrawerEntry() {
    let entry = this._selectedEntry;
    if (!entry) {
      return;
    }
    try {
      let clipboard = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(
        Ci.nsIClipboardHelper
      );
      clipboard.copyString(JSON.stringify(entry, null, 2));
    } catch (e) {}
  },

  _onRowClick(index) {
    let entry = this._entryAtIndex(index);
    if (!entry || (this._drawerOpen && this._selectedEntry === entry)) {
      return;
    }
    this._openDrawer(entry);
  },

  _onDrawerKeydown(event) {
    if (event.key == "Escape" && this._drawerOpen) {
      this._closeDrawer();
    }
  },

  _updateStats() {
    let total = this._entries.length;
    let blocked = 0;
    let redirected = 0;
    let allowed = 0;
    let blockedBySite = new Map();

    for (let entry of this._entries) {
      switch (entry.action) {
        case "blocked":
          blocked++;
          {
            let site = entry.site || "";
            blockedBySite.set(site, (blockedBySite.get(site) || 0) + 1);
          }
          break;
        case "redirected":
          redirected++;
          break;
        case "allowed":
          allowed++;
          break;
      }
    }

    let topSite = "—";
    let topCount = 0;
    for (let [site, count] of blockedBySite) {
      if (count > topCount) {
        topCount = count;
        topSite = site || "—";
      }
    }

    let totalEl = document.getElementById("neonwolf-logger-stat-total");
    if (totalEl) {
      totalEl.setAttribute(
        "value",
        `Buffer: ${total} total (unfiltered)`
      );
    }

    let actionsEl = document.getElementById("neonwolf-logger-stat-actions");
    if (actionsEl) {
      actionsEl.setAttribute(
        "value",
        `Blocked ${blocked} · Redirected ${redirected} · Allowed ${allowed} (unfiltered)`
      );
    }

    let topEl = document.getElementById("neonwolf-logger-stat-top-site");
    if (topEl) {
      topEl.setAttribute(
        "value",
        topCount
          ? `Top blocked site: ${topSite} (${topCount}, unfiltered)`
          : "Top blocked site: — (unfiltered)"
      );
    }
  },

  _updateSortHeaders() {
    for (let column of ["time", "site", "action"]) {
      let el = document.getElementById(`neonwolf-logger-header-${column}`);
      if (!el) {
        continue;
      }
      if (!el.hasAttribute("data-base-label")) {
        el.setAttribute("data-base-label", el.getAttribute("value"));
      }
      let base = el.getAttribute("data-base-label");
      if (this._sortColumn == column) {
        let arrow = this._sortDir == "asc" ? " \u25b2" : " \u25bc";
        el.setAttribute("value", base + arrow);
        el.classList.add("neonwolf-logger-col-header-active");
      } else {
        el.setAttribute("value", base);
        el.classList.remove("neonwolf-logger-col-header-active");
      }
    }
  },

  _updateFollowCheckboxState() {
    let follow = document.getElementById("neonwolf-logger-follow");
    if (!follow) {
      return;
    }
    let enabled = this._isDefaultTimeSort();
    follow.disabled = !enabled;
    if (!enabled) {
      follow.setAttribute(
        "tooltiptext",
        "Follow only applies with newest-first Time sort"
      );
    } else {
      follow.removeAttribute("tooltiptext");
    }
  },

  /**
   * Coalesce rapid observer bursts into a single paint.
   */
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

  /**
   * Virtualized render: only mount rows visible in the scroll viewport.
   */
  _render() {
    let filtered = this._sortedFilteredEntries();
    let total = filtered.length;
    let list = this._list;
    let scrollbox = this._scrollbox;
    let empty = this._emptyState;
    let scrollTop = scrollbox.scrollTop;
    let shouldPin = this._followActive() && this._pinnedToTop;

    this._updateStats();
    this._updateSortHeaders();
    this._updateFollowCheckboxState();

    empty.hidden = total > 0;
    scrollbox.hidden = total == 0;

    let pausedSuffix = this._paused ? " — paused" : "";
    this._statusLabel.value = `${total} of ${this._entries.length} shown${pausedSuffix}`;

    if (!total) {
      list.textContent = "";
      list.style.height = "0px";
      return;
    }

    let viewHeight = scrollbox.clientHeight;
    let start = Math.max(0, Math.floor(scrollTop / this.ROW_HEIGHT) - 2);
    let visibleCount = Math.ceil(viewHeight / this.ROW_HEIGHT) + 4;
    let end = Math.min(total, start + visibleCount);

    list.style.height = `${total * this.ROW_HEIGHT}px`;
    list.textContent = "";

    for (let i = start; i < end; i++) {
      let row = this._borrowRow(i - start);
      this._fillRow(row, filtered[i]);
      row.style.transform = `translateY(${i * this.ROW_HEIGHT}px)`;
      row.setAttribute("data-row-index", String(i));
      row.classList.toggle(
        "neonwolf-logger-row-selected",
        this._drawerOpen && filtered[i] === this._selectedEntry
      );
      list.appendChild(row);
    }

    if (this._drawerOpen) {
      this._updateDrawer();
    }

    if (shouldPin) {
      scrollbox.scrollTop = 0;
    }
  },

  _onFilterInput() {
    let filter = document.getElementById("neonwolf-logger-filter");
    this._filterText = filter ? filter.value : "";
    this._scheduleRender();
  },

  _onActionFilterChange() {
    let menulist = document.getElementById("neonwolf-logger-action-filter");
    this._actionFilter = menulist ? menulist.value : "all";
    this._scheduleRender();
  },

  _onFollowChange() {
    let follow = document.getElementById("neonwolf-logger-follow");
    this._follow = follow ? follow.checked : true;
    if (this._follow && this._isDefaultTimeSort()) {
      this._pinnedToTop = this._isNearTop(this._scrollbox.scrollTop);
    }
    this._scheduleRender();
  },

  _onCopyClick() {
    let payload = JSON.stringify(this._sortedFilteredEntries(), null, 2);
    // nsIClipboardHelper is synchronous and always available in chrome;
    // navigator.clipboard.writeText rejects asynchronously, which a try/catch
    // here could not intercept.
    try {
      let clipboard = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(
        Ci.nsIClipboardHelper
      );
      clipboard.copyString(payload);
    } catch (e) {}
  },

  _onHeaderClick(column) {
    if (this._sortColumn == column) {
      this._sortDir = this._sortDir == "asc" ? "desc" : "asc";
    } else {
      this._sortColumn = column;
      this._sortDir = column == "time" ? "desc" : "asc";
    }
    this._scheduleRender();
  },

  _onPauseClick() {
    this._paused = !this._paused;
    let btn = document.getElementById("neonwolf-logger-pause");
    if (btn) {
      btn.setAttribute("label", this._paused ? "Resume" : "Pause");
    }
    this._scheduleRender();
  },

  _onClearClick() {
    this._entries = [];
    this._closeDrawer();
    this._scheduleRender();
  },

  _onScroll() {
    this._pinnedToTop = this._isNearTop(this._scrollbox.scrollTop);
    this._scheduleRender();
  },

  _onUnload() {
    Services.obs.removeObserver(this, this.TOPIC);
    delete window.__nwLoggerInject;
  },

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;

    Services.obs.addObserver(this, this.TOPIC);

    let filter = document.getElementById("neonwolf-logger-filter");
    if (filter) {
      filter.addEventListener("input", () => this._onFilterInput());
    }

    let actionFilter = document.getElementById("neonwolf-logger-action-filter");
    if (actionFilter) {
      actionFilter.addEventListener("command", () =>
        this._onActionFilterChange()
      );
      actionFilter.value = "all";
    }

    let follow = document.getElementById("neonwolf-logger-follow");
    if (follow) {
      follow.addEventListener("command", () => this._onFollowChange());
      this._follow = follow.checked;
    }

    let copyBtn = document.getElementById("neonwolf-logger-copy");
    if (copyBtn) {
      copyBtn.addEventListener("command", () => this._onCopyClick());
    }

    let pauseBtn = document.getElementById("neonwolf-logger-pause");
    if (pauseBtn) {
      pauseBtn.addEventListener("command", () => this._onPauseClick());
    }

    let clearBtn = document.getElementById("neonwolf-logger-clear");
    if (clearBtn) {
      clearBtn.addEventListener("command", () => this._onClearClick());
    }

    for (let column of ["time", "site", "action"]) {
      let header = document.getElementById(`neonwolf-logger-header-${column}`);
      if (header) {
        header.addEventListener("click", () => this._onHeaderClick(column));
      }
    }

    this._list.addEventListener("click", event => {
      let row = event.target.closest(".neonwolf-logger-row");
      if (!row) {
        return;
      }
      let index = parseInt(row.getAttribute("data-row-index"), 10);
      if (!isNaN(index)) {
        this._onRowClick(index);
      }
    });

    let drawerCopy = document.getElementById("neonwolf-logger-drawer-copy");
    if (drawerCopy) {
      drawerCopy.addEventListener("command", () => this._copyDrawerEntry());
    }

    let drawerClose = document.getElementById("neonwolf-logger-drawer-close");
    if (drawerClose) {
      drawerClose.addEventListener("command", () => this._closeDrawer());
    }

    this._scrollbox.addEventListener("scroll", () => this._onScroll());
    window.addEventListener("keydown", event => this._onDrawerKeydown(event));
    window.addEventListener("unload", () => this._onUnload(), { once: true });
    window.addEventListener("resize", () => this._scheduleRender());

    // DEV ONLY: inject fake entries for manual testing without the backend.
    window.__nwLoggerInject = entry => {
      if (!entry || typeof entry != "object") {
        return;
      }
      gNeonwolfShieldsLogger._ingestEntry(entry);
    };

    this._render();
  },
};

window.addEventListener("load", () => gNeonwolfShieldsLogger.init(), {
  once: true,
});