// Renders mockups.html to PNGs (one per panel). Usage: node render.mjs
import { launch } from '../../../../release-qa/2026-11-28-crazygames-evidence/scripts/lib.mjs';

const dir = new URL('.', import.meta.url).pathname;
const b = await launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto('file://' + dir + 'mockups.html');
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(400);
const panels = await p.$$('.panel');
const names = ['after-muzzle-flash.png', 'after-ko-400ms.png', 'ko-timeline.png'];
for (let i = 0; i < panels.length; i++) await panels[i].screenshot({ path: dir + names[i] });
await b.close();
