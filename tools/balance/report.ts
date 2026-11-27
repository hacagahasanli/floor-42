/**
 * Markdown tables from run.ts --out files.
 *   npx tsx tools/balance/report.ts tools/balance/results/baseline.json tools/balance/results/final.json
 */
import { readFileSync } from 'node:fs';

import { NAMES, ROSTER } from './match';

interface Cell {
  n: number;
  sum: number;
  sumSq: number;
}
const ci = (c: Cell) => {
  const p = c.sum / c.n;
  return { p: 100 * p, h: (100 * 1.96 * Math.sqrt(Math.max(0, c.sumSq / c.n - p * p))) / Math.sqrt(c.n) };
};

for (const file of process.argv.slice(2)) {
  const j = JSON.parse(readFileSync(file, 'utf8')) as { grid: Record<string, Record<string, Record<string, Cell>>> };
  for (const [key, g] of Object.entries(j.grid)) {
    console.log(`\n**${file.split('/').pop()} · ${key}** (row win % vs column ±95% CI, n=${g.hotfix.legacy.n}/cell)\n`);
    console.log(`| | ${ROSTER.map((c) => NAMES[c]).join(' | ')} | vs field |`);
    console.log(`|---|${ROSTER.map(() => '---').join('|')}|---|`);
    for (const r of ROSTER) {
      const tot: Cell = { n: 0, sum: 0, sumSq: 0 };
      const cells = ROSTER.map((c) => {
        if (c === r) return '-';
        const x = g[r][c];
        tot.n += x.n;
        tot.sum += x.sum;
        tot.sumSq += x.sumSq;
        const { p, h } = ci(x);
        const flag = p < 45 || p > 55 ? '**' : '';
        return `${flag}${p.toFixed(1)}${flag} ±${h.toFixed(1)}`;
      });
      const t = ci(tot);
      console.log(`| ${NAMES[r]} | ${cells.join(' | ')} | ${t.p.toFixed(1)} ±${t.h.toFixed(1)} |`);
    }
  }
}
