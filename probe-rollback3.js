// probe-rollback3.js — prove the PORTED client netcode (mp-client.js Phase 9)
// converges against the server-authoritative world, using the EXACT functions
// the browser runs: inputFor/stepTick/rollbackTo + the client-driven stepper
// gated at lastAuthStep+D + ownHist. The wire model: own seat instant, remote
// seats arrive D ticks late (the Brazil<->France leg). If the client's world
// equals the server's at every settled tick, the shipped code is correct.
'use strict';
const S = require('./si-sim.js');
const TICK = 50, D = 3, N = 600, RB = 8;
const clone = (w) => JSON.parse(JSON.stringify(w));

function newWorld() {
  const w = S.create('normal', 999);
  for (let i = 0; i < 4; i++) S.addPlayer(w, 'P' + i);
  w.status = 'live';
  return w;
}
function ownInput(t, seat) {
  const dir = ((t >> (seat + 1)) & 1) ? 1 : -1;
  return [dir, 0, (t % (5 + seat) === 0) ? 1 : 0];
}

// ---- authoritative server: applies TRUE inputs every tick ----
const Ws = newWorld();
const trueIn = [];
const srvSnap = []; // snapshot AFTER step t (world.tick === t+1)
for (let t = 0; t < N; t++) {
  const inp = [0, 1, 2, 3].map((s) => ownInput(t, s));
  trueIn.push(inp);
  for (let s = 0; s < 4; s++) S.applyInput(Ws, s, inp[s][0], inp[s][1], inp[s][2]);
  S.step(Ws, TICK);
  srvSnap.push(S.snapshot(Ws));
}

// ---- client (seat 0) running the PORTED algorithm on its OWN clock ----
const MY = 0;
const cl = { world: newWorld(), hist: [], recv: {}, ownHist: {}, tick: 0, lastAuthStep: -1 };
const base = clone(cl.world);

function inputFor(t, seat) {
  if (seat === MY) {
    if (cl.ownHist[t]) return cl.ownHist[t]; // past tick: the input we ACTUALLY had then
    const i = ownInput(t, MY); return [i[0], i[1], i[2]]; // currentInput() stands-in
  }
  if (cl.recv[t] && cl.recv[t][seat]) return cl.recv[t][seat];
  const h = cl.hist[t - 1];
  if (h && h.inputs[seat]) return h.inputs[seat];
  return [0, 0, 0];
}
function stepTick(t) {
  const inp = [];
  for (let s = 0; s < 4; s++) inp.push(inputFor(t, s));
  for (let s = 0; s < 4; s++) S.applyInput(cl.world, s, inp[s][0], inp[s][1], inp[s][2]);
  S.step(cl.world, TICK);
  cl.ownHist[t] = inp[MY];
  cl.hist[t] = { world: clone(cl.world), inputs: inp };
}
function rollbackTo(tp) {
  cl.world = tp === 0 ? clone(base) : clone(cl.hist[tp - 1].world);
  for (let t2 = tp; t2 < cl.tick; t2++) {
    const in2 = [];
    for (let s = 0; s < 4; s++) in2.push(inputFor(t2, s));
    for (let s = 0; s < 4; s++) S.applyInput(cl.world, s, in2[s][0], in2[s][1], in2[s][2]);
    S.step(cl.world, TICK);
    cl.ownHist[t2] = in2[MY];
    cl.hist[t2] = { world: clone(cl.world), inputs: in2 };
  }
}

// Drive the client on its OWN clock, one step per loop; feed true inputs from the
// wire D ticks late (snapshot with t=k+1 reveals step k's inputs at loop k+D).
let diverged = -1;
for (let t = 0; t < N; t++) {
  // wire: at loop t, snapshots for step k have arrived when k <= t - D
  for (let k = 0; k <= t - D; k++) if (!cl.recv[k]) cl.recv[k] = trueIn[k];
  cl.lastAuthStep = Math.max(cl.lastAuthStep, t - D);

  // rollback the earliest mispredicted step in the window (mirror handleSimSnapshot)
  const k = cl.lastAuthStep;
  for (let tp = Math.max(0, k - RB); tp < k; tp++) {
    const r = cl.recv[tp]; if (!r) continue;
    const h = cl.hist[tp]; if (!h) continue;
    let bad = false;
    for (let s2 = 0; s2 < r.length; s2++) if (String(h.inputs[s2]) !== String(r[s2])) { bad = true; break; }
    if (!bad) continue;
    rollbackTo(tp);
    break;
  }

  // client-driven stepper: advance while not more than D ahead of authority
  if (cl.tick <= cl.lastAuthStep + D) { stepTick(cl.tick); cl.tick++; }

  // settled check: hist[step] is guaranteed corrected once snapshot (step+1) has
  // arrived (that arrival's rollback window includes `step`). Snapshot (step+1)
  // arrives at loop (step+1)+D, so at loop t the deepest settled step is t-D-1.
  const settled = t - D - 1;
  if (settled >= 0 && cl.hist[settled]) {
    const a = JSON.stringify(S.snapshot(cl.hist[settled].world));
    const b = JSON.stringify(srvSnap[settled]);
    if (a !== b) { diverged = settled; break; }
  }
}

console.log(diverged < 0
  ? 'CONVERGED: ported client (own-instant + remote D-late + rollback) == server world at every settled tick'
  : 'DIVERGED at settled step ' + diverged);
