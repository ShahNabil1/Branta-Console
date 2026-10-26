import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
it('counter implementation reads no key values, input values or page content',()=>{
  const source=readFileSync('src/content/counters.ts','utf8').replace(/\/\/[^\n]*/g,'');
  for(const pattern of [/event\.(key|code|target)\b/,/\.value\b/,/innerHTML|innerText|textContent/,/location\.|document\.URL/,/console\./])expect(source).not.toMatch(pattern);
  expect(source).toContain('event.isTrusted');
});
it('worker has no DOM image processing and stores only screenshot metadata',()=>{
  const source=readFileSync('src/background/worker.ts','utf8');
  expect(source).not.toMatch(/document\.|window\.|createImageBitmap|HTMLCanvasElement/);
  expect(source).not.toMatch(/console\.(log|debug|info)/);
  expect(source).toContain("await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'})");
  expect(source).toContain("await chrome.idle.queryState(300)");
});
