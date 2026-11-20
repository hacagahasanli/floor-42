// Two Chromium browsers play one invite match against a local server, with an impaired network.
// node run.mjs <outfile> --web http://localhost:3001 --server ws://localhost:2567 --secs 60
//   --host '{"rtt":80,...}' --guest '{"rtt":180,...}' [--cpu 4] [--phone]
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
// Playwright is not a dependency of the game: install it next to the repo, or `npm i --no-save playwright`.
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const out = args[0];
const opt = (k, d) => {
  const i = args.indexOf('--' + k);
  return i < 0 ? d : args[i + 1];
};
const flag = (k) => args.includes('--' + k);
const web = opt('web', 'http://localhost:3001');
const server = opt('server', 'ws://localhost:2567');
const secs = Number(opt('secs', 60));
const hostCfg = JSON.parse(opt('host', '{}'));
const guestCfg = JSON.parse(opt('guest', '{}'));
const cpu = Number(opt('cpu', 1));
const shim = fs.readFileSync(new URL('./netshim.js', import.meta.url), 'utf8');

const launch = () =>
  chromium.launch({
    headless: !flag('headful'),
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  });

const mkPage = async (browser, cfg) => {
  const ctx = await browser.newContext(
    flag('phone')
      ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
      : { viewport: { width: 1280, height: 720 } },
  );
  const page = await ctx.newPage();
  await page.addInitScript((c) => {
    window.__NETCFG = c;
  }, cfg);
  await page.addInitScript(shim);
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200));
  });
  if (cpu > 1) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  }
  return page;
};

const [bh, bg] = await Promise.all([launch(), launch()]);
const host = await mkPage(bh, hostCfg);
const guest = await mkPage(bg, guestCfg);
await host.goto(`${web}/play?server=${encodeURIComponent(server)}`);
const linkEl = host.getByLabel('Invite link', { exact: true });
for (let i = 0; i < 15; i++) {
  await host.getByRole('button', { name: /Invite a friend/ }).click({ timeout: 2000 }).catch(() => {});
  if (await linkEl.waitFor({ timeout: 2000 }).then(() => true, () => false)) break;
}
for (let i = 0; i < 40; i++) {
  const v = await host.evaluate(() => [document.querySelector('input[aria-label="Invite link"]')?.value, document.body.innerText.slice(0, 80).replace(/\n/g, ' | ')]);
  if (/room=/.test(v[0] || '')) break;
  await host.waitForTimeout(500);
}
const link = await linkEl.inputValue();
const room = new URL(link).searchParams.get('room');
const t0 = Date.now();
await guest.goto(`${web}/play?room=${room}&server=${encodeURIComponent(server)}`);
await Promise.all([host, guest].map((p) => p.waitForFunction(() => !!window.__mc, null, { timeout: 30000 }).catch(async (e) => {
  console.log('no __mc', (await p.evaluate(() => document.body.innerText)).slice(0, 300).replace(/\n/g, ' | '));
  throw e;
})));
const startedAt = Date.now();
console.log('match up after', startedAt - t0, 'ms');
const gl = await host.evaluate(() => {
  const c = document.createElement('canvas').getContext('webgl2');
  const e = c && c.getExtension('WEBGL_debug_renderer_info');
  return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'n/a';
});
console.log('GL', gl);
const ap = Number(opt('ap', 11));
await host.evaluate((a) => window.__autopilot(a), ap);
await guest.evaluate((a) => window.__autopilot(a + 18), ap);
await host.waitForTimeout(secs * 1000);
const grab = (p) =>
  p.evaluate(() => ({
    frames: window.__frames,
    probe: window.__netprobe,
    shim: window.__netstats_shim,
    stalls: window.__stalls.slice(0, 200),
    hud: document.body.innerText.match(/(direct|server|relay)[^\n]{0,40}ms[^\n]{0,12}/gi),
    text: document.body.innerText.slice(0, 400),
  }));
const [H, G] = await Promise.all([grab(host), grab(guest)]);
fs.writeFileSync(out, JSON.stringify({ hostCfg, guestCfg, startedAt, endedAt: Date.now(), cpu, gl, host: H, guest: G }));
console.log('host hud', H.hud, '| guest hud', G.hud);
console.log('frames', H.frames.length, G.frames.length, 'probe', H.probe.length, G.probe.length, 'shim', JSON.stringify(H.shim), JSON.stringify(G.shim));
await Promise.all([bh.close(), bg.close()]);
