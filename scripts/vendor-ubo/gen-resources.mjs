// Generate uBO resource text (redirect-engine.resourcesFromString format) from
// the builtinScriptlets registry. fn-deps first so `/// dependency` resolves.
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
const scriptletsPath = path.resolve(
  process.argv[2] || './uBlock/src/js/resources/scriptlets.js');
const reg = await import(pathToFileURL(scriptletsPath).href);
const all = reg.builtinScriptlets;
const fns = all.filter(s => s.name.endsWith('.fn'));
const js = all.filter(s => !s.name.endsWith('.fn'));
const out = [];
for (const s of [...fns, ...js]) {
  if (typeof s.fn !== 'function') { continue; }
  out.push(`/// ${s.name}`);
  for (const a of s.aliases || []) { out.push(`/// alias ${a}`); }
  if (s.world && /isolated/i.test(s.world)) { out.push(`/// world isolated`); }
  for (const d of s.dependencies || []) { out.push(`/// dependency ${d}`); }
  out.push(s.fn.toString());
  out.push('');
}
writeFileSync('ubo-resources.txt', out.join('\n'));
console.log(`generated ${fns.length} fn-deps + ${js.length} scriptlets`);
