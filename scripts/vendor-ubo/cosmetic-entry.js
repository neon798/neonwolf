/*******************************************************************************

    uBlock Origin - a comprehensive, efficient content blocker
    Copyright (C) 2014-present Raymond Hill
    SPDX-License-Identifier: GPL-3.0-or-later
    Home: https://github.com/gorhill/uBlock

    Neonwolf adaptation: uBlock Origin's cosmetic + scriptlet filtering engines
    (cosmetic-filtering.js + scriptlet-filtering-core.js) bundled to run
    natively in Firefox privileged JS -- no extension, "powered by uBlock".

    Rather than importing static-ext-filtering.js (which pulls in the full
    scriptlet-filtering.js -> background.js -> the whole extension), this
    imports the two headless-capable cores directly and replicates the ~40-line
    compile/load dispatch from static-ext-filtering.js. Browser globals uBO's
    cores reach for (vAPI.tabs/warSecret/defer, uB.hiddenSettings, logger) are
    provided as inert stubs below, before those modules are imported.

*/

// The vapi-stub establishes the inert browser globals uBO's cores read at
// module-evaluation time (e.g. cosmetic-filtering.js runs `new
// CosmeticFilteringEngine()` at import, which touches vAPI.defer). It MUST be
// the first import so it evaluates before any uBO module. Tab CSS injection is
// neutralized here; our actor injects the returned selectors itself.
import 'ubo-src/vapi-stub.js';

import * as sfp from '@gorhill/ubo-core/js/static-filtering-parser.js';
import {
  CompiledListReader,
  CompiledListWriter,
} from '@gorhill/ubo-core/js/static-filtering-io.js';
import { LineIterator } from '@gorhill/ubo-core/js/text-utils.js';

import cosmeticFilteringEngine from 'ubo-src/cosmetic-filtering.js';
import { ScriptletFilteringEngine } from 'ubo-src/scriptlet-filtering-core.js';
import { redirectEngine as reng } from 'ubo-src/redirect-engine.js';

const scriptletEngine = new ScriptletFilteringEngine();

// --- Compile dispatch (mirrors static-ext-filtering.js compile) --------------
function compileExtended(parser, writer) {
  if (parser.isExtendedFilter() === false) { return false; }
  if (parser.hasError()) { return true; }
  if (parser.isScriptletFilter()) {
    scriptletEngine.compile(parser, writer);
    return true;
  }
  // Response-header + HTML filtering are intentionally dropped (not served to
  // the DOM actor); their filters are simply not compiled.
  if (parser.isResponseheaderFilter()) { return true; }
  if (parser.isHtmlFilter()) { return true; }
  if (parser.isCosmeticFilter()) {
    cosmeticFilteringEngine.compile(parser, writer);
    return true;
  }
  return true;
}

function compileList({ name, raw }, writer) {
  if (typeof raw !== 'string' || raw === '') { return; }
  if (name) { writer.properties.set('name', name); }
  const parser = new sfp.AstFilterParser({ maxTokenLength: 256 });
  const lineIter = new LineIterator(raw);
  while (lineIter.eot() === false) {
    let line = lineIter.next();
    while (line.endsWith(' \\')) {
      if (lineIter.peek(4) !== '    ') { break; }
      line = line.slice(0, -2).trim() + lineIter.next().trim();
    }
    parser.parse(line);
    if (parser.isFilter() === false) { continue; }
    if (parser.isExtendedFilter()) {
      compileExtended(parser, writer);
    }
    // Network filters are handled by the SNFE (UBOSnfe.sys.mjs); ignore here.
  }
  return writer.toString();
}

function loadCompiled(compiled) {
  const reader = new CompiledListReader(compiled);
  cosmeticFilteringEngine.fromCompiledContent(reader, {});
  scriptletEngine.fromCompiledContent(reader, {});
}

// --- djb2 token hash (MUST mirror the content-script surveyor's copy) ---------
// Ported verbatim from cosmetic-filtering.js so the surveyor and engine agree.
export function hashFromStr(type, s) {
  const len = s.length;
  const step = (len + 7) >>> 3;
  let hash = ((type << 5) + type) ^ len;
  for (let i = 0; i < len; i += step) {
    hash = ((hash << 5) + hash) ^ s.charCodeAt(i);
  }
  return hash & 0xFFFFFF;
}

// --- Public API ---------------------------------------------------------------
export const UBOCosmeticEngine = {
  _frozen: false,

  /**
   * Load uBO scriptlet/redirect resources (uBO resource text: the combined
   * `/// name` + body format redirect-engine.resourcesFromString parses).
   */
  useResources(text) {
    reng.reset();
    if (typeof text === 'string' && text !== '') {
      reng.resourcesFromString(text);
    }
    reng.freeze();
  },

  useLists(lists) {
    cosmeticFilteringEngine.reset();
    scriptletEngine.reset();
    this._frozen = false;
    for (const { name, raw } of lists) {
      const writer = new CompiledListWriter();
      const compiled = compileList({ name, raw }, writer);
      if (compiled) { loadCompiled(compiled); }
    }
    cosmeticFilteringEngine.freeze();
    scriptletEngine.freeze();
    this._frozen = true;
  },

  /**
   * Specific (hostname-keyed) cosmetic result for a document.
   * Returns { hide: [selectors], procedural: [json], disableSurveyor }.
   */
  retrieveSpecific(hostname, domain, url) {
    const r = cosmeticFilteringEngine.retrieveSpecificSelectors(
      { hostname, domain, url },
      { noSpecificCosmeticFiltering: false, noGenericCosmeticFiltering: true }
    );
    return r;
  },

  /**
   * Generic cosmetic result for surveyed token hashes.
   * hashes: number[] from the surveyor (hashFromStr of class/id tokens).
   */
  retrieveGeneric(hostname, hashes, exceptions) {
    return cosmeticFilteringEngine.retrieveGenericSelectors({
      hostname,
      hashes,
      exceptions: exceptions || [],
    });
  },

  /**
   * Assembled MAIN-world scriptlet payload for a document, or '' if none.
   */
  retrieveScriptlets(hostname, domain, url) {
    const r = scriptletEngine.retrieve(
      { hostname, domain, url },
      { scriptletGlobals: {} }
    );
    if (!r) { return ''; }
    return r.mainWorld || '';
  },
};
