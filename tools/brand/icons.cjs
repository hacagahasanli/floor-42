/**
 * Renders the PNG icons from public/favicon.svg with a headless Chromium (playwright-core).
 *   node tools/brand/icons.cjs [path/to/playwright-core]
 * Then: python3 tools/brand/ico.py  (packs favicon-16/32 into favicon.ico).
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.argv[2] || 'playwright-core');

const pub = path.resolve(__dirname, '../../public');
const svg = fs.readFileSync(path.join(pub, 'favicon.svg')).toString('base64');
const src = `data:image/svg+xml;base64,${svg}`;
// [file, size, background, emblem share of the canvas]
const jobs = [
  ['favicon-16.png', 16, null, 1],
  ['favicon-32.png', 32, null, 1],
  ['apple-touch-icon.png', 180, '#0B0F1E', 0.86],
  ['icons/icon-192.png', 192, '#0B0F1E', 0.9],
  ['icons/icon-512.png', 512, '#0B0F1E', 0.9],
  ['icons/maskable-512.png', 512, '#0B0F1E', 0.7], // inside the 80% safe zone
];

(async () => {
  const browser = await chromium.launch();
  for (const [file, size, bg, share] of jobs) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    const s = Math.round(size * share);
    await page.setContent(
      `<body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;background:${bg ?? 'transparent'}"><img src="${src}" style="width:${s}px;height:${s}px"></body>`,
    );
    await page.waitForTimeout(100);
    await page.screenshot({ path: path.join(pub, file), omitBackground: !bg });
    await page.close();
  }
  await browser.close();
})();
