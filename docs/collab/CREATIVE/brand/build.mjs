// R-023 brand: writes the logo SVGs (svg/), then renders PNGs (png/) and the name-test sheet for docs/growth.
// Run from this folder: node build.mjs
// Fonts: Titan One (SIL OFL 1.1) and Baloo 2 (SIL OFL 1.1), embedded as data URIs so every SVG is self-contained.
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';

const here = path.dirname(new URL(import.meta.url).pathname);
const b64 = (f) => fs.readFileSync(path.join(here, 'fonts', f)).toString('base64');
const TITAN = b64('TitanOne-Regular.woff2');
const BALOO = b64('Baloo2-800.woff2');
const FONTS = `@font-face{font-family:'Titan One';src:url(data:font/woff2;base64,${TITAN}) format('woff2')}@font-face{font-family:'Baloo 2';font-weight:800;src:url(data:font/woff2;base64,${BALOO}) format('woff2')}`;

// Direction B tokens (CREATIVE/ui/direction-b/spec.md 2.2)
const T = {
  grape: '#3B1F6B', grapeDeep: '#26124A', sun: '#FFC83D', sunLo: '#E08A00', sunHi: '#FFE38A',
  tang: '#FF7A2F', tangLo: '#C2410C', teal: '#22C3A6', tealLo: '#0E8A74', sky: '#4CB8FF', skyLo: '#1F7BC8',
  tomato: '#F0533A', track: '#E0603F', cream: '#FFF3D6', white: '#FFFFFF',
};

// A comic "pew" burst: n spikes, slightly uneven so it feels hand-cut, deterministic.
function burst(cx, cy, R, r, n, rot = 0) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n;
    const k = i % 2 === 0 ? R * (1 + 0.07 * Math.sin(i * 2.3)) : r * (1 + 0.04 * Math.cos(i * 1.7));
    pts.push(`${(cx + Math.cos(a) * k).toFixed(1)},${(cy + Math.sin(a) * k).toFixed(1)}`);
  }
  return `M${pts.join('L')}Z`;
}
// Sunburst wedges (alternate colour), clipped by the caller.
function rays(cx, cy, R, n, rot = 0) {
  let d = '';
  for (let i = 0; i < n; i += 2) {
    const a0 = rot + (i * 2 * Math.PI) / n, a1 = rot + ((i + 1) * 2 * Math.PI) / n;
    d += `M${cx},${cy}L${(cx + Math.cos(a0) * R).toFixed(1)},${(cy + Math.sin(a0) * R).toFixed(1)}L${(cx + Math.cos(a1) * R).toFixed(1)},${(cy + Math.sin(a1) * R).toFixed(1)}Z`;
  }
  return d;
}
// Outlined display text: grape drop, then grape stroke under the fill (paint-order).
function otext(str, x, y, size, fill, { stroke = size * 0.09, drop = size * 0.08, dropFill = T.grape, anchor = 'middle', extra = '' } = {}) {
  const base = `x="${x}" y="${y}" font-family="Titan One" font-size="${size}" text-anchor="${anchor}" letter-spacing="${(size * 0.01).toFixed(1)}" stroke-linejoin="round" paint-order="stroke fill" ${extra}`;
  return `<text ${base} transform="translate(0 ${drop.toFixed(1)})" fill="${dropFill}" stroke="${T.grape}" stroke-width="${(stroke * 2).toFixed(1)}">${str}</text>` +
    `<text ${base} fill="${fill}" stroke="${T.grape}" stroke-width="${(stroke * 2).toFixed(1)}">${str}</text>`;
}
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><style>${FONTS}</style>${body}</svg>`;

// ---------- Concept A: PEW! burst + FIELD pennant (the pick) ----------
function burstGroup(cx, cy, R, label, size, { withBang = true } = {}) {
  const b = burst(cx, cy, R, R * 0.78, 13, -Math.PI / 2);
  const id = `c${Math.round(cx)}${Math.round(cy)}${Math.round(R)}`;
  return `<defs><clipPath id="${id}"><path d="${b}"/></clipPath></defs>` +
    `<path d="${b}" fill="${T.grape}" transform="translate(0 ${R * 0.07})"/>` +
    `<path d="${b}" fill="${T.sun}"/>` +
    `<path d="${rays(cx, cy, R * 1.3, 26, 0.1)}" fill="${T.sunHi}" clip-path="url(#${id})" opacity=".85"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${R * 0.5}" fill="${T.sun}" clip-path="url(#${id})" opacity=".55"/>` +
    `<path d="${b}" fill="none" stroke="${T.grape}" stroke-width="${R * 0.055}" stroke-linejoin="round"/>` +
    `<g transform="rotate(-7 ${cx} ${cy})">${otext(withBang ? label + '!' : label, cx + (withBang ? R * 0.03 : 0), cy + size * 0.36, size, T.white)}</g>`;
}
function pennant(x, y, w, h, fill, lo) {
  // a ribbon with a swallow-tail on the right
  const n = h * 0.32;
  const d = `M${x},${y}L${x + w},${y}L${x + w - n},${y + h / 2}L${x + w},${y + h}L${x},${y + h}Z`;
  return `<path d="${d}" fill="${T.grape}" transform="translate(0 ${h * 0.12})"/><path d="${d}" fill="${fill}" stroke="${T.grape}" stroke-width="${h * 0.075}" stroke-linejoin="round"/>` +
    `<rect x="${x + h * 0.06}" y="${y + h * 0.1}" width="${w - n - h * 0.2}" height="${h * 0.16}" rx="${h * 0.08}" fill="#fff" opacity=".28"/>` +
    `<path d="M${x},${y + h * 0.78}L${x + w - n * 0.4},${y + h * 0.78}" stroke="${lo}" stroke-width="${h * 0.1}" opacity=".5"/>`;
}
const A_word = svg(1200, 520,
  `<g transform="rotate(-3 600 260)">` +
  pennant(440, 200, 720, 190, T.tang, T.tangLo) +
  `<g>${otext('FIELD', 790, 340, 150, T.white, { stroke: 12, drop: 10 })}</g>` +
  burstGroup(270, 250, 240, 'PEW', 128) +
  `</g>`);
