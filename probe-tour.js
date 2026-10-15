// probe-tour.js — measure the new world/boss curve and soak the sim.
'use' + ' strict';
const S = require('./si-sim.js');

console.log('worlds=' + S.WORLDS.length);
let maxEnemies = 0, maxSnap = 0;
for (let lv = 1; lv <= S.WORLDS.length; lv++) {
  const wd = S.WORLDS[lv - 1];
  const w = S.create('normal', 7);
  w.level = lv; w.stage = 'fleet';
  S.initLevel(w);
  const fleet = w.enemies.length;
  maxEnemies = Math.max(maxEnemies, fleet);
  w.stage = 'boss'; S.spawnBoss(w);
  const solo = w.boss.hp;
  const w4 = S.create('normal', 7);
  for (let i = 0; i < 4; i++) S.addPlayer(w4, 'P' + i);
  w4.level = lv; w4.stage = 'boss'; S.spawnBoss(w4);
  const four = w4.boss.hp;
  const hpsum = w.enemies.reduce((a, e) => a + e.hp, 0);
  console.log(
    String(lv).padStart(2) + ' ' + wd.name.padEnd(15) + ' form=' + wd.form.padEnd(10) +
    ' haz=' + wd.haz + ' fleet=' + String(fleet).padStart(3) + ' hits=' + String(hpsum).padStart(4) +
    ' boss=' + wd.boss.name.padEnd(17) + ' kind=' + wd.boss.kind +
    ' hp 1p=' + String(solo).padStart(4) + ' 4p=' + String(four).padStart(4)
  );
}

// ---- soak: 4 seats, scripted sticks, full tour, no throws ----
const w = S.create('normal', 4242);
for (let i = 0; i < 4; i++) S.addPlayer(w, 'P' + i);
w.status = 'live';
let ticks = 0, throws = 0, levels = new Set(), bossHpSeen = {};
for (let t = 0; t < 90000; t++) {
  for (let s = 0; s < 4; s++) S.applyInput(w, s, ((t >> s) & 1) ? 1 : -1, (t % 7 === 0) ? 1 : 0, t % 3 !== 0);
  try { S.step(w, 50); } catch (e) { throws++; console.log('THROW @' + t + ': ' + e.message); break; }
  ticks++;
  levels.add(w.level);
  if (w.boss) bossHpSeen[w.level] = Math.max(bossHpSeen[w.level] || 0, w.boss.maxHp);
  maxSnap = Math.max(maxSnap, JSON.stringify(S.snapshot(w)).length);
  if (w.status === 'over') break;
}
console.log('soak: ticks=' + ticks + ' throws=' + throws + ' levels reached=' + [...levels].sort() + ' maxEnemies=' + maxEnemies + ' maxSnapBytes=' + maxSnap);
console.log('boss maxHp seen per level: ' + JSON.stringify(bossHpSeen));

// ---- every commander, forced: 12 s of live boss fight each ----
let bossTicks = 0, bossThrows = 0, kinds = new Set();
for (let lv = 1; lv <= S.WORLDS.length; lv++) {
  const bw = S.create('normal', 1000 + lv);
  for (let i = 0; i < 4; i++) S.addPlayer(bw, 'P' + i);
  bw.level = lv; bw.stage = 'boss';
  S.spawnBoss(bw);
  kinds.add(bw.boss.kind);
  bw.status = 'live';
  for (let t = 0; t < 240; t++) {           // 12 s at 20 Hz
    for (let s = 0; s < 4; s++) S.applyInput(bw, s, Math.sin(t * 0.3 + s), Math.cos(t * 0.2 + s), true);
    bw.players.forEach((p) => { p.lives = 9; });   // godmode: we want patterns, not a wipe
    try { S.step(bw, 50); } catch (e) { bossThrows++; console.log('BOSS THROW lv' + lv + ' @' + t + ': ' + e.message); break; }
    bossTicks++;
    maxSnap = Math.max(maxSnap, JSON.stringify(S.snapshot(bw)).length);
  }
}
console.log('boss soak: ticks=' + bossTicks + ' throws=' + bossThrows + ' distinct kinds=' + [...kinds].sort() + ' maxSnapBytes=' + maxSnap);

