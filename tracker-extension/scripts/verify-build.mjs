import { readFileSync,existsSync,readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const manifest=JSON.parse(readFileSync('dist/manifest.json','utf8'));
assert.equal(manifest.manifest_version,3);
assert.equal(manifest.version,'0.5.0');
for(const permission of ['sidePanel','alarms','storage','idle','offscreen','identity','activeTab','scripting'])assert(manifest.permissions.includes(permission));
assert(existsSync('dist/background.js'));assert(existsSync('dist/counters.js'));assert(existsSync('dist/offscreen.html'));
assert.equal(manifest.background.service_worker,'background.js');
assert.equal(manifest.background.type,'module');
const source=readFileSync('src/background/worker.ts','utf8');assert(!/document\.|window\.|HTMLCanvasElement|createImageBitmap/.test(source),'DOM code in service worker');
for(const file of [manifest.action.default_popup,manifest.side_panel.default_path,...Object.values(manifest.icons)])assert(existsSync(`dist/${file}`),`Missing ${file}`);
for(const file of ['popup.html','sidepanel.html','offscreen.html']){
 const html=readFileSync(`dist/${file}`,'utf8');assert(!/<script(?![^>]*src=)[^>]*>[^<]+/i.test(html),'Inline JS');
 for(const match of html.matchAll(/(?:src|href)="\.\/([^"#]+)"/g))assert(existsSync(`dist/${match[1]}`),`Missing ${match[1]}`);
}
for(const size of [16,32,48,128]){const bytes=readFileSync(`dist/assets/icon-${size}.png`);assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);}
assert(readdirSync('dist/assets').some(f=>f.includes('inter-latin')&&f.endsWith('.woff2')),'Inter not bundled');
assert(readdirSync('dist/assets').some(f=>f.includes('jetbrains-mono-latin')&&f.endsWith('.woff2')),'JetBrains Mono not bundled');
console.log('MV3 manifest, entrypoints, bundled fonts, icons, and local asset references verified.');
