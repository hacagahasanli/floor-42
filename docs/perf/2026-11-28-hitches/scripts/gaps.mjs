import fs from 'node:fs';
const j = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const ev = Array.isArray(j) ? j : j.traceEvents;
const bmf = ev.filter((e) => e.name === 'ProxyMain::BeginMainFrame' && e.ph === 'X').sort((a, b) => a.ts - b.ts);
const t0 = bmf[0].ts;
for (let i = 1; i < bmf.length; i++) { const g = (bmf[i].ts - bmf[i - 1].ts) / 1000; if (g > 40) console.log('gap', g.toFixed(1), 'at trace+', ((bmf[i - 1].ts - t0) / 1000).toFixed(0), 'ts', bmf[i - 1].ts, 'durBMF', (bmf[i].dur / 1000).toFixed(1), 'pid/tid', bmf[i].pid, bmf[i].tid); }
