/**
 * Balance harness: all matchups x bot levels x arenas x seeds, both side orders, on worker threads.
 *
 *   npx tsx tools/balance/run.ts --seeds 600 --levels easy,normal,hard --arenas offsite,office --mode both
 *   npx tsx tools/balance/run.ts --seeds 400 --mode after --leap --cfg '{"teaBreak":{"regenAfter":2}}'
 *
 * --mode before  real src/ sim, no traits    --mode after  patched sim, traits on    --mode both
 * --mode real    the shipped src/ sim with GameState.traits on (HP, power guns, traits all from src/game/sim/traits.ts)
 *                (the patched prototype needs the unpatched step.ts anchors: it no longer builds once src/ has the hooks)
 * --leap         Brix bot actively leapfrogs (a human using the trait on purpose)
 * --proposed     apply PROPOSED_HP + PROPOSED_GUNS (traits.ts) to both modes    --guns JSON  gun overrides
 * --cfg JSON     deep-merged over DEFAULT_TRAITS (tuning)    --stats JSON  per-character stat overrides
 *    --out file.json  raw aggregates
 * Every seed is played twice, once with each character as fighter 0 (step() updates fighter 0 first).
 */
import { writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';

import { NAMES, ROSTER } from './match';
import { buildPatchedStep } from './patchStep';
import { DEFAULT_TRAITS, PROPOSED_GUNS, PROPOSED_STATS } from './traits';

import type { BotLevel } from '../../src/game/sim/bot';
import type { ArenaId } from '../../src/game/sim/constants';
import type { CharacterId } from '../../src/game/sim/types';
import type { MatchArgs, MatchResult } from './match';
import type { TraitConfig } from './traits';


const arg = (k: string, d?: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i < 0 ? d : (process.argv[i + 1] ?? 'true');
};
const flag = (k: string) => process.argv.includes(`--${k}`);

const deepMerge = <T>(a: T, b: unknown): T => {
  if (typeof b !== 'object' || b === null) return (b as T) ?? a;
  const out = { ...(a as object) } as Record<string, unknown>;
  for (const [k, v] of Object.entries(b)) out[k] = typeof v === 'object' && v && !Array.isArray(v) ? deepMerge(out[k], v) : v;
  return out as T;
};

interface Cell {
  n: number;
  sum: number;
  sumSq: number;
  draws: number;
  ticks: number;
  /** Trait telemetry of the row character, summed. */
  leaps: number;
  rushes: number;
  teaHeal: number;
  extraFired: number;
}
const emptyCell = (): Cell => ({ n: 0, sum: 0, sumSq: 0, draws: 0, ticks: 0, leaps: 0, rushes: 0, teaHeal: 0, extraFired: 0 });

export const ci95 = (c: Cell) => {
  const p = c.sum / c.n;
  const sd = Math.sqrt(Math.max(0, c.sumSq / c.n - p * p));
  return { p, half: (1.96 * sd) / Math.sqrt(c.n) };
};

const main = async () => {
  const seeds = Number(arg('seeds', '200'));
  const levels = arg('levels', 'easy,normal,hard')!.split(',') as BotLevel[];
  const arenas = arg('arenas', 'offsite')!.split(',') as ArenaId[];
  const mode = arg('mode', 'both')!;
  const leapBot = flag('leap');
  const traits: TraitConfig = deepMerge(DEFAULT_TRAITS, JSON.parse(arg('cfg', '{}')!));
  const seed0 = Number(arg('seed0', '1000'));
  const guns = flag('proposed') ? PROPOSED_GUNS : arg('guns') ? JSON.parse(arg('guns')!) : undefined;
  const stats = flag('proposed') ? PROPOSED_STATS : arg('stats') ? JSON.parse(arg('stats')!) : undefined;
  if (mode === 'after' || mode === 'both') buildPatchedStep();

  const sims: { tag: string; sim: 'real' | 'patched' | 'realTraits'; traits?: TraitConfig }[] = [];
  if (mode === 'before' || mode === 'both') sims.push({ tag: 'before', sim: 'real' });
  if (mode === 'real') sims.push({ tag: 'real', sim: 'realTraits' });
  if (mode === 'after' || mode === 'both') sims.push({ tag: 'after', sim: 'patched', traits });

  const jobs: (MatchArgs & { key: string; row: CharacterId; col: CharacterId; rowSlot: number })[] = [];
  for (const s of sims)
    for (const level of levels)
      for (const arena of arenas)
        for (let i = 0; i < ROSTER.length; i++)
          for (let j = i; j < ROSTER.length; j++)
            for (let k = 0; k < seeds; k++)
              for (const swap of [false, true]) {
                const a = ROSTER[i];
                const b = ROSTER[j];
                jobs.push({
                  key: `${s.tag}|${level}|${arena}`,
                  row: a,
                  col: b,
                  rowSlot: swap ? 1 : 0,
                  chars: swap ? [b, a] : [a, b],
                  seed: seed0 + k * 31 + i * 7 + j * 3,
                  level,
                  arena,
                  sim: s.sim,
                  traits: s.traits,
                  leapBot,
                  stats,
                  guns,
                });
              }

  const threads = Math.max(1, availableParallelism() - 1);
  const chunks: (typeof jobs)[] = Array.from({ length: threads }, () => []);
  jobs.forEach((j, n) => chunks[n % threads].push(j));
  const t0 = Date.now();
  const results = await Promise.all(
    chunks.map(
      (chunk) =>
        new Promise<MatchResult[]>((res, rej) => {
          const w = new Worker(new URL('./worker-boot.mjs', import.meta.url), { workerData: chunk });
          w.once('message', res);
          w.once('error', rej);
        }),
    ),
  );
  const flat: [typeof jobs[number], MatchResult][] = [];
  chunks.forEach((c, i) => c.forEach((j, n) => flat.push([j, results[i][n]])));

  // Aggregate into ordered cells: grid[key][row][col] from the row character's point of view.
  const grid: Record<string, Record<string, Record<string, Cell>>> = {};
  const side: Record<string, Cell> = {};
  const lengths: Record<string, number[]> = {};
  for (const [j, r] of flat) {
    const g = (grid[j.key] ??= {});
    const rowScore = j.rowSlot === 0 ? r.score0 : 1 - r.score0;
    const add = (row: CharacterId, col: CharacterId, sc: number, slot: number) => {
      const c = ((g[row] ??= {})[col] ??= emptyCell());
      c.n += 1;
      c.sum += sc;
      c.sumSq += sc * sc;
      c.draws += r.score0 === 0.5 ? 1 : 0;
      c.ticks += r.ticks;
      const st = r.traits[slot];
      if (st) {
        c.leaps += st.leaps;
        c.rushes += st.rushes;
        c.teaHeal += st.teaHeal;
        c.extraFired += st.extraFired;
      }
    };
    add(j.row, j.col, rowScore, j.rowSlot);
    if (j.row !== j.col) add(j.col, j.row, 1 - rowScore, 1 - j.rowSlot);
    const sc = (side[j.key] ??= emptyCell());
    sc.n += 1;
    sc.sum += r.score0;
    sc.sumSq += r.score0 * r.score0;
    (lengths[j.key] ??= []).push(r.ticks / 60);
  }

  const pct = (x: number) => (100 * x).toFixed(1);
  console.log(`\n${jobs.length} matches in ${((Date.now() - t0) / 1000).toFixed(1)} s on ${threads} threads. seeds=${seeds} leapBot=${leapBot}`);
  if (sims.some((s) => s.traits)) console.log('traits:', JSON.stringify(traits));
  if (stats) console.log('stats override:', JSON.stringify(stats));
  if (guns) console.log('guns override:', JSON.stringify(guns));
  const summary: Record<string, unknown> = {};
  for (const key of Object.keys(grid)) {
    const g = grid[key];
    console.log(`\n== ${key}  (row win % vs column, ±95% CI; n per cell = ${g[ROSTER[0]][ROSTER[1]].n}) ==`);
    console.log(['', ...ROSTER.map((c) => NAMES[c])].map((s) => s.padEnd(15)).join(''));
    let worst = 0;
    for (const r of ROSTER) {
      const cells = ROSTER.map((c) => {
        const { p, half } = ci95(g[r][c]);
        if (r !== c) worst = Math.max(worst, Math.abs(p - 0.5));
        return `${pct(p)}±${pct(half)}`;
      });
      console.log([NAMES[r], ...cells].map((s) => s.padEnd(15)).join(''));
    }
    const overall = ROSTER.map((r) => {
      const tot = emptyCell();
      for (const c of ROSTER)
        if (c !== r) for (const k of Object.keys(tot) as (keyof Cell)[]) tot[k] += g[r][c][k];
      const { p, half } = ci95(tot);
      return { char: NAMES[r], win: p, ci: half, perMatch: { leaps: tot.leaps / tot.n, rushes: tot.rushes / tot.n, teaHeal: tot.teaHeal / tot.n, extraFired: tot.extraFired / tot.n } };
    });
    for (const o of overall)
      console.log(
        `  ${o.char.padEnd(5)} vs field ${pct(o.win)}±${pct(o.ci)}  per match: leaps ${o.perMatch.leaps.toFixed(2)} rushes ${o.perMatch.rushes.toFixed(2)} teaHeal ${o.perMatch.teaHeal.toFixed(1)} hp extraRounds ${o.perMatch.extraFired.toFixed(1)}`,
      );
    const L = lengths[key].sort((a, b) => a - b);
    const q = (x: number) => L[Math.floor(x * (L.length - 1))].toFixed(0);
    const sd = ci95(side[key]);
    const draws = Object.values(g).flatMap((x) => Object.values(x)).reduce((a, c) => a + c.draws, 0);
    console.log(`  max |win-50| off-diagonal: ${pct(worst)} pts. fighter-0 win ${pct(sd.p)}±${pct(sd.half)}. match length p10/p50/p90 ${q(0.1)}/${q(0.5)}/${q(0.9)} s`);
    summary[key] = { overall, worst, side: sd, draws };
  }
  const out = arg('out');
  if (out) writeFileSync(out, JSON.stringify({ seeds, levels, arenas, leapBot, traits, stats, guns, grid, summary }, null, 1));
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
