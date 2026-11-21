/**
 * Checks the portal folder against the CrazyGames technical rules we can test offline, and prints its size:
 *  - at most 1500 files, at most 250 MB in all, initial download well under 20 MB (mobile homepage);
 *  - relative paths only (no "/assets/..." in index.html or in the code);
 *  - no links or requests to our own sites, GitHub or other portals (the only absolute URLs allowed are the CrazyGames SDK
 *    and the game server of online play);
 *  - no support link, no stats address in the bundle;
 *  - none of the studio's developer jokes in the shipped text.
 * Exits with 1 when a rule is broken, so `npm run build:portal` fails.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const dir = new URL('../dist/portal/', import.meta.url).pathname;
const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
};
walk(dir);

const JOKES = [/merge-conflict jokes/i, /Merge conflicts, code review/i, /Game words/, /Developer: merge/i];
const OUTBOUND = [/nalbakigames\.com/i, /mergeconflictgames/i, /itch\.io/i, /github\.com\/hacagahasanli/i, /Support us/, /donate/i, /vercel\.app/i, /\bpoki\b/i, /nalbaki-stats/i];

let raw = 0;
let gz = 0;
const problems = [];
const rows = [];
for (const f of files) {
  const buf = readFileSync(f);
  const g = /\.(js|css|html|svg|json)$/.test(f) ? gzipSync(buf, { level: 9 }).length : buf.length;
  raw += buf.length;
  gz += g;
  rows.push([relative(dir, f), buf.length, g]);
  if (/\.(js|html|css)$/.test(f)) {
    const text = buf.toString('utf8');
    const urls = text.match(/(?:https?|wss?):\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s"'`)]*/gi) ?? [];
    for (const u of urls) {
      // Allowed: the CrazyGames SDK, our game server (online play), and spec/namespace strings inside libraries (never fetched or shown).
      if (/^https:\/\/sdk\.crazygames\.com\//.test(u)) continue;
      if (/^wss:\/\/floor42-game\.fly\.dev/.test(u)) continue;
      if (/^https?:\/\/(www\.w3\.org|reactjs\.org|react\.dev|github\.com\/mrdoob|threejs\.org|fb\.me|tailwindcss\.com|github\.com\/facebook\/react)/.test(u)) continue;
      problems.push(`${relative(dir, f)}: absolute URL ${u}`);
    }
    for (const bad of [...JOKES, ...OUTBOUND]) {
      const m = text.match(bad);
      if (m) problems.push(`${relative(dir, f)}: forbidden text "${m[0]}"`);
    }
    if (/\.js$/.test(f) && /["'`]\/assets\//.test(text)) problems.push(`${relative(dir, f)}: absolute /assets/ path`);
  }
}
const html = readFileSync(join(dir, 'index.html'), 'utf8');
for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) if (m[1].startsWith('/') && !m[1].startsWith('//')) problems.push(`index.html: absolute path ${m[1]}`);
if (files.length > 1500) problems.push(`too many files: ${files.length}`);
if (raw > 250e6) problems.push(`too big: ${raw}`);
if (raw > 20e6) problems.push(`initial download over 20 MB: ${raw}`);

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
rows.sort((a, b) => b[1] - a[1]);
for (const [f, r, g] of rows.slice(0, 15)) console.log(`${f.padEnd(48)} ${kb(r).padStart(10)} ${kb(g).padStart(10)} gz`);
if (rows.length > 15) console.log(`... and ${rows.length - 15} smaller files`);
const code = rows.filter(([f]) => /\.(js|css|html)$/.test(f)).reduce((a, [, , g]) => a + g, 0);
console.log(`\n${files.length} files, ${kb(raw)} on disk, ${kb(gz)} over the wire (gzip); code ${kb(code)} gz`);
if (problems.length) {
  console.error('\nPortal build problems:\n' + problems.map((p) => '  - ' + p).join('\n'));
  process.exit(1);
}
console.log('Portal checks passed: relative paths, file count, size, no outbound links, no support link, neutral text.');
