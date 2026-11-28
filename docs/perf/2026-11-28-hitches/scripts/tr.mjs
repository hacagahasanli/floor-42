// usage: node --max-old-space-size=8000 tr.mjs trace.json <perfNowStartMs> <perfNowEndMs>  -> events >2ms in window, by thread
import fs from 'node:fs';
const [file, a, b] = [process.argv[2], +process.argv[3], +process.argv[4]];
const j = JSON.parse(fs.readFileSync(file, 'utf8'));
const ev = Array.isArray(j) ? j : j.traceEvents;
// map perf.now() to trace ts: find a blink.user_timing / navigationStart? use 'navigationStart' event
const nav = ev.find((e) => e.name === 'navigationStart' && e.args?.data?.isLoadingMainFrame);
console.log('events', ev.length, 'nav', !!nav);
const names = {};
for (const e of ev) if (e.ph === 'M' && e.name === 'thread_name') names[e.pid + ':' + e.tid] = e.args.name;
// find FireAnimationFrame / BeginMainThreadFrame etc: use RunTask windows
const base = nav ? nav.ts : 0;
const lo = base + a * 1000, hi = base + b * 1000;
const out = ev.filter((e) => e.ph === 'X' && e.ts >= lo && e.ts <= hi && e.dur > (+process.env.MIN||2)*1000 && /./.test(names[e.pid + ':' + e.tid] || ''));
out.sort((x, y) => x.ts - y.ts);
for (const e of out.slice(0, 120)) console.log(((e.ts - base) / 1000).toFixed(1), (e.dur / 1000).toFixed(1), names[e.pid + ':' + e.tid], e.name, JSON.stringify(e.args && (e.args.data || e.args)).slice(0, 140));
