// Neonwolf: establish the inert browser globals uBO's cores read at module-eval
// time (top-level `new CosmeticFilteringEngine()` touches vAPI.defer). Imported
// FIRST by the entry so it evaluates before any uBO module.
//
// vAPI.defer.create() returns a deferred-timer handle uBO uses only to schedule
// selector-cache GC/pruning; headless we never need those timers to fire, so
// every method is inert.
const inertTimer = {
  on() {}, off() {}, onidle() {}, ongoing() { return false; },
};
globalThis.vAPI = globalThis.vAPI || {
  tabs: { insertCSS() {}, removeCSS() {} },
  warSecret: () => '',
  defer: {
    create() { return inertTimer; },
    once() {},
  },
  webextFlavor: { env: ['firefox', 'user_stylesheet', 'html_filtering'] },
};
export default globalThis.vAPI;
