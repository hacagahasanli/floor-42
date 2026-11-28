import fs from 'node:fs';
for (const tag of process.argv.slice(2)) {
  const r = JSON.parse(fs.readFileSync(`out/${tag}.json`));
  for (const m of r.matches) {
    const gs = m.gameplayStart;
    const bad = m.frames.filter(([t, d]) => d > 33.5).map(([t, d]) => `${((t - gs) / 1000).toFixed(2)}s:${d}`);
    console.log(tag, 'm' + m.m, 'max', Math.max(...m.frames.map((x) => x[1])), 'over33', bad.length, bad.join(' '));
    for (const l of m.loaf.filter((l) => l.dur > 50)) console.log('   LoAF', ((l.start - gs) / 1000).toFixed(2), l.dur | 0, 'render@', ((l.rs - l.start) | 0), JSON.stringify(l.scripts.map((s) => [s.d | 0, s.type, (s.src || '').split('/').pop(), s.fn, s.pos])).slice(0, 200));
  }
}
