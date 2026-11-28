// Release QA harness for the PEWFIELD CrazyGames zip. Game served from 127.0.0.1:GAME, host page on localhost:HOST (cross-origin iframe).
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(process.env.HOME + '/.npm/_npx/e41f203b7505f1fb/package.json');
export const { chromium, devices } = require('playwright-core');

export const GAME = process.env.GAME || 'http://127.0.0.1:8731';
export const HOST = process.env.HOST || 'http://localhost:8732';
export const OUT = process.env.OUTDIR || '/tmp/x/';
fs.mkdirSync(OUT, { recursive: true });

export const launch = (extra = []) =>
  chromium.launch({
    executablePath:
      process.env.HOME + '/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-features=LocalNetworkAccessChecks,LocalNetworkAccessChecksWebRTC', ...extra],
  });

// SDK stub: logs every call with performance.now() into window.__sdk (in the frame) and to the parent via console.
const SDK_STUB = (muted) => `(() => {
  const log = (n) => { (window.__sdk = window.__sdk || []).push([n, Math.round(performance.now())]); console.log('[SDK] ' + n + ' ' + Math.round(performance.now())); };
  const listeners = [];
  window.CrazyGames = { SDK: {
    environment: 'crazygames',
    init: () => { log('init'); return new Promise((r) => setTimeout(r, 30)); },
    game: {
      loadingStart: () => log('loadingStart'), loadingStop: () => log('loadingStop'),
      gameplayStart: () => log('gameplayStart'), gameplayStop: () => log('gameplayStop'),
      happytime: () => log('happytime'),
      settings: { muteAudio: ${muted ? 'true' : 'false'}, disableChat: false },
      addSettingsChangeListener: (cb) => { log('addSettingsChangeListener'); listeners.push(cb); },
      removeSettingsChangeListener: () => {},
    },
    ad: { requestAd: (t) => log('requestAd:' + t), hasAdblock: async () => false },
    user: { isUserAccountAvailable: false },
  } };
  window.__cgSetMute = (m) => listeners.forEach((cb) => cb({ muteAudio: m, disableChat: false }));
})();`;

