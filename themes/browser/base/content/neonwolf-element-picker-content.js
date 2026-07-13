/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Neonwolf element picker frame script (content process).
 *
 * Injected per pick session. Highlights hovered elements and builds a
 * cosmetic filter candidate via a uBO-style selector generator. Selector
 * generation stays chrome-side of trust (never a page-provided hook).
 */
(function () {
  if (content.window.__nwPickerSession) {
    return;
  }

  const HIGHLIGHT_ID = "neonwolf-picker-highlight";
  const PANEL_ID = "neonwolf-picker-panel";
  const STYLE_ID = "neonwolf-picker-style";
  const STABLE_CLASS_RE = /^[A-Za-z_][A-Za-z0-9_-]{1,29}$/;
  const MAX_PATH_SEGMENTS = 4;

  let active = false;
  let selectedElement = null;
  let listeners = [];

  function cssEscape(value) {
    if (typeof CSS != "undefined" && CSS.escape) {
      return CSS.escape(value);
    }
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function simpleSelector(el) {
    if (!el || el.nodeType != 1) {
      return "";
    }
    let tag = el.tagName.toLowerCase();
    if (el.id) {
      return `${tag}#${cssEscape(el.id)}`;
    }
    if (el.classList && el.classList.length) {
      return `${tag}.${cssEscape(el.classList[0])}`;
    }
    return tag;
  }

  /** True iff sel matches exactly one node in the document (invalid → false). */
  function unique(sel) {
    try {
      return content.document.querySelectorAll(sel).length === 1;
    } catch (e) {
      return false;
    }
  }

  /** Stable classes: identifier-like, <3 digits (filters hashed CSS modules). Cap 2. */
  function stableClasses(el) {
    let out = [];
    if (!el.classList) {
      return out;
    }
    for (let c of el.classList) {
      if (!STABLE_CLASS_RE.test(c)) {
        continue;
      }
      let digits = 0;
      for (let i = 0; i < c.length; i++) {
        let ch = c.charCodeAt(i);
        if (ch >= 48 && ch <= 57) {
          digits++;
        }
      }
      if (digits >= 3) {
        continue;
      }
      out.push(c);
      if (out.length >= 2) {
        break;
      }
    }
    return out;
  }

  /** :nth-of-type index: same-tag preceding siblings + 1. */
  function nthOfTypeIndex(el) {
    let n = 1;
    let tag = el.tagName;
    for (let sib = el.previousElementSibling; sib; sib = sib.previousElementSibling) {
      if (sib.tagName == tag) {
        n++;
      }
    }
    return n;
  }

  /**
   * True if more than one same-parent sibling matches `segment` (tag+classes).
   * Only same-tag siblings are considered for ambiguity.
   */
  function segmentAmbiguousAmongSiblings(el, segment) {
    let parent = el.parentElement;
    if (!parent) {
      return false;
    }
    let matches = 0;
    let tag = el.tagName;
    for (
      let child = parent.firstElementChild;
      child;
      child = child.nextElementSibling
    ) {
      if (child.tagName != tag) {
        continue;
      }
      try {
        if (child.matches(segment)) {
          matches++;
          if (matches > 1) {
            return true;
          }
        }
      } catch (e) {
        // invalid segment — treat as non-ambiguous
      }
    }
    return false;
  }

  /**
   * Build one path segment for `el`. Returns `{ segment, stopClimb }`.
   * Unique id → `tag#id` and stop climbing; else tag + stable classes +
   * optional :nth-of-type when ambiguous among siblings.
   */
  function pathSegment(el) {
    let tag = el.tagName.toLowerCase();
    if (el.id) {
      let idCandidate = "#" + cssEscape(el.id);
      if (unique(idCandidate)) {
        return { segment: tag + "#" + cssEscape(el.id), stopClimb: true };
      }
    }

    let segment = tag;
    for (let c of stableClasses(el)) {
      segment += "." + cssEscape(c);
    }
    if (segmentAmbiguousAmongSiblings(el, segment)) {
      segment += ":nth-of-type(" + nthOfTypeIndex(el) + ")";
    }
    return { segment, stopClimb: false };
  }

  /**
   * uBO-style selector generator. Pure DOM reads only — never call page
   * functions or hostile content.window hooks.
   */
  function generateSelector(el) {
    if (!el || el.nodeType != 1) {
      return "";
    }

    // Prefer bare #id when unique in the document.
    if (el.id) {
      let idSel = "#" + cssEscape(el.id);
      if (unique(idSel)) {
        return idSel;
      }
    }

    // Bottom-up descendant path, max 4 segments, joined with " > ".
    let parts = [];
    let node = el;
    for (let depth = 0; node && node.nodeType == 1 && depth < MAX_PATH_SEGMENTS; depth++) {
      let { segment, stopClimb } = pathSegment(node);
      parts.unshift(segment);
      let sel = parts.join(" > ");
      if (unique(sel)) {
        return sel;
      }
      if (stopClimb) {
        break;
      }
      node = node.parentElement;
    }

    // Deepest path if it still matches the pick; else simple fallback.
    let deepest = parts.join(" > ");
    if (deepest) {
      try {
        if (el.matches(deepest)) {
          return deepest;
        }
      } catch (e) {
        // fall through to simpleSelector
      }
    }
    return simpleSelector(el);
  }

  function hostKey() {
    return content.location.hostname || "";
  }

  function ensureStyle() {
    if (content.document.getElementById(STYLE_ID)) {
      return;
    }
    let style = content.document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${HIGHLIGHT_ID} {
        position: fixed;
        pointer-events: none;
        z-index: 2147483646;
        border: 2px solid #00ffff;
        background: rgba(0, 255, 255, 0.15);
        box-shadow: 0 0 8px rgba(255, 0, 255, 0.6);
        border-radius: 2px;
        box-sizing: border-box;
      }
      #${PANEL_ID} {
        position: fixed;
        left: 12px;
        right: 12px;
        bottom: 12px;
        z-index: 2147483647;
        font: 12px monospace;
        color: #e0e0ff;
        background: linear-gradient(180deg, #1a0028, #0d001a);
        border: 1px solid rgba(255, 0, 255, 0.4);
        border-radius: 6px;
        padding: 10px 12px;
        box-shadow: 0 0 12px rgba(0, 255, 255, 0.35);
      }
      #${PANEL_ID} .nw-picker-filter {
        display: block;
        margin: 6px 0 10px;
        word-break: break-all;
        color: #00ffff;
      }
      #${PANEL_ID} button {
        margin-right: 8px;
        font: 11px sans-serif;
        background: #2d004f;
        color: #e0e0ff;
        border: 1px solid #ff00ff;
        border-radius: 4px;
        padding: 4px 10px;
        cursor: pointer;
      }
      #${PANEL_ID} button:hover {
        background: #3d0066;
      }
    `;
    content.document.documentElement.appendChild(style);
  }

  function ensureHighlight() {
    let el = content.document.getElementById(HIGHLIGHT_ID);
    if (!el) {
      el = content.document.createElement("div");
      el.id = HIGHLIGHT_ID;
      content.document.documentElement.appendChild(el);
    }
    return el;
  }

  function isPickerNode(node) {
    if (!node) {
      return true;
    }
    if (node.id == HIGHLIGHT_ID || node.id == PANEL_ID) {
      return true;
    }
    if (node.closest && node.closest(`#${PANEL_ID}`)) {
      return true;
    }
    return false;
  }

  function positionHighlight(el) {
    let highlight = ensureHighlight();
    if (!el || isPickerNode(el)) {
      highlight.style.display = "none";
      return;
    }
    let rect = el.getBoundingClientRect();
    highlight.style.display = "block";
    highlight.style.top = `${rect.top}px`;
    highlight.style.left = `${rect.left}px`;
    highlight.style.width = `${rect.width}px`;
    highlight.style.height = `${rect.height}px`;
  }

  function removePanel() {
    let panel = content.document.getElementById(PANEL_ID);
    if (panel) {
      panel.remove();
    }
  }

  function showPreview(el) {
    selectedElement = el;
    removePanel();
    let host = hostKey();
    let selector = generateSelector(el);
    if (!host || !selector) {
      return;
    }

    let panel = content.document.createElement("div");
    panel.id = PANEL_ID;

    // Build with DOM + textContent only — host/selector come from hostile page
    // DOM, so never interpolate them into innerHTML.
    let title = content.document.createElement("div");
    title.textContent = "Cosmetic filter candidate:";
    panel.appendChild(title);

    let filterText = content.document.createElement("span");
    filterText.className = "nw-picker-filter";
    filterText.textContent = `${host}##${selector}`;
    panel.appendChild(filterText);

    let addBtn = content.document.createElement("button");
    addBtn.type = "button";
    addBtn.textContent = "Add filter";
    addBtn.addEventListener("click", () => {
      sendAsyncMessage("Neonwolf:PickerAdd", { host, selector });
      cleanup();
    });
    panel.appendChild(addBtn);

    let cancelBtn = content.document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => {
      sendAsyncMessage("Neonwolf:PickerCancel");
      cleanup();
    });
    panel.appendChild(cancelBtn);

    content.document.documentElement.appendChild(panel);
  }

  function onMouseMove(event) {
    if (!active || selectedElement) {
      return;
    }
    let el = content.document.elementFromPoint(event.clientX, event.clientY);
    while (el && isPickerNode(el)) {
      el = el.parentElement;
    }
    positionHighlight(el);
  }

  function onClick(event) {
    if (!active) {
      return;
    }
    if (content.document.getElementById(PANEL_ID)?.contains(event.target)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    let el = content.document.elementFromPoint(event.clientX, event.clientY);
    while (el && isPickerNode(el)) {
      el = el.parentElement;
    }
    if (el) {
      showPreview(el);
    }
  }

  function onKeyDown(event) {
    if (event.key == "Escape") {
      sendAsyncMessage("Neonwolf:PickerCancel");
      cleanup();
    }
  }

  function addListener(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    listeners.push({ target, type, handler, options });
  }

  function cleanup() {
    active = false;
    selectedElement = null;
    content.window.__nwPickerSession = false;

    for (let { target, type, handler, options } of listeners) {
      target.removeEventListener(type, handler, options);
    }
    listeners = [];

    let highlight = content.document.getElementById(HIGHLIGHT_ID);
    if (highlight) {
      highlight.remove();
    }
    removePanel();
    let style = content.document.getElementById(STYLE_ID);
    if (style) {
      style.remove();
    }
  }

  function start() {
    cleanup();
    active = true;
    content.window.__nwPickerSession = true;
    ensureStyle();
    ensureHighlight();
    addListener(content.document, "mousemove", onMouseMove, true);
    addListener(content.document, "click", onClick, true);
    addListener(content.document, "keydown", onKeyDown, true);
  }

  addMessageListener("Neonwolf:PickerStart", start);
  addMessageListener("Neonwolf:PickerStop", cleanup);
})();