const A_icon = (bg = true) => svg(512, 512,
  (bg ? `<defs><clipPath id="sq"><rect width="512" height="512" rx="112"/></clipPath></defs><rect width="512" height="512" rx="112" fill="${T.sky}"/>` +
    `<path d="${rays(256, 256, 520, 28, 0)}" fill="#fff" opacity=".16" clip-path="url(#sq)"/>` +
    `<rect x="10" y="10" width="492" height="492" rx="104" fill="none" stroke="${T.grape}" stroke-width="20"/>` : '') +
  burstGroup(256, 250, 236, 'PEW', 132, { withBang: false }));

// ---------- Concept B: one-line arched PEWFIELD over a half sun ----------
const B_word = svg(1200, 520,
  `<defs><clipPath id="half"><rect x="0" y="0" width="1200" height="400"/></clipPath><path id="arc" d="M90,380 Q600,170 1110,380"/></defs>` +
  `<g clip-path="url(#half)"><circle cx="600" cy="420" r="330" fill="${T.sun}"/><path d="${rays(600, 420, 330, 32, 0)}" fill="${T.sunHi}"/><circle cx="600" cy="420" r="330" fill="none" stroke="${T.grape}" stroke-width="14"/></g>` +
  `<rect x="250" y="396" width="700" height="18" rx="9" fill="${T.grape}"/>` +
  `<text font-family="Titan One" font-size="176" text-anchor="middle" stroke-linejoin="round" paint-order="stroke fill" fill="${T.tangLo}" stroke="${T.grape}" stroke-width="30" transform="translate(0 16)"><textPath href="#arc" startOffset="50%">PEWFIELD</textPath></text>` +
  `<text font-family="Titan One" font-size="176" text-anchor="middle" stroke-linejoin="round" paint-order="stroke fill" fill="${T.white}" stroke="${T.grape}" stroke-width="30"><textPath href="#arc" startOffset="50%"><tspan fill="${T.white}">PEW</tspan><tspan fill="${T.sun}">FIELD</tspan></textPath></text>` +
  `<g transform="rotate(-2 600 470)"><rect x="380" y="430" width="440" height="64" rx="32" fill="${T.teal}" stroke="${T.grape}" stroke-width="8"/>` +
  `<text x="600" y="476" font-family="Titan One" font-size="34" text-anchor="middle" fill="#fff" stroke="${T.grape}" stroke-width="8" paint-order="stroke fill" stroke-linejoin="round">1 VS 1 · FIELD DAY</text></g>`);
const B_icon = svg(512, 512,
  `<rect width="512" height="512" rx="112" fill="${T.grapeDeep}"/>` +
  // medal ribbons
  `<path d="M150,0 L240,0 L300,210 L210,230Z" fill="${T.tang}" stroke="${T.grape}" stroke-width="14" stroke-linejoin="round"/>` +
  `<path d="M362,0 L272,0 L212,210 L302,230Z" fill="${T.teal}" stroke="${T.grape}" stroke-width="14" stroke-linejoin="round"/>` +
  `<circle cx="256" cy="318" r="168" fill="${T.grape}"/><circle cx="256" cy="306" r="168" fill="${T.sun}" stroke="${T.grape}" stroke-width="16"/>` +
  `<circle cx="256" cy="306" r="128" fill="none" stroke="${T.sunLo}" stroke-width="10" stroke-dasharray="4 22" stroke-linecap="round"/>` +
  otext('P', 256, 388, 230, T.white, { stroke: 16, drop: 14 }));