// In-frame probes: frame times, audio context creation / state, fake gamepad.
const PROBE = () => {
  const ft = (window.__ft = []);
  let last = 0;
  const loop = (t) => {
    if (last) { ft.push(t - last); (window.__fts2 = window.__fts2 || []).push([Math.round(t), Math.round((t - last) * 10) / 10]); }
    last = t;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  window.__audio = [];
  const AC = window.AudioContext;
  if (AC) {
    window.AudioContext = function (...a) {
      const c = new AC(...a);
      window.__audio.push({ ev: 'new', state: c.state, t: Math.round(performance.now()), activation: navigator.userActivation?.hasBeenActive });
      window.__ctxs = (window.__ctxs || []).concat(c);
      c.addEventListener('statechange', () => window.__audio.push({ ev: 'state', state: c.state, t: Math.round(performance.now()) }));
      return c;
    };
    window.AudioContext.prototype = AC.prototype;
  }
  const mp = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    window.__audio.push({ ev: 'media.play', src: this.src, t: Math.round(performance.now()) });
    return mp.call(this);
  };
  // Fake standard pad, off until window.__padOn() is called.
  const btns = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
  const pad = { id: 'QA pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: btns, vibrationActuator: null };
  let on = false;
  const real = navigator.getGamepads?.bind(navigator);
  navigator.getGamepads = () => (on ? [pad, null, null, null] : real ? real() : []);
  window.__padOn = () => { on = true; };
  window.__padSet = (i, v) => { btns[i].pressed = v; btns[i].value = v ? 1 : 0; pad.timestamp = performance.now(); };
  window.__padAxes = (x, y) => { pad.axes[0] = x; pad.axes[1] = y; pad.timestamp = performance.now(); };
};

export const hostHtml = (w, h, q = '') =>
  `<!doctype html><html><body style="margin:0;background:#222;height:3000px"><div style="height:40px;color:#fff;font:14px sans-serif">QA host <input id="hostinput"></div>` +
  `<iframe id="g" src="${GAME}/index.html${q}" width="${w}" height="${h}" style="border:0;display:block" allow="autoplay; fullscreen; gamepad"></iframe></body></html>`;

/** Opens a context. mode 'iframe' (cross-origin host page) or 'top'. Returns { ctx, page, frame(), log }. */
export const open = async (browser, { w = 1280, h = 720, mode = 'iframe', muted = false, ctxOpts = {}, query = '', settings = null } = {}) => {
  const log = { req: [], console: [], pageerrors: [], failed: [] };
  const ctx = await browser.newContext({ viewport: mode === 'iframe' ? { width: w + 20, height: h + 60 } : { width: w, height: h }, ...ctxOpts });
  await ctx.route('https://sdk.crazygames.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: SDK_STUB(muted) }));
  await ctx.route(HOST + '/host.html*', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: hostHtml(w, h, query) }));
  await ctx.addInitScript(PROBE);
  if (settings) await ctx.addInitScript((s) => { if (location.port === '8731') localStorage.setItem('floor42:settings', JSON.stringify(s)); }, settings);
  const page = await ctx.newPage();
  const t0 = Date.now();
  page.on('request', (r) => log.req.push({ t: Date.now() - t0, url: r.url(), type: r.resourceType() }));
  page.on('requestfailed', (r) => log.failed.push(r.url() + ' ' + r.failure()?.errorText));
  page.on('response', (r) => { if (r.status() >= 400) log.failed.push(r.status() + ' ' + r.url()); });
  page.on('console', (m) => { if (m.type() !== 'log' || !m.text().startsWith('[SDK]')) log.console.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => log.pageerrors.push({ t: Date.now() - t0, msg: e.message, stack: e.stack }));
  page.on('websocket', (ws) => log.req.push({ t: Date.now() - t0, url: ws.url(), type: 'websocket' }));
  const url = mode === 'iframe' ? HOST + '/host.html' : GAME + '/index.html' + query;
  await page.goto(url);
  const frame = () => (mode === 'iframe' ? page.frames().find((f) => f.url().startsWith(GAME)) : page.mainFrame());
  for (let i = 0; i < 100 && !frame(); i++) await page.waitForTimeout(50);
  return { ctx, page, frame, log, t0 };
};

export const sdk = (f) => f.evaluate(() => window.__sdk || []);
export const shot = (page, name) => page.screenshot({ path: OUT + name + '.png' });
export const ftStats = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  const q = (p) => +(s[Math.min(s.length - 1, Math.floor(s.length * p))] || 0).toFixed(1);
  return { n: s.length, fps: +(1000 / (s.reduce((a, b) => a + b, 0) / (s.length || 1))).toFixed(1), p50: q(0.5), p95: q(0.95), p99: q(0.99), max: q(1), over33: s.filter((x) => x > 33.4).length, over50: s.filter((x) => x > 50).length };
};
/** Frame times since the last call. */
export const ftTake = (f) => f.evaluate(() => window.__ft.splice(0));

/** Scripted player: alternates direction, shoots, jumps, dashes. Runs until the result screen or timeout. */
export const fightUntilResult = async (page, f, { timeoutMs = 240000, keys = { l: 'KeyA', r: 'KeyD', up: 'KeyW', fire: 'Space' } } = {}) => {
  const tStart = Date.now();
  let dir = keys.r;
  await page.keyboard.down(dir);
  let i = 0;
  while (Date.now() - tStart < timeoutMs) {
    if (await f.locator('[data-testid="result-screen"]').count()) break;
    await page.keyboard.press(keys.fire);
    if (i % 3 === 0) await page.keyboard.press(keys.up);
    if (i % 8 === 0) {
      await page.keyboard.up(dir);
      dir = dir === keys.r ? keys.l : keys.r;
      await page.keyboard.down(dir);
    }
    i++;
    await page.waitForTimeout(140);
  }
  await page.keyboard.up(dir);
  return Date.now() - tStart;
};

export const save = (name, data) => fs.writeFileSync(OUT + name + '.json', JSON.stringify(data, null, 2));
export const visibleText = (f) => f.evaluate(() => document.body.innerText);
