/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* eslint-env mozilla/chrome-window */

/**
 * Neonwolf Custom Filters editor (M5 display layer).
 *
 * Reads/writes privacy.trackingprotection.ubo.userFilters. Client-side lint is
 * advisory only — Save is never blocked.
 */
var gNeonwolfShieldsFilters = {
  PREF: "privacy.trackingprotection.ubo.userFilters",
  LINT_DEBOUNCE_MS: 300,
  SAVED_STATUS_MS: 2500,

  _savedValue: "",
  _lintTimer: null,
  _savedTimer: null,
  _invalidLines: [],

  get _editor() {
    delete this._editor;
    return (this._editor = document.getElementById("neonwolf-filters-editor"));
  },

  get _counter() {
    delete this._counter;
    return (this._counter = document.getElementById("neonwolf-filters-counter"));
  },

  get _unsaved() {
    delete this._unsaved;
    return (this._unsaved = document.getElementById("neonwolf-filters-unsaved"));
  },

  get _lintLabel() {
    delete this._lintLabel;
    return (this._lintLabel = document.getElementById("neonwolf-filters-lint"));
  },

  get _statusLabel() {
    delete this._statusLabel;
    return (this._statusLabel = document.getElementById("neonwolf-filters-status"));
  },

  _loadFromPref() {
    return Services.prefs.getStringPref(this.PREF, "");
  },

  _saveToPref(value) {
    Services.prefs.setStringPref(this.PREF, value);
  },

  // Cosmetic separators, longest first so the full separator (and thus the
  // selector after it) is identified correctly.
  COSMETIC_SEPS: ["#@$#", "#@?#", "#@#", "#?#", "#$#", "##"],

  _cosmeticSep(line) {
    for (let sep of this.COSMETIC_SEPS) {
      let idx = line.indexOf(sep);
      if (idx != -1) {
        return { idx, len: sep.length };
      }
    }
    return null;
  },

  /**
   * blank | comment | rule. A leading "#" is only a comment when the line is
   * not a cosmetic rule: generic cosmetics like "##.banner" start with "#" but
   * are rules, whereas "! foo" and "# note" are comments.
   */
  _classifyLine(line) {
    let trimmed = line.trim();
    if (!trimmed) {
      return "blank";
    }
    if (trimmed.startsWith("!")) {
      return "comment";
    }
    if (this._cosmeticSep(trimmed)) {
      return "rule";
    }
    if (trimmed.startsWith("#")) {
      return "comment";
    }
    return "rule";
  },

  /**
   * Conservative per-line lint. Returns 1 if the rule line looks invalid,
   * else 0. Only rule lines are linted; blanks/comments always pass.
   */
  _lintLine(line) {
    if (this._classifyLine(line) != "rule") {
      return 0;
    }

    let trimmed = line.trim();

    let sep = this._cosmeticSep(trimmed);
    if (sep) {
      let selector = trimmed.slice(sep.idx + sep.len).trim();
      return selector ? 0 : 1;
    }

    let dollar = trimmed.indexOf("$");
    let pattern = dollar == -1 ? trimmed : trimmed.slice(0, dollar);
    if (/\s/.test(pattern)) {
      return 1;
    }

    if (dollar != -1) {
      if (trimmed.endsWith("$")) {
        return 1;
      }
      let options = trimmed.slice(dollar + 1);
      if (options.includes(",,") || options.startsWith(",")) {
        return 1;
      }
    }

    return 0;
  },

  _lintText(text) {
    let lines = text.split("\n");
    let invalid = [];
    for (let i = 0; i < lines.length; i++) {
      if (this._lintLine(lines[i])) {
        invalid.push(i + 1);
      }
    }
    return invalid;
  },

  _countRules(text) {
    let rules = 0;
    let comments = 0;
    for (let line of text.split("\n")) {
      let kind = this._classifyLine(line);
      if (kind == "comment") {
        comments++;
      } else if (kind == "rule") {
        rules++;
      }
    }
    return { rules, comments };
  },

  _isDirty() {
    return this._editor.value != this._savedValue;
  },

  _updateCounter() {
    let { rules, comments } = this._countRules(this._editor.value);
    this._counter.setAttribute(
      "value",
      `${rules} rule${rules == 1 ? "" : "s"}, ${comments} comment${comments == 1 ? "" : "s"}`
    );
  },

  _updateUnsaved() {
    this._unsaved.hidden = !this._isDirty();
  },

  _updateLintSummary() {
    let invalid = this._invalidLines;
    if (!invalid.length) {
      this._lintLabel.setAttribute("value", "");
      return;
    }
    let lineList = invalid.join(", ");
    let noun = invalid.length == 1 ? "line looks" : "lines look";
    this._lintLabel.setAttribute(
      "value",
      `${invalid.length} ${noun} invalid — lines ${lineList}`
    );
  },

  _updateChrome() {
    this._updateCounter();
    this._updateUnsaved();
    this._updateLintSummary();
  },

  _scheduleLint() {
    if (this._lintTimer) {
      clearTimeout(this._lintTimer);
    }
    this._lintTimer = setTimeout(() => {
      this._lintTimer = null;
      this._invalidLines = this._lintText(this._editor.value);
      this._updateLintSummary();
    }, this.LINT_DEBOUNCE_MS);
  },

  _showSaved() {
    this._statusLabel.setAttribute("value", "Saved");
    if (this._savedTimer) {
      clearTimeout(this._savedTimer);
    }
    this._savedTimer = setTimeout(() => {
      this._savedTimer = null;
      this._statusLabel.setAttribute("value", "");
    }, this.SAVED_STATUS_MS);
  },

  _seedEditor() {
    this._savedValue = this._loadFromPref();
    this._editor.value = this._savedValue;
    this._invalidLines = this._lintText(this._savedValue);
    this._updateChrome();
  },

  _onSave() {
    let value = this._editor.value;
    this._saveToPref(value);
    this._savedValue = value;
    this._updateChrome();
    this._showSaved();
  },

  _onRevert() {
    this._seedEditor();
    this._statusLabel.setAttribute("value", "");
  },

  _onInput() {
    this._updateCounter();
    this._updateUnsaved();
    this._scheduleLint();
  },

  _onUnload() {
    if (this._lintTimer) {
      clearTimeout(this._lintTimer);
      this._lintTimer = null;
    }
    if (this._savedTimer) {
      clearTimeout(this._savedTimer);
      this._savedTimer = null;
    }
  },

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;

    let saveBtn = document.getElementById("neonwolf-filters-save");
    if (saveBtn) {
      saveBtn.addEventListener("command", () => this._onSave());
    }

    let revertBtn = document.getElementById("neonwolf-filters-revert");
    if (revertBtn) {
      revertBtn.addEventListener("command", () => this._onRevert());
    }

    this._editor.addEventListener("input", () => this._onInput());

    window.addEventListener("unload", () => this._onUnload(), { once: true });

    this._seedEditor();
  },
};

window.addEventListener("load", () => gNeonwolfShieldsFilters.init(), {
  once: true,
});