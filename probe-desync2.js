// probe-desync2.js - same model as probe-desync.js, but against the FIXED
// si-sim.js (snapshot + restore) and the FIXED mp-client.js netcode (anchor the
// history at the snapshot's own step index, roll back no further than the anchor).
//
// Expectation: EVERY client, whatever its join tick and phase offset, converges
// to the server's world. If any client sees a different fleet/phase, the fix
// failed.
'use' + ' strict';
const fs = require('fs');
const S = (() => {
  const src = fs.readFileSync('si-sim.js', 'utf8');
  const mod = { exports: {} };
  new Function('module', 'require', 'window', src)(mod, require('module').require, undefined);
  return mod.exports;
})();

const TICK = 50, D = 3, RB = 8;
const clone = (w) => JSON.parse(JSON.stringify(w));

const seed = 987654321;
function newWorld(names) {
  const w = S.create('normal', seed);
  for (const n of names) S.addPlayer(w, n);
  w.status = 'live';
  return w;
}
const Ws = newWorld(['P0', 'P1']);
const trueIn = [];
const snapS = [];
for (let t = 0; t < 400; t++) {
  const inp = [0, 1].map((s) => [((t >> (s + 1)) & 1) ? 1 : -1, (t % 9 === 0) ? 1 : 0, t % (3 + s) !== 0 ? 1 : 0]);
  trueIn.push(inp);
  for (let s = 0; s < 2; s++) S.applyInput(Ws, s, inp[s][0], inp[s][1], inp[s][2]);
  S.step(Ws, TICK);
  const snap = S.snapshot(Ws);
  snap.i = Ws.players.map((p) => [p.mx, p.my, p.fire ? 1 : 0]);
  snapS.push(snap);
}

// ---- client model mirroring the FIXED mp-client.js ----
function makeClient(seat, joinTick) { return { sim: null, hist: [], recv: {}, tick: 0, base: null, lastAuth: -1, own: {}, anchor: 0 }; }
function seedClient(c, s) {
  const lastStep = s.t - 1;
  if (lastStep < 0) return false;
  c.hist = []; c.recv = {}; c.own = {};
  if (lastStep === 0) {
    c.sim = S.create(s.md || 'normal', s.seed);
    for (const p of (s.ps || [])) S.addPlayer(c.sim, p[1]);
    c.sim.status = 'live';
    c.base = clone(c.sim);
    c.anchor = 0; c.tick = 0;
  } else {
    c.sim = S.restore(s);
    c.base = clone(c.sim);
    c.anchor = lastStep + 1; c.tick = lastStep + 1;
    c.hist[lastStep] = { world: c.base, inputs: s.i || null };
  }
  c.lastAuth = lastStep;
  return true;
}
const instantInput = (t, seat) => [((t >> (seat + 1)) & 1) ? 1 : -1, (t % 9 === 0) ? 1 : 0, t % (3 + seat) !== 0 ? 1 : 0];
function predictFor(c, t, seat, mySeat) {
  if (seat === mySeat) { if (c.own[t]) return c.own[t]; return instantInput(t, seat); }
  const h = c.hist[t - 1];
  if (h && h.inputs[seat]) return h.inputs[seat];
  return [0, 0, 0];
}
function inputFor(c, t, seat, mySeat) {
  if (c.recv[t] && c.recv[t][seat]) return c.recv[t][seat];
  return predictFor(c, t, seat, mySeat);
}
function stepTick(c, t, mySeat) {
  const inp = [];
  for (let s = 0; s < c.sim.players.length; s++) inp.push(inputFor(c, t, s, mySeat));
  for (let s = 0; s < c.sim.players.length; s++) S.applyInput(c.sim, s, inp[s][0], inp[s][1], inp[s][2]);
  S.step(c.sim, TICK);
  c.own[t] = inp[mySeat];
  c.hist[t] = { world: clone(c.sim), inputs: inp };
}
function rollbackTo(c, tp, mySeat) {
  if (tp <= c.anchor) c.sim = clone(c.base);
  else { const h = c.hist[tp - 1]; if (!h) return; c.sim = clone(h.world); }
  for (let t2 = tp; t2 < c.tick; t2++) {
    const in2 = [];
    for (let s = 0; s < c.sim.players.length; s++) in2.push(inputFor(c, t2, s, mySeat));
    for (let s = 0; s < c.sim.players.length; s++) S.applyInput(c.sim, s, in2[s][0], in2[s][1], in2[s][2]);
    S.step(c.sim, TICK);
    c.own[t2] = in2[mySeat];
    c.hist[t2] = { world: clone(c.sim), inputs: in2 };
  }
}
function handleSimSnapshot(c, s, mySeat) {
  const k = s.t - 1;
  if (s.i) c.recv[k] = s.i;
  if (k > c.lastAuth) c.lastAuth = k;
  for (let tp = Math.max(c.anchor, k - RB); tp < k; tp++) {
    const r = c.recv[tp];
    if (!r) continue;
    const h = c.hist[tp];
    if (!h) continue;
    let bad = false;
    for (let s2 = 0; s2 < r.length; s2++) if (String(h.inputs[s2]) !== String(r[s2])) { bad = true; break; }
    if (!bad) continue;
    rollbackTo(c, tp, mySeat);
    break;
  }
}
function simStep(c, mySeat) {
  if (!c.sim) return;
  if (c.tick > c.lastAuth + D) return;
  stepTick(c, c.tick, mySeat);
  c.tick++;
}

