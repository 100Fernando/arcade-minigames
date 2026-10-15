// probe-roundtrip.js - is snapshot() -> restore() -> snapshot() lossless?
// If any field differs, the late joiner's anchor is wrong and it will drift.
'use' + ' strict';
const fs = require('fs');
const S = (() => {
  const src = fs.readFileSync('si-sim.js', 'utf8');
  const mod = { exports: {} };
  new Function('module', 'require', 'window', src)(mod, require('module').require, undefined);
  return mod.exports;
})();
const TICK = 50;
const w = S.create('normal', 987654321);
for (const n of ['P0', 'P1']) S.addPlayer(w, n);
w.status = 'live';
let bad = 0;
for (let t = 0; t < 400; t++) {
  const inp = [0, 1].map((s) => [((t >> (s + 1)) & 1) ? 1 : -1, (t % 9 === 0) ? 1 : 0, t % (3 + s) !== 0 ? 1 : 0]);
  for (let s = 0; s < 2; s++) S.applyInput(w, s, inp[s][0], inp[s][1], inp[s][2]);
  S.step(w, TICK);
  const s1 = S.snapshot(w);
  const back = S.restore(s1);
  const s2 = S.snapshot(back);
  const a = JSON.stringify(s1), b = JSON.stringify(s2);
  if (a === b) continue;
  for (const k of Object.keys(s1)) {
    if (JSON.stringify(s1[k]) === JSON.stringify(s2[k])) continue;
    console.log('tick ' + t + ' key ' + k + ': ' + JSON.stringify(s1[k]) + '  vs  ' + JSON.stringify(s2[k]));
    break;
  }
  if (++bad > 4) break;
}
console.log('round-trip mismatches: ' + bad + ' (0 = lossless)');