// ---------- Concept C: stacked sports-day scoreboard plate with running-track lanes ----------
const C_word = svg(1200, 520,
  `<defs><clipPath id="plate"><rect x="210" y="40" width="780" height="440" rx="56"/></clipPath></defs>` +
  `<g transform="rotate(-3 600 260)">` +
  `<rect x="210" y="56" width="780" height="440" rx="56" fill="${T.grape}"/>` +
  `<rect x="210" y="40" width="780" height="440" rx="56" fill="${T.track}"/>` +
  `<g clip-path="url(#plate)">${[0, 1, 2, 3, 4, 5].map(i => `<path d="M150,${300 + i * 60} Q600,${200 + i * 60} 1050,${300 + i * 60}" stroke="#fff" stroke-width="8" fill="none" opacity=".55"/>`).join('')}</g>` +
  `<rect x="210" y="40" width="780" height="440" rx="56" fill="none" stroke="${T.grape}" stroke-width="14"/>` +
  otext('PEW', 600, 230, 200, T.white, { stroke: 15, drop: 14 }) +
  otext('FIELD', 600, 420, 170, T.sun, { stroke: 14, drop: 12 }) +
  `</g>`);
const C_icon = svg(512, 512,
  `<defs><clipPath id="sq"><rect width="512" height="512" rx="112"/></clipPath></defs><rect width="512" height="512" rx="112" fill="${T.track}"/>` +
  `<g clip-path="url(#sq)">${[0, 1, 2, 3, 4].map(i => `<path d="M-20,${330 + i * 56} Q256,${250 + i * 56} 532,${330 + i * 56}" stroke="#fff" stroke-width="9" fill="none" opacity=".6"/>`).join('')}</g>` +
  `<rect x="10" y="10" width="492" height="492" rx="104" fill="none" stroke="${T.grape}" stroke-width="20"/>` +
  otext('PEW', 256, 300, 190, T.white, { stroke: 15, drop: 14 }));

const files = {
  'a-wordmark.svg': A_word, 'a-icon.svg': A_icon(true), 'a-mark.svg': A_icon(false),
  'b-wordmark.svg': B_word, 'b-icon.svg': B_icon,
  'c-wordmark.svg': C_word, 'c-icon.svg': C_icon,
};
for (const [f, s] of Object.entries(files)) fs.writeFileSync(path.join(here, 'svg', f), s);
console.log('wrote', Object.keys(files).length, 'svg');

