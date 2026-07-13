// Converts uBlock Origin's modern scriptlet registry + redirect (web-accessible)
// resources into the adblock-rust `Resource` JSON that Neonwolf's engine loads
// via use_resources(). Unlike adblock-rust's legacy assembler (which only parses
// the old `/// name` scriptlets.js), this imports uBO's actual ES-module registry
// so it captures every current scriptlet -- including the trusted-* scriptlets
// YouTube blocking now depends on.
//
//   node convert.mjs <ubo/src> <out.json>
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SRC = path.resolve(process.argv[2]);
const OUT = process.argv[3];
if (!SRC || !OUT) {
  console.error("usage: node convert.mjs <ubo/src> <out.json>");
  process.exit(2);
}

// uBO's scriptlets.js sets `export const builtinScriptlets = registeredScriptlets`
// and imports every scriptlet module, so importing it populates the full registry.
const scriptletsUrl = pathToFileURL(
  path.join(SRC, "js/resources/scriptlets.js")
).href;
const { builtinScriptlets } = await import(scriptletsUrl);

const redirectsUrl = pathToFileURL(
  path.join(SRC, "js/redirect-resources.js")
).href;
const redirectMap = (await import(redirectsUrl)).default;

const MIME_BY_EXT = {
  js: "application/javascript",
  html: "text/html",
  gif: "image/gif",
  png: "image/png",
  mp3: "audio/mp3",
  mp4: "video/mp4",
  json: "application/json",
  css: "text/css",
  txt: "text/plain",
  xml: "text/xml",
};
const mimeFor = name =>
  MIME_BY_EXT[name.split(".").pop()] || "application/octet-stream";

const resources = [];
let nScriptlets = 0;
let nFn = 0;
let nTrusted = 0;

for (const s of builtinScriptlets) {
  if (!s || !s.name || typeof s.fn !== "function") {
    continue;
  }
  const isFn = s.name.endsWith(".fn");
  if (isFn) {
    nFn++;
  } else {
    nScriptlets++;
  }
  if (s.requiresTrust) {
    nTrusted++;
  }
  resources.push({
    name: s.name,
    aliases: Array.isArray(s.aliases) ? s.aliases : [],
    kind: { mime: isFn ? "fn/javascript" : "application/javascript" },
    content: Buffer.from(s.fn.toString(), "utf8").toString("base64"),
    dependencies: Array.isArray(s.dependencies) ? s.dependencies : [],
    // Curated, bundled lists only: grant injection (incl. uBO's trusted-*
    // scriptlets) rather than gating on a per-list trust mask we don't model.
    permission: 0,
  });
}

let nRedirects = 0;
for (const [name, props] of redirectMap) {
  let data;
  try {
    data = readFileSync(path.join(SRC, "web_accessible_resources", name));
  } catch {
    continue; // entry without a backing file (alias-only / scriptlet redirect)
  }
  const alias = props && props.alias;
  resources.push({
    name,
    aliases: alias ? (Array.isArray(alias) ? alias : [alias]) : [],
    kind: { mime: mimeFor(name) },
    content: data.toString("base64"),
    dependencies: [],
    permission: 0,
  });
  nRedirects++;
}

writeFileSync(OUT, JSON.stringify(resources));
console.error(
  `vendor-ubo: ${nScriptlets} scriptlets + ${nFn} fn-deps (${nTrusted} trusted) + ${nRedirects} redirects = ${resources.length} resources -> ${OUT}`
);