const N = 400;
const A = makeClient(0, 0), B = makeClient(1, 120), Cc = makeClient(0, 250);
seedClient(A, snapS[0]);
let bSeeded = false, cSeeded = false;
for (let t = 0; t < N; t++) {
  if (t >= 120 && !bSeeded) { seedClient(B, snapS[t]); bSeeded = true; }
  if (t >= 250 && !cSeeded) { seedClient(Cc, snapS[t]); cSeeded = true; }
  simStep(A, 0); handleSimSnapshot(A, snapS[t], 0);
  if (bSeeded) { simStep(B, 1); handleSimSnapshot(B, snapS[t], 1); }
  if (cSeeded) { simStep(Cc, 0); handleSimSnapshot(Cc, snapS[t], 0); }
}

function firstDivergence(c, mySeat) {
  for (let t = 0; t < N; t++) {
    const settled = t - D;
    if (settled < 0 || !c.hist[settled]) continue;
    const mine = S.snapshot(c.hist[settled].world), theirs = snapS[settled];
    if (JSON.stringify(mine.en) !== JSON.stringify(theirs.en) || mine.lv !== theirs.lv) {
      if (c === B) {
        console.log('detail tick ' + settled + ': client inputs ' + JSON.stringify(c.hist[settled].inputs) +
          ' vs truth ' + JSON.stringify(trueIn[settled]) +
          '; anchor=' + c.anchor + ' lastAuth=' + c.lastAuth + ' tick=' + c.tick);
        const a = mine.en, b = theirs.en;
        if (a.length === b.length)
          for (let i = 0; i < a.length; i++)
            if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) { console.log('  enemy[' + i + '] ' + JSON.stringify(a[i]) + ' vs ' + JSON.stringify(b[i])); break; }
        else console.log('  enemy count ' + a.length + ' vs ' + b.length);
      }
      return { tick: settled, mineLv: mine.lv, theirLv: theirs.lv, mineEn: mine.en.length, theirEn: theirs.en.length };
    }
  }
  return null;
}
console.log('A first divergence:', JSON.stringify(firstDivergence(A, 0)));
console.log('B first divergence:', JSON.stringify(firstDivergence(B, 1)));
console.log('C first divergence:', JSON.stringify(firstDivergence(Cc, 0)));

const an = B.anchor;
const h = B.hist[an];
console.log('B hist[' + an + '] tick=' + (h ? S.snapshot(h.world).t : 'n/a') +
  ' enemies=' + (h ? S.snapshot(h.world).en.length : 'n/a') +
  '  server snap[' + an + '] tick=' + snapS[an].t + ' enemies=' + snapS[an].en.length);

// The clients run up to D ticks AHEAD of the last authority, so compare the
// settled history at the SAME step index, not each client's live sim.
const at = (c, t) => c.hist[t] ? S.snapshot(c.hist[t].world) : null;
const sa = at(A, 399), sb = at(B, 399), sc = at(Cc, 399), ss = snapS[399];
const same = (x, y) => JSON.stringify(x.ps) === JSON.stringify(y.ps) && x.lv === y.lv && x.en.length === y.en.length && x.s2 === y.s2 && JSON.stringify(x.en) === JSON.stringify(y.en);
console.log('server  lv=' + Ws.level + ' stage=' + Ws.stage + ' enemies=' + Ws.enemies.length + ' tick=' + Ws.tick);
console.log('A lv=' + sa.lv + ' enemies=' + sa.en.length + ' tick=' + sa.t);
console.log('B lv=' + sb.lv + ' enemies=' + sb.en.length + ' tick=' + sb.t);
console.log('C lv=' + sc.lv + ' enemies=' + sc.en.length + ' tick=' + sc.t);
console.log('A vs server identical:', same(sa, ss));
console.log('B vs server identical:', same(sb, ss));
console.log('C vs server identical:', same(sc, ss));
console.log('A vs B identical:', same(sa, sb));
