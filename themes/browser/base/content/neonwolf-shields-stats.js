/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* eslint-env mozilla/chrome-window */

/**
 * Neonwolf Shields Stats dashboard (M3 frontend).
 *
 * Session-local aggregates from the "neonwolf-blocked-request" topic.
 * Display-only — no engine writes.
 */
var gNeonwolfShieldsStats = {
  TOPIC: "neonwolf-blocked-request",
  BUCKET_COUNT: 10,
  BUCKET_MS: 60000,
  BUCKET_REFRESH_MS: 30000,
  TOP_SITES_LIMIT: 10,

  // Incremental aggregates instead of retained raw entries: a long session
  // would otherwise grow the buffer without bound and re-walk all of it on
  // every render. Only the recent blocked timestamps (10-minute window for
  // the per-minute chart) are kept as an array.
  _total: 0,
  _actions: { blocked: 0, redirected: 0, allowed: 0 },
  _typeCounts: new Map(),
  _siteBlockedCounts: new Map(),
  _recentBlockedTimes: [],
  _renderPending: false,
  _bucketTimer: null,

  get _emptyState() {
    delete this._emptyState;
    return (this._emptyState = document.getElementById("neonwolf-stats-empty"));
  },

  get _scrollbox() {
    delete this._scrollbox;
    return (this._scrollbox = document.getElementById("neonwolf-stats-scroll"));
  },

  /**
   * nsIObserver entry point for blocking-engine notifications.
   */
  observe(aSubject, aTopic, aData) {
    if (aTopic != this.TOPIC) {
      return;
    }
    let entry = this._parseData(aData);
    if (!entry) {
      return;
    }
    this._ingestEntry(entry);
  },

  _parseData(aData) {
    try {
      return JSON.parse(aData);
    } catch (e) {
      return null;
    }
  },

  _ingestEntry(entry) {
    this._total++;
    if (entry.action in this._actions) {
      this._actions[entry.action]++;
    }
    let type = entry.type || "(unknown)";
    this._typeCounts.set(type, (this._typeCounts.get(type) || 0) + 1);
    if (entry.action == "blocked") {
      let site = entry.site || "(empty)";
      this._siteBlockedCounts.set(
        site,
        (this._siteBlockedCounts.get(site) || 0) + 1
      );
      let time = this._entryTime(entry);
      this._recentBlockedTimes.push(time || Date.now());
      this._pruneRecent();
    }
    this._scheduleRender();
  },

  _pruneRecent() {
    let cutoff = Date.now() - this.BUCKET_COUNT * this.BUCKET_MS;
    let drop = 0;
    while (
      drop < this._recentBlockedTimes.length &&
      this._recentBlockedTimes[drop] < cutoff
    ) {
      drop++;
    }
    if (drop) {
      this._recentBlockedTimes.splice(0, drop);
    }
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

  _entryTime(entry) {
    let time = new Date(entry.time).getTime();
    return isNaN(time) ? 0 : time;
  },

  _byTypeCounts() {
    return [...this._typeCounts.entries()].sort((a, b) => b[1] - a[1]);
  },

  _topBlockedSites() {
    return [...this._siteBlockedCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, this.TOP_SITES_LIMIT);
  },

  /**
   * 60s buckets for the last 10 minutes; index 0 = oldest (left).
   */
  _perMinuteBuckets() {
    this._pruneRecent();
    let buckets = new Array(this.BUCKET_COUNT).fill(0);
    let now = Date.now();
    for (let time of this._recentBlockedTimes) {
      let age = now - time;
      if (age < 0 || age >= this.BUCKET_COUNT * this.BUCKET_MS) {
        continue;
      }
      let slot = this.BUCKET_COUNT - 1 - Math.floor(age / this.BUCKET_MS);
      buckets[slot]++;
    }
    return buckets;
  },

  _setCounter(id, value) {
    let el = document.getElementById(id);
    if (el) {
      el.setAttribute("value", String(value));
    }
  },

  _renderByType(rows, maxCount) {
    let container = document.getElementById("neonwolf-stats-by-type");
    if (!container) {
      return;
    }
    container.textContent = "";
    if (!rows.length) {
      let empty = document.createXULElement("label");
      empty.className = "neonwolf-stats-muted";
      empty.setAttribute("value", "No entries");
      container.appendChild(empty);
      return;
    }
    for (let [type, count] of rows) {
      let row = document.createXULElement("hbox");
      row.className = "neonwolf-stats-type-row";
      row.setAttribute("align", "center");

      let label = document.createXULElement("label");
      label.className = "neonwolf-stats-type-label";
      label.setAttribute("value", type);
      label.setAttribute("crop", "end");
      row.appendChild(label);

      let barTrack = document.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "div"
      );
      barTrack.className = "neonwolf-stats-bar-track";
      let barFill = document.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "div"
      );
      barFill.className = "neonwolf-stats-bar-fill neonwolf-stats-bar-fill-type";
      barFill.style.width = `${Math.round((count / maxCount) * 100)}%`;
      barTrack.appendChild(barFill);
      row.appendChild(barTrack);

      let countLabel = document.createXULElement("label");
      countLabel.className = "neonwolf-stats-type-count";
      countLabel.setAttribute("value", String(count));
      row.appendChild(countLabel);

      container.appendChild(row);
    }
  },

  _renderTopSites(rows, maxCount) {
    let container = document.getElementById("neonwolf-stats-top-sites");
    if (!container) {
      return;
    }
    container.textContent = "";
    if (!rows.length) {
      let empty = document.createXULElement("label");
      empty.className = "neonwolf-stats-muted";
      empty.setAttribute("value", "No blocked sites yet");
      container.appendChild(empty);
      return;
    }
    for (let [site, count] of rows) {
      let row = document.createXULElement("hbox");
      row.className = "neonwolf-stats-site-row";
      row.setAttribute("align", "center");

      let label = document.createXULElement("label");
      label.className = "neonwolf-stats-site-label";
      label.setAttribute("value", site);
      label.setAttribute("crop", "end");
      row.appendChild(label);

      let barTrack = document.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "div"
      );
      barTrack.className = "neonwolf-stats-bar-track neonwolf-stats-bar-track-narrow";
      let barFill = document.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "div"
      );
      barFill.className = "neonwolf-stats-bar-fill neonwolf-stats-bar-fill-site";
      barFill.style.width = `${Math.round((count / maxCount) * 100)}%`;
      barTrack.appendChild(barFill);
      row.appendChild(barTrack);

      let countLabel = document.createXULElement("label");
      countLabel.className = "neonwolf-stats-site-count";
      countLabel.setAttribute("value", String(count));
      row.appendChild(countLabel);

      container.appendChild(row);
    }
  },

  _renderPerMinute(buckets) {
    let container = document.getElementById("neonwolf-stats-per-minute");
    if (!container) {
      return;
    }
    container.textContent = "";
    let max = Math.max(1, ...buckets);
    for (let i = 0; i < buckets.length; i++) {
      let col = document.createXULElement("vbox");
      col.className = "neonwolf-stats-minute-col";
      col.setAttribute("align", "center");

      let barOuter = document.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "div"
      );
      barOuter.className = "neonwolf-stats-minute-bar-outer";
      let barInner = document.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "div"
      );
      barInner.className = "neonwolf-stats-minute-bar-inner";
      barInner.style.height = `${Math.round((buckets[i] / max) * 100)}%`;
      barOuter.appendChild(barInner);
      col.appendChild(barOuter);

      let count = document.createXULElement("label");
      count.className = "neonwolf-stats-minute-count";
      count.setAttribute("value", String(buckets[i]));
      col.appendChild(count);

      container.appendChild(col);
    }
  },

  _render() {
    let total = this._total;
    let hasData = total > 0;

    this._emptyState.hidden = hasData;
    this._scrollbox.hidden = !hasData;

    if (!hasData) {
      return;
    }

    this._setCounter("neonwolf-stats-total", total);
    this._setCounter("neonwolf-stats-blocked", this._actions.blocked);
    this._setCounter("neonwolf-stats-redirected", this._actions.redirected);
    this._setCounter("neonwolf-stats-allowed", this._actions.allowed);

    let byType = this._byTypeCounts();
    let typeMax = byType.length ? byType[0][1] : 1;
    this._renderByType(byType, typeMax);

    let topSites = this._topBlockedSites();
    let siteMax = topSites.length ? topSites[0][1] : 1;
    this._renderTopSites(topSites, siteMax);

    this._renderPerMinute(this._perMinuteBuckets());
  },

  _onClearClick() {
    this._total = 0;
    this._actions = { blocked: 0, redirected: 0, allowed: 0 };
    this._typeCounts = new Map();
    this._siteBlockedCounts = new Map();
    this._recentBlockedTimes = [];
    this._scheduleRender();
  },

  _startBucketRefresh() {
    this._bucketTimer = setInterval(() => {
      if (this._total) {
        this._scheduleRender();
      }
    }, this.BUCKET_REFRESH_MS);
  },

  _onUnload() {
    Services.obs.removeObserver(this, this.TOPIC);
    if (this._bucketTimer) {
      clearInterval(this._bucketTimer);
      this._bucketTimer = null;
    }
    delete window.__nwStatsInject;
  },

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;

    Services.obs.addObserver(this, this.TOPIC);

    let clearBtn = document.getElementById("neonwolf-stats-clear");
    if (clearBtn) {
      clearBtn.addEventListener("command", () => this._onClearClick());
    }

    window.addEventListener("unload", () => this._onUnload(), { once: true });
    window.addEventListener("resize", () => this._scheduleRender());

    this._startBucketRefresh();

    // DEV ONLY: inject fake entries for manual testing without the backend.
    window.__nwStatsInject = entry => {
      if (!entry || typeof entry != "object") {
        return;
      }
      gNeonwolfShieldsStats._ingestEntry(entry);
    };

    this._render();
  },
};

window.addEventListener("load", () => gNeonwolfShieldsStats.init(), {
  once: true,
});