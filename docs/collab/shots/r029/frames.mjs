// R-029 cover source frames: REAL demo fights (bot vs bot) on OFFSITE in the portal dev build, HUD/DOM hidden,
// camera re-aimed at render time (close cinematic framing on the two fighters). No game code changed.
// Usage: node frames.mjs <tag> <p1> <p2> <w> <h> <count> <fill> [yaw]
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(process.env.HOME + '/.npm/_npx/e41f203b7505f1fb/package.json');
const { chromium } = require('playwright-core');
const [tag, p1, p2, W, H, COUNT, FILL, YAW, LIFT, MAXDX] = process.argv.slice(2);
const OUT = new URL('./raw/' + tag + '/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const ctx = await browser.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
await page.addInitScript(() => {
  localStorage.setItem('floor42:settings', JSON.stringify({ quality: 'high', arena: 'offsite', showKeyHints: false, shake: false }));
  localStorage.setItem('floor-42:finished-match', '1');
});
await page.goto(`http://localhost:3261/#/arena?p1=${p1}&p2=${p2}&bot=hard&arena=offsite&demo`);
await page.waitForFunction(() => window.__mc?.state()?.phase === 'fight', null, { timeout: 90000 });
await page.addStyleTag({ content: 'body *{visibility:hidden!important} canvas{visibility:visible!important}' });
await page.evaluate(({ fill, yaw, lift }) => {
  const mc = window.__mc;
  const r = mc.renderer;
  const orig = r.render.bind(r);
  r.render = (s, c) => {
    const v = mc.view();
    const [a, b] = v;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + 1.1;
    c.fov = 30; c.updateProjectionMatrix();
    // fill < 0: tight mode, -fill = minimum visible height in world units
    const vis = fill < 0 ? Math.max(-fill, (Math.abs(a.x - b.x) + 2.4) / c.aspect, Math.abs(a.y - b.y) + 3.6)
      : Math.max(Math.abs(a.x - b.x) + 3.2, (Math.abs(a.y - b.y) + 3.2) * c.aspect) / fill / c.aspect;
    const dist = vis / (2 * Math.tan((c.fov * Math.PI) / 360));
    const vh = 2 * dist * Math.tan((c.fov * Math.PI) / 360);
    const ty = my + lift * vh;
    c.position.set(mx + dist * yaw, ty - 0.4, dist);
    c.lookAt(mx, ty, 0);
    s.traverse((o) => { if (o.isSprite && o.material && o.material.depthTest === false) o.visible = false; });
    orig(s, c);
  };
}, { fill: +FILL, yaw: +(YAW ?? 0), lift: +(LIFT ?? 0) });
const meta = [];
for (let i = 0; i < +COUNT; i++) {
  await page.waitForTimeout(+(process.env.STEP || 220));
  const st = await page.evaluate(() => { const s = window.__mc.state(); return { phase: s.phase, f: s.fighters.map((f) => ({ x: +f.x.toFixed(1), y: +f.y.toFixed(1), hp: f.hp, gun: f.gun?.kind ?? f.gun, ss: f.sinceShot, resp: f.respawn })) }; });
  if (st.phase !== 'fight') { if (st.phase === 'over') break; continue; }
  if (MAXDX && Math.abs(st.f[0].x - st.f[1].x) > +MAXDX) continue;
  const n = String(i).padStart(3, '0');
  await page.screenshot({ path: `${OUT}${n}.png` });
  meta.push({ n, ...st });
}
fs.writeFileSync(OUT + 'meta.json', JSON.stringify(meta, null, 1));
await browser.close();
console.log('frames', meta.length);
