// probe-determinism.js — prove si-sim.js is deterministic when seeded: two
// independent worlds built from the SAME seed + fed the SAME input stream must
// produce byte-identical snapshots at every tick. That is the foundation for
// client-side rollback netcode (each browser replays the same match).
'use strict';
const S = require('./si-sim.js');

function build(seed) {
  const w = S.create('normal', seed);
  S.addPlayer(w, 'P1'); S.addPlayer(w, 'P2'); S.addPlayer(w, 'P3'); S.addPlayer(w, 'P4');
  w.status = 'live';
  return w;
}
// deterministic input stream (no Math.random here)
function inputFor(tick, seat) {
  const dir = ((tick >> (seat + 1)) & 1) ? 1 : -1;
  return [dir, 0, (tick % 7 === 0) ? 1 : 0];
}

const a = build(12345), b = build(12345);
let firstDiff = null;
for (let t = 0; t < 600; t++) {
  for (let s = 0; s < 4; s++) { S.applyInput(a, s, ...inputFor(t, s)); S.applyInput(b, s, ...inputFor(t, s)); }
  S.step(a, 50); S.step(b, 50);
  const sa = JSON.stringify(S.snapshot(a)), sb = JSON.stringify(S.snapshot(b));
  if (sa !== sb) { firstDiff = t; break; }
}
console.log(firstDiff === null
  ? 'DETERMINISTIC: 600 ticks, byte-identical snapshots (seed 12345)'
  : 'DIVERGED at tick ' + firstDiff);

// ROLLBACK property: clone world `a` mid-stream at tick 300 and re-simulate
// 300..600 with the SAME input stream must reproduce `b` byte-for-byte. This is
// what rollback netcode relies on: restoring a cloned world + re-stepping must
// give the authoritative result (RNG state must live inside the world).
const clone = (w) => JSON.parse(JSON.stringify(w));
const a2 = build(12345);
for (let t = 0; t < 300; t++) { for (let s = 0; s < 4; s++) S.applyInput(a2, s, ...inputFor(t, s)); S.step(a2, 50); }
const restored = clone(a2); // rollback point
for (let t = 300; t < 600; t++) { for (let s = 0; s < 4; s++) S.applyInput(restored, s, ...inputFor(t, s)); S.step(restored, 50); }
const rb = JSON.stringify(S.snapshot(restored));
const b2 = build(12345);
for (let t = 0; t < 600; t++) { for (let s = 0; s < 4; s++) S.applyInput(b2, s, ...inputFor(t, s)); S.step(b2, 50); }
const bSnap = JSON.stringify(S.snapshot(b2));
console.log(rb === bSnap
  ? 'ROLLBACK OK: cloned world at tick 300 re-simulated to 600 == authoritative (RNG state is rollback-safe)'
  : 'ROLLBACK BROKEN: re-sim diverged (RNG state not carried by clone)');

const c = S.create('normal'), d = S.create('normal');
S.addPlayer(c, 'P1'); S.addPlayer(d, 'P1');
c.status = 'live'; d.status = 'live';
for (let t = 0; t < 40; t++) { S.applyInput(c, 0, 1, 0, 1); S.applyInput(d, 0, 1, 0, 1); S.step(c, 50); S.step(d, 50); }
const sc = JSON.stringify(S.snapshot(c)), sd = JSON.stringify(S.snapshot(d));
console.log('unseeded server path differs (real randomness kept):', sc !== sd);
