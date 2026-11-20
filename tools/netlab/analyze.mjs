// node analyze.mjs run.json [serverlog] -> metrics (JSON + a readable summary)
import fs from 'fs';
const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const serverLog = process.argv[3] ? fs.readFileSync(process.argv[3], 'utf8') : '';
const DT = 1000 / 60;
const q = (a, p) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2);
};
const stats = (a0) => { const a = a0.filter((x) => typeof x === 'number' && !Number.isNaN(x)); return ({ n: a.length, p50: q(a, 0.5), p95: q(a, 0.95), p99: q(a, 0.99), max: a.length ? +Math.max(...a).toFixed(2) : null }); };

const fightFrames = (fr) => fr.filter((f) => f.f && f.ph === 'fight');
const res = {};
for (const side of ['host', 'guest']) {
  const P = d[side];
  const fr = fightFrames(P.frames);
  const t0 = fr.length ? fr[0].t : 0;
  const dts = fr.slice(1).map((f) => f.dt);
  const snaps = P.probe.filter((p) => p.k === 'snap' && p.t >= t0);
  const gaps = snaps.slice(1).map((s, i) => s.t - snaps[i].t);
  const outOfOrder = snaps.filter((s, i) => i > 0 && s.tick < snaps[i - 1].tick).length;
  const recs = P.probe.filter((p) => p.k === 'rec' && p.t >= t0);
  const nets = fr.filter((f) => f.net).map((f) => f.net);
  res[side] = {
    frameMs: stats(dts),
    framesOver50: dts.filter((x) => x > 50).length,
    snapGapMs: stats(gaps),
    snapsOutOfOrder: outOfOrder,
    ownCorrection: stats(recs.map((r) => r.own)),
    ownCorrectionsOver05: recs.filter((r) => r.own > 0.5).length,
    rivalCorrection: stats(recs.map((r) => r.riv)),
    ackDelayMs: stats(recs.map((r) => r.replay * DT)),
    underruns: nets.length ? nets[nets.length - 1].underruns : null,
    lastNet: nets.length ? nets[nets.length - 1] : null,
    hud: P.hud,
  };
  // Rendered rival: biggest per-frame jump (a teleport) and visible freezes (rendered rival still
  // while the true fighter, read from the other browser, moved > 0.5 units).
  const other = fightFrames(d[side === 'host' ? 'guest' : 'host'].frames);
  const trueAt = (t, id) => {
    // other page's own state for fighter id at wall time t (nearest frame before)
    let lo = 0;
    let hi = other.length - 1;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (other[m].t <= t) lo = m;
      else hi = m - 1;
    }
    return other[lo] && other[lo].f[id];
  };
  const me = fr[0]?.me ?? 0;
  const riv = 1 - me;
  let jumps = [];
  let freezeMax = 0;
  let freezeStart = null;
  let freezeCount = 0;
  const errs = [];
  for (let i = 1; i < fr.length; i++) {
    const a = fr[i - 1];
    const b = fr[i];
    if (!a.v || !b.v) continue;
    const alive = b.f[riv][3] <= 0 && a.f[riv][3] <= 0;
    if (!alive) {
      freezeStart = null;
      continue;
    }
    const step = Math.hypot(b.v[riv][0] - a.v[riv][0], b.v[riv][1] - a.v[riv][1]);
    jumps.push(step / Math.max(1, b.dt / DT));
    const tr = trueAt(b.t, riv);
    if (tr) errs.push(Math.hypot(tr[0] - b.v[riv][0], tr[1] - b.v[riv][1]));
    if (step < 1e-3) {
      if (freezeStart === null) freezeStart = i - 1;
      const t1 = trueAt(fr[freezeStart].t, riv);
      const t2 = trueAt(b.t, riv);
      if (t1 && t2 && Math.hypot(t2[0] - t1[0], t2[1] - t1[1]) > 0.5) {
        const dur = b.t - fr[freezeStart].t;
        if (dur > freezeMax) freezeMax = dur;
      }
    } else {
      if (freezeStart !== null && b.t - fr[freezeStart].t > 100) freezeCount++;
      freezeStart = null;
    }
  }
  res[side].rivalStepPerTick = stats(jumps);
  res[side].rivalTeleportsOver1 = jumps.filter((j) => j > 1).length;
  res[side].rivalViewErr = stats(errs);
  res[side].rivalVisibleFreezeMaxMs = +freezeMax.toFixed(0);
  // Own deaths as seen on this screen: hp shown 150 / 300 ms before the KO and whether a rival
  // projectile was drawn near you in the 300 ms before.
  const deaths = [];
  for (let i = 1; i < fr.length; i++) {
    const a = fr[i - 1].f[me];
    const b = fr[i].f[me];
    if (a[3] <= 0 && b[3] > 0) {
      const t = fr[i].t;
      const at = (ms) => {
        let j = i;
        while (j > 0 && fr[j].t > t - ms) j--;
        return fr[j].f[me][2];
      };
      let saw = false;
      for (let j = i; j > 0 && fr[j].t > t - 300; j--) if (fr[j].np > 0) saw = true;
      deaths.push({ t: Math.round(t - t0), hp150: at(150), hp300: at(300), sawProjectile: saw });
    }
  }
  // "Froze, then I was dead": a KO preceded (within 1 s) by a frozen moment on this screen: a
  // render frame >= 100 ms, the world held by hitstop for >= 5 frames, or the drawn rival standing
  // still >= 150 ms while the real one moved.
  const frozenAt = [];
  {
    let hsRun = 0;
    let stillFrom = null;
    for (let i = 1; i < fr.length; i++) {
      const f = fr[i];
      if (f.dt >= 100) frozenAt.push(f.t);
      hsRun = f.hs > 0 ? hsRun + 1 : 0;
      if (hsRun === 5) frozenAt.push(f.t);
      if (f.v && fr[i - 1].v && f.f[riv][3] <= 0) {
        const st = Math.hypot(f.v[riv][0] - fr[i - 1].v[riv][0], f.v[riv][1] - fr[i - 1].v[riv][1]) < 1e-3;
        if (st) {
          if (stillFrom === null) stillFrom = i - 1;
          const t1 = trueAt(fr[stillFrom].t, riv);
          const t2 = trueAt(f.t, riv);
          if (f.t - fr[stillFrom].t >= 150 && t1 && t2 && Math.hypot(t2[0] - t1[0], t2[1] - t1[1]) > 0.5) frozenAt.push(f.t);
        } else stillFrom = null;
      }
    }
  }
  for (const dd of deaths) dd.frozeBefore = frozenAt.some((t) => t <= dd.t + t0 && t > dd.t + t0 - 1000);
  // Hits shown with no rival shot drawn near you in the 250 ms before ("a hit I never saw").
  let drops = 0;
  let unseen = 0;
  for (let i = 1; i < fr.length; i++) {
    if (fr[i].f[me][2] < fr[i - 1].f[me][2] - 0.5 && fr[i].f[me][3] <= 0 && fr[i - 1].f[me][3] <= 0) {
      drops++;
      let saw = false;
      for (let j = i - 1; j > 0 && fr[j].t > fr[i].t - 250; j--) if (fr[j].np > 0) saw = true;
      if (!saw) unseen++;
    }
  }
  res[side].hpDrops = drops;
  res[side].unseenDrops = unseen;
  res[side].freezeThenDead = deaths.filter((x) => x.frozeBefore).length;
  res[side].deaths = deaths;
  res[side].surpriseDeaths = deaths.filter((x) => x.hp150 >= 60).length;
}
// Authority hits on each fighter vs where that fighter's own screen had it at the same moment.
const auth = [];
for (const p of d.host.probe) if (p.k === 'auth') auth.push(p);
for (const line of serverLog.split('\n')) {
  if (!line.startsWith('AUTH ')) continue;
  const a = JSON.parse(line.slice(5));
  if (a.t >= d.startedAt && a.t <= d.endedAt) auth.push(a);
}
const own = { 0: fightFrames(d.host.frames), 1: fightFrames(d.guest.frames) };
const hostSlot = d.host.frames.find((f) => f.f)?.me ?? 0;
const pageOf = (slot) => (slot === hostSlot ? own[0] : own[1]);
const disp = { host: [], guest: [] };
for (const a of auth) {
  if (a.e !== 'hit') continue;
  const fr = pageOf(a.victim);
  let j = fr.findIndex((f) => f.t >= a.t);
  if (j < 0) continue;
  const v = fr[j].f[a.victim];
  disp[a.victim === hostSlot ? 'host' : 'guest'].push(Math.hypot(v[0] - a.x, v[1] - a.y));
}
res.hitWhereVictimSawItself = { host: stats(disp.host), guest: stats(disp.guest) };
res.authHits = auth.filter((a) => a.e === 'hit').length;
res.authKos = auth.filter((a) => a.e === 'ko').length;
console.log(JSON.stringify(res, null, 1));
