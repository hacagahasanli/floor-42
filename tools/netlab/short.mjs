import { execFileSync } from 'child_process';
const r = JSON.parse(execFileSync('node', ['analyze.mjs', ...process.argv.slice(2)]).toString());
const s = (o) => o ? `p50 ${o.p50} p95 ${o.p95} p99 ${o.p99} max ${o.max} (n ${o.n})` : '-';
for (const side of ['host', 'guest']) {
  const x = r[side];
  console.log(`== ${side} hud ${JSON.stringify(x.hud)}`);
  console.log(` frame ms        ${s(x.frameMs)} | >50ms: ${x.framesOver50}`);
  console.log(` snap gap ms     ${s(x.snapGapMs)} | out-of-order applied: ${x.snapsOutOfOrder}`);
  console.log(` own correction  ${s(x.ownCorrection)} | >0.5u: ${x.ownCorrectionsOver05}`);
  console.log(` riv correction  ${s(x.rivalCorrection)}`);
  console.log(` ack delay ms    ${s(x.ackDelayMs)}`);
  console.log(` rival step/tick ${s(x.rivalStepPerTick)} | teleports>1u: ${x.rivalTeleportsOver1}`);
  console.log(` rival view err  ${s(x.rivalViewErr)} | visible freeze max ${x.rivalVisibleFreezeMaxMs} ms`);
  console.log(` freeze-then-dead: ${x.freezeThenDead}/${x.deaths.length} | hp drops ${x.hpDrops}, with no rival shot drawn near in 250 ms: ${x.unseenDrops}`);
  console.log(` deaths ${x.deaths.length}, surprise (hp>=60 150ms before KO): ${x.surpriseDeaths} ${JSON.stringify(x.deaths.map(d=>[d.hp150|0,d.hp300|0,d.sawProjectile]))}`);
  if (x.lastNet) console.log(` net ${JSON.stringify(x.lastNet)}`);
}
console.log(`authority hits ${r.authHits} kos ${r.authKos}; victim's own screen vs authority pos at hit: host ${s(r.hitWhereVictimSawItself.host)} | guest ${s(r.hitWhereVictimSawItself.guest)}`);
