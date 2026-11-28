// node win.mjs trace tsCenter(us) halfWidthMs minMs
import fs from 'node:fs';
const [file, c, hw, min] = [process.argv[2], +process.argv[3], +process.argv[4], +process.argv[5]];
const j = JSON.parse(fs.readFileSync(file, 'utf8'));
const ev = Array.isArray(j) ? j : j.traceEvents;
const names = {};
for (const e of ev) if (e.ph === 'M' && e.name === 'thread_name') names[e.pid + ':' + e.tid] = e.args.name;
const out = ev.filter((e) => e.ph === 'X' && e.ts + e.dur >= c - hw * 1000 && e.ts <= c + hw * 1000 && e.dur > min * 1000).sort((a, b) => a.ts - b.ts);
for (const e of out.slice(0, 150)) console.log(((e.ts - c) / 1000).toFixed(1), (e.dur / 1000).toFixed(1), names[e.pid + ':' + e.tid] || e.tid, e.name, JSON.stringify(e.args?.data ? { fn: e.args.data.functionName, url: (e.args.data.url || '').split('/').pop(), ln: e.args.data.lineNumber } : '').slice(0, 120));
