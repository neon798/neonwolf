// esbuild --inject shim: uBO's tasks.js references setTimeout/clearTimeout as
// free variables. They exist in Node and window globals, but NOT in Firefox's
// shared system-module global, where they live in Timer.sys.mjs instead.
let st = globalThis.setTimeout;
let ct = globalThis.clearTimeout;
if (typeof st !== "function" && typeof ChromeUtils !== "undefined") {
    const timers = ChromeUtils.importESModule(
        "resource://gre/modules/Timer.sys.mjs"
    );
    st = timers.setTimeout;
    ct = timers.clearTimeout;
}
export { st as setTimeout, ct as clearTimeout };
