/*******************************************************************************

    uBlock Origin - a comprehensive, efficient content blocker
    Copyright (C) 2014-present Raymond Hill

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see {http://www.gnu.org/licenses/}.

    Home: https://github.com/gorhill/uBlock
*/

// Neonwolf adaptation of @gorhill/ubo-core platform/nodejs/index.js for
// Firefox privileged JS: no Node built-ins (fs/path/url/util/module). PSL
// data is passed in by the caller (serialized selfie or raw text) instead of
// being read from disk, and WASM support is dropped (JS paths only).

import * as s14e from '@gorhill/ubo-core/js/s14e-serializer.js';
import * as sfp from '@gorhill/ubo-core/js/static-filtering-parser.js';

import {
    CompiledListReader,
    CompiledListWriter,
} from '@gorhill/ubo-core/js/static-filtering-io.js';

import { FilteringContext } from '@gorhill/ubo-core/js/filtering-context.js';
import { LineIterator } from '@gorhill/ubo-core/js/text-utils.js';
import publicSuffixList from '@gorhill/ubo-core/lib/publicsuffixlist/publicsuffixlist.js';
import snfe from '@gorhill/ubo-core/js/static-net-filtering.js';

/******************************************************************************/

function pslInit({ selfie, raw, toAscii } = {}) {
    if ( selfie !== undefined && selfie !== null ) {
        publicSuffixList.fromSelfie(selfie);
        return publicSuffixList;
    }
    if ( typeof raw === 'string' && raw.trim() !== '' ) {
        publicSuffixList.parse(raw, toAscii || (s => s));
        return publicSuffixList;
    }
    return null;
}

/******************************************************************************/

function compileList({ name, raw }, compiler, writer, options = {}) {
    if ( typeof raw !== 'string' || raw === '' ) { return; }
    const lineIter = new LineIterator(raw);
    const events = Array.isArray(options.events) ? options.events : undefined;

    if ( name ) {
        writer.properties.set('name', name);
    }

    const parser = new sfp.AstFilterParser({
        maxTokenLength: snfe.MAX_TOKEN_LENGTH,
    });

    while ( lineIter.eot() === false ) {
        let line = lineIter.next();
        while ( line.endsWith(' \\') ) {
            if ( lineIter.peek(4) !== '    ' ) { break; }
            line = line.slice(0, -2).trim() + lineIter.next().trim();
        }
        parser.parse(line);
        if ( parser.isFilter() === false ) { continue; }
        if ( parser.isNetworkFilter() === false ) { continue; }
        if ( compiler.compile(parser, writer) ) { continue; }
        if ( compiler.error !== undefined && events !== undefined ) {
            options.events.push({
                type: 'error',
                text: compiler.error
            });
        }
    }

    return writer.toString();
}

/******************************************************************************/

async function useLists(lists, options = {}) {
    if ( useLists.promise !== null ) {
        throw new Error('Pending useLists() operation');
    }

    // Remove all filters
    snfe.reset();

    if ( Array.isArray(lists) === false || lists.length === 0 ) {
        return;
    }

    let compiler = null;

    const consumeList = list => {
        let { compiled } = list;
        if ( typeof compiled !== 'string' || compiled === '' ) {
            const writer = new CompiledListWriter();
            if ( compiler === null ) {
                compiler = snfe.createCompiler();
            }
            compiled = compileList(list, compiler, writer, options);
        }
        snfe.fromCompiled(new CompiledListReader(compiled));
    };

    // Populate filtering engine with resolved filter lists
    const promises = [];
    for ( const list of lists ) {
        promises.push(Promise.resolve(list).then(list => consumeList(list)));
    }

    useLists.promise = Promise.all(promises);
    await useLists.promise;
    useLists.promise = null; // eslint-disable-line require-atomic-updates

    // Commit changes
    snfe.freeze();
    snfe.optimize();
}

useLists.promise = null;

/******************************************************************************/

const fctx = new FilteringContext();
let snfeProxyInstance = null;

class StaticNetFilteringEngine {
    constructor() {
        if ( snfeProxyInstance !== null ) {
            throw new Error('Only a single instance is supported.');
        }
        snfeProxyInstance = this;
    }

    useLists(lists) {
        return useLists(lists);
    }

    matchRequest(details) {
        return snfe.matchRequest(fctx.fromDetails(details));
    }

    matchAndFetchModifiers(details, modifier) {
        return snfe.matchAndFetchModifiers(fctx.fromDetails(details), modifier);
    }

    hasQuery(details) {
        return snfe.hasQuery(details);
    }

    filterQuery(details) {
        fctx.redirectURL = undefined;
        const directives = snfe.filterQuery(fctx.fromDetails(details));
        if ( directives === undefined ) { return; }
        return { redirectURL: fctx.redirectURL, directives };
    }

    isBlockImportant() {
        return snfe.isBlockImportant();
    }

    toLogData() {
        return snfe.toLogData();
    }

    createCompiler(parser) {
        return snfe.createCompiler(parser);
    }

    compileList(...args) {
        return compileList(...args);
    }

    async serialize() {
        const data = snfe.serialize();
        return s14e.serialize(data, { compress: true });
    }

    async deserialize(serialized) {
        const data = s14e.deserialize(serialized);
        return snfe.unserialize(data);
    }

    static async create({ pslSelfie = null, pslRaw = null } = {}) {
        const instance = new StaticNetFilteringEngine();

        if ( pslSelfie !== null || pslRaw !== null ) {
            if ( !pslInit({ selfie: pslSelfie, raw: pslRaw }) ) {
                throw new Error('Failed to initialize public suffix list.');
            }
        }

        return instance;
    }

    static async release() {
        if ( snfeProxyInstance === null ) { return; }
        snfeProxyInstance = null;
        await useLists([]);
    }
}

/******************************************************************************/

export {
    pslInit,
    StaticNetFilteringEngine,
};