// ---------- render ----------
const require = createRequire(import.meta.url);
const npx = path.join(process.env.HOME, '.npm/_npx');
const pwDir = fs.readdirSync(npx).map(d => path.join(npx, d, 'node_modules/playwright')).find(p => fs.existsSync(p));
const { chromium } = require(pwDir);
const exe = path.join(process.env.HOME, 'Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const browser = await chromium.launch({ executablePath: fs.existsSync(exe) ? exe : undefined });

const bgDir = path.join(here, '../ui/direction-b/_bg');
const uri = (p) => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
const POSTER = uri(path.join(bgDir, 'menu-poster-offsite.png'));
const svgUri = (f) => 'data:image/svg+xml;base64,' + Buffer.from(files[f]).toString('base64');

async function shoot(html, w, h, out, scale = 1) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  await page.setContent(`<!doctype html><html><head><style>${FONTS}html,body{margin:0}*{box-sizing:border-box}</style></head><body>${html}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: w, height: h }, omitBackground: true });
  await page.close();
  console.log('wrote', path.relative(here, out));
}

// The 400x225 card: real OFFSITE poster, scrim, two placeholder fighters (old roster renders), logo on the left.
const card = (logoHtml) => `<div style="position:relative;width:400px;height:225px;overflow:hidden;border-radius:10px;background:url(${POSTER}) -262px -118px/760px auto">
  <div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(38,18,74,.42),rgba(38,18,74,.12) 55%,rgba(38,18,74,0))"></div>
  ${logoHtml}</div>`;

// Individual logo PNGs
for (const k of ['a', 'b', 'c']) {
  await shoot(`<img src="${svgUri(k + '-wordmark.svg')}" width="1200" height="520">`, 1200, 520, path.join(here, 'png', `${k}-wordmark.png`));
  await shoot(`<img src="${svgUri(k + '-icon.svg')}" width="512" height="512">`, 512, 512, path.join(here, 'png', `${k}-icon-512.png`));
  await shoot(`<img src="${svgUri(k + '-icon.svg')}" width="48" height="48">`, 48, 48, path.join(here, 'png', `${k}-icon-48.png`));
  await shoot(card(`<img src="${svgUri(k + '-wordmark.svg')}" style="position:absolute;left:-2px;top:20px;width:270px">`), 400, 225, path.join(here, 'png', `${k}-thumb-400x225.png`));
}

// Overview sheet: per concept a row: wordmark, icon 512 (shown at 160), icon at 48 and 32 (real size), thumb 400x225 and at 200x113.
const row = (k, title, note) => `<div style="display:flex;align-items:center;gap:22px;padding:18px 24px;border-bottom:3px solid #E6DEF5">
  <div style="width:150px;font:800 18px 'Baloo 2';color:${T.grape}">${title}<div style="font-weight:800;font-size:13px;color:#5A3596;line-height:1.25;margin-top:6px">${note}</div></div>
  <img src="${svgUri(k + '-wordmark.svg')}" style="width:420px;background:#FFFBF0;border-radius:10px">
  <img src="${svgUri(k + '-icon.svg')}" width="160" height="160">
  <div style="display:flex;flex-direction:column;gap:10px;align-items:center;font:800 11px 'Baloo 2';color:#5A3596"><img src="${svgUri(k + '-icon.svg')}" width="48" height="48">48<img src="${svgUri(k + '-icon.svg')}" width="32" height="32">32</div>
  ${card(`<img src="${svgUri(k + '-wordmark.svg')}" style="position:absolute;left:-2px;top:20px;width:270px">`)}
  <div style="transform:scale(.5);transform-origin:0 0;width:200px;height:113px">${card(`<img src="${svgUri(k + '-wordmark.svg')}" style="position:absolute;left:-2px;top:20px;width:270px">`)}</div>
</div>`;
await shoot(`<div style="width:1640px;background:#fff">
  <div style="padding:18px 24px;font:28px 'Titan One';color:${T.grape}">PEWFIELD · logo concepts (R-023) <span style="font:800 16px 'Baloo 2';color:#5A3596">wordmark · icon 512 · icon at 48 / 32 px real size · CrazyGames card 400x225 · same card at 50 %</span></div>
  ${row('a', 'A · PEW! BURST', 'PICK. Burst = the shot sound; pennant = field day.')}
  ${row('b', 'B · SUN MEDAL', 'One-line arch over a half sun; icon = medal P.')}
  ${row('c', 'C · TRACK PLATE', 'Stacked scoreboard plate on running-track lanes.')}
</div>`, 1640, 64 + 3 * 266, path.join(here, 'png', 'overview.png'));

// ---------- Name test for docs/growth: top 3 names, same neutral §3.1 wordmark style, no logo art ----------
const wm = (a, b) => {
  const o = (px) => { const s = Math.max(2, px * 0.075); return `text-shadow:${[[s, 0], [-s, 0], [0, s], [0, -s], [s * .7, s * .7], [-s * .7, -s * .7], [s * .7, -s * .7], [-s * .7, s * .7]].map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px 0 ${T.grape}`).join(',')},0 ${(px * 0.1).toFixed(1)}px 0 ${T.grape}`; };
  return `<div style="position:absolute;left:16px;top:22px;transform:rotate(-3deg);transform-origin:0 0;display:flex;flex-direction:column;align-items:flex-start">
    ${b ? `<div style="font:30px 'Titan One';color:#fff;line-height:1;${o(30)}">${a}</div><div style="font:52px 'Titan One';color:${T.sun};line-height:1;margin-top:2px;transform:rotate(-1deg);${o(52)}">${b}</div>`
      : `<div style="font:50px 'Titan One';color:${T.sun};line-height:1;${o(50)}">${a}</div>`}</div>`;
};
const names = [['PEWFIELD', null, 'PICK · Pewfield'], ['DUELFIELD', null, 'Backup 1 · Duelfield'], ['GRUDGE', 'GAMES', 'Backup 2 · Grudge Games']];
await shoot(`<div style="width:1290px;background:#fff;padding:16px 20px;font:800 15px 'Baloo 2';color:${T.grape}">
  <div style="font:24px 'Titan One';margin-bottom:8px">Name test: CrazyGames card 400x225, then 50 % (tiny tile)</div>
  <div style="display:flex;gap:20px">${names.map(([a, b, l]) => `<div><div style="margin-bottom:4px">${l}</div>${card(wm(a, b))}<div style="margin-top:10px;transform:scale(.5);transform-origin:0 0;width:200px;height:113px">${card(wm(a, b))}</div></div>`).join('')}</div></div>`,
  1290, 440, path.join(here, '../../../growth/game-name-cd-2026-11-28-thumbs.png'));

await browser.close();
