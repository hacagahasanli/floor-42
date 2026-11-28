/**
 * Bot vs scripted player, or bot vs bot, on the shipped sim with traits on (as offline play ships), in parallel.
 *
 *   npx tsx tools/balance/smartbot/vs.ts --a bot:normal --b masher --seeds 200 --arenas offsite,office
 *   npx tsx tools/balance/smartbot/vs.ts --grid            # every bot level vs every scripted player (baseline table)
 *   npx tsx tools/balance/smartbot/vs.ts --roster smart:hard --seeds 150   # 4x4 character matrix, bot vs same bot
 *
 * Specs: bot:<easy|normal|hard> (src createBot), smart:<easy|normal|hard> (prototype), masher, strafer, decent.
 * Characters: random pair per seed (every ordered pair equally often) unless --roster. Each seed is played with both
 * side orders. Result = share of matches won by side A (draw = 0.5), with a 95 % CI.
 */
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';

import type { ArenaId } from '../../../src/game/sim/constants';
import type { CharacterId } from '../../../src/game/sim/types';
import type { VsJob, VsResult } from './vsMatch';

const arg = (k: string, d?: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i < 0 ? d : (process.argv[i + 1] ?? 'true');
};
const ROSTER: CharacterId[] = ['hotfix', 'legacy', 'standup', 'intern'];
const NAMES: Record<CharacterId, string> = { hotfix: 'BRIX', legacy: 'ORMO', standup: 'ZUZU', intern: 'TAVO' };

const runJobs = async (jobs: VsJob[]): Promise<VsResult[]> => {
  const threads = Math.max(1, availableParallelism() - 1);
  const chunks: VsJob[][] = Array.from({ length: threads }, () => []);
  jobs.forEach((j, n) => chunks[n % threads].push(j));
  const res = await Promise.all(
    chunks.map(
      (chunk) =>
        new Promise<VsResult[]>((ok, bad) => {
          const w = new Worker(new URL('./vsBoot.mjs', import.meta.url), { workerData: chunk });
          w.once('message', ok);
          w.once('error', bad);
        }),
    ),
  );
  const out: VsResult[] = new Array(jobs.length);
  chunks.forEach((c, i) => c.forEach((_, n) => (out[n * threads + i] = res[i][n])));
  return out;
};

const ci = (xs: number[]) => {
  const p = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(Math.max(0, xs.reduce((a, b) => a + b * b, 0) / xs.length - p * p));
  return { p, half: (1.96 * sd) / Math.sqrt(xs.length) };
};
const pct = (x: number) => (100 * x).toFixed(1);

const pairJobs = (a: string, b: string, seeds: number, arena: ArenaId, seed0: number): VsJob[] => {
  const jobs: VsJob[] = [];
  for (let k = 0; k < seeds; k++) {
    // --achar <id>: side A always plays this fighter (e.g. the easy bot drawn as each fighter, traits-balance.md §10).
    const ca = (arg('achar') as CharacterId | undefined) ?? ROSTER[k % 4];
    const cb = ROSTER[Math.floor(k / 4) % 4];
    const seed = seed0 + k * 7919;
    jobs.push({ specs: [a, b], chars: [ca, cb], seed, arena, aSlot: 0 });
    jobs.push({ specs: [b, a], chars: [cb, ca], seed: seed + 1, arena, aSlot: 1 });
  }
  return jobs;
};

const summarize = (jobs: VsJob[], res: VsResult[]) => {
  const score = res.map((r, i) => (jobs[i].aSlot === 0 ? r.score0 : 1 - r.score0));
  const { p, half } = ci(score);
  const kosA = res.reduce((s, r, i) => s + r.kos[jobs[i].aSlot], 0) / res.length;
  const kosB = res.reduce((s, r, i) => s + r.kos[1 - jobs[i].aSlot], 0) / res.length;
  const L = res.map((r) => r.ticks / 60).sort((x, y) => x - y);
  const q = (x: number) => L[Math.floor(x * (L.length - 1))].toFixed(0);
  const stat = (k: keyof VsResult['tele'][0]) => res.reduce((s, r, i) => s + (r.tele[jobs[i].aSlot]?.[k] ?? 0), 0) / res.length;
  const statB = (k: keyof VsResult['tele'][0]) => res.reduce((s, r, i) => s + (r.tele[1 - jobs[i].aSlot]?.[k] ?? 0), 0) / res.length;
  const brix = res.map((r, i) => ({ r, i })).filter(({ i }) => jobs[i].chars[jobs[i].aSlot] === 'hotfix');
  const leapsBrix = brix.reduce((a, { r, i }) => a + (r.tele[jobs[i].aSlot]?.leaps ?? 0), 0) / Math.max(1, brix.length);
  const zuzu = res.map((r, i) => ({ r, i })).filter(({ i }) => jobs[i].chars[jobs[i].aSlot] === 'standup');
  const rushZuzu = zuzu.reduce((a, { r, i }) => a + (r.tele[jobs[i].aSlot]?.rushes ?? 0), 0) / Math.max(1, zuzu.length);
  return { leapsBrix, rushZuzu, p, half, kosA, kosB, len: `${q(0.1)}/${q(0.5)}/${q(0.9)}`, n: res.length, stat, statB };
};

const main = async () => {
  const seeds = Number(arg('seeds', '100'));
  const arenas = arg('arenas', 'offsite')!.split(',') as ArenaId[];
  const seed0 = Number(arg('seed0', '5000'));
  const t0 = Date.now();
  if (arg('roster')) {
    const spec = arg('roster')!;
    for (const arena of arenas) {
      const jobs: VsJob[] = [];
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 4; j++) {
          if (i === j) continue;
          for (let k = 0; k < seeds; k++) jobs.push({ specs: [spec, spec], chars: [ROSTER[i], ROSTER[j]], seed: seed0 + k * 7919 + i * 31 + j * 7, arena, aSlot: 0 });
        }
      const res = await runJobs(jobs);
      const cell: Record<string, number[]> = {};
      const field: Record<string, number[]> = {};
      res.forEach((r, n) => {
        const [x, y] = jobs[n].chars;
        (cell[`${x}|${y}`] ??= []).push(r.score0);
        (cell[`${y}|${x}`] ??= []).push(1 - r.score0);
        (field[x] ??= []).push(r.score0);
        (field[y] ??= []).push(1 - r.score0);
      });
      console.log(`\n== roster ${spec} on ${arena}: row win % vs column (n=${2 * seeds} per cell) ==`);
      console.log(['', ...ROSTER.map((c) => NAMES[c])].map((s) => s.padEnd(13)).join(''));
      let worst = 0;
      for (const r of ROSTER) {
        const cells = ROSTER.map((c) => {
          if (r === c) return '-';
          const { p, half } = ci(cell[`${r}|${c}`]);
          worst = Math.max(worst, Math.abs(p - 0.5));
          return `${pct(p)}±${pct(half)}`;
        });
        console.log([NAMES[r], ...cells].map((s) => s.padEnd(13)).join(''));
      }
      console.log(`  vs field: ${ROSTER.map((r) => `${NAMES[r]} ${pct(ci(field[r]).p)}`).join('  ')}   max |win-50| ${pct(worst)} pts`);
    }
    console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)} s`);
    return;
  }
  const pairs: [string, string][] = arg('grid')
    ? (arg('bots', 'bot:easy,bot:normal,bot:hard')!.split(',').flatMap((b) => arg('players', 'masher,strafer,decent')!.split(',').map((p) => [b, p] as [string, string])))
    : [[arg('a', 'bot:normal')!, arg('b', 'masher')!]];
  console.log(`| A | B | arena | A win % ±95% | KOs A:B | len p10/p50/p90 s | A dodges/push/splat/pickups/power per match | acc A / B |`);
  console.log(`|---|---|---|---|---|---|---|---|`);
  for (const arena of arenas)
    for (const [a, b] of pairs) {
      const jobs = pairJobs(a, b, seeds, arena, seed0);
      const res = await runJobs(jobs);
      const s = summarize(jobs, res);
      console.log(`| ${a} | ${b} | ${arena} | ${pct(s.p)} ±${pct(s.half)} | ${s.kosA.toFixed(2)}:${s.kosB.toFixed(2)} | ${s.len} | ${s.stat('dashes').toFixed(1)}/${s.stat('pushes').toFixed(1)}/${s.stat('splats').toFixed(2)}/${s.stat('pickups').toFixed(1)}/${s.stat('power').toFixed(1)} | ${pct(s.stat('hits') / s.stat('shots'))}% of ${s.stat('shots').toFixed(0)} / ${pct(s.statB('hits') / s.statB('shots'))}% of ${s.statB('shots').toFixed(0)} | dmg ${s.stat('damage').toFixed(0)}:${s.statB('damage').toFixed(0)} power ${s.stat('power').toFixed(1)}:${s.statB('power').toFixed(1)} | leaps/BRIX match ${s.leapsBrix.toFixed(2)} rush/ZUZU match ${s.rushZuzu.toFixed(1)} |`);
    }
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)} s, n per row = ${2 * seeds}`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
