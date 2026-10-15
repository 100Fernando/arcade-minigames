// si-sim.js — Space Invaders simulation for the ONLINE multiplayer rooms.
//
// Single source of truth for a co-op match. The VPS Node process owns it:
// server.js steps it every 50 ms (20 Hz) and hands every client a snapshot.
// The browser NEVER runs this file — it only renders snapshots — so the
// single-player engine inside script.js stays byte-identical (zero regression).
//
// Loaded by server.js: require('./si-sim.js') -> { create, addPlayer, applyInput,
// step, snapshot, restore, restart } plus the WORLDS table. The browser ALSO
// loads it (<script src="si-sim.js"> -> window.SiSim) so mp-client.js can run
// the SAME deterministic sim locally with rollback netcode; the single-player
// engine inside script.js stays byte-identical (zero regression).

'use strict';

const W = 500, H = 600, BASE_SPEED = 250, Y_MIN = H * 0.45;

const MODES = {
  facil:   { name: 'Fácil',   lives: 5, fire: 1.35, bullet: 0.85, hp: 0.8, drop: 0.23 },
  normal:  { name: 'Normal',  lives: 3, fire: 1,    bullet: 1,    hp: 1,   drop: 0.15 },
  dificil: { name: 'Difícil', lives: 2, fire: 0.72, bullet: 1.25, hp: 1.3, drop: 0.11 },
};

// ---------------------------------------------------------------- the tour
// One entry per world. A world is a fleet (formation `form`, rows `rows`, cols
// `cols`, one enemy type per row in `t`) plus that world's OWN commander.
// `hp` is the number of hits for ONE ship; the co-op factor below scales it with
// the number of seats, so a 4-player match fights a 4x tougher boss.
// Enemy letters: b basic, z zigzag, s sniper, a armored, m bomber, g grunt.
// Hazards: 0 none, 1 drift, 2 storm, 3 comets, 4 gravity, 5 splitter, 6 magnet.
const FORM_MAP = { b: 'basic', z: 'zigzag', s: 'sniper', a: 'armored', m: 'bomber', g: 'grunt' };
const ENEMY = {
  basic: { hp: 1, pts: 100 }, zigzag: { hp: 1, pts: 120 }, sniper: { hp: 1, pts: 150 },
  armored: { hp: 3, pts: 250 }, bomber: { hp: 2, pts: 200 }, grunt: { hp: 4, pts: 300 },
  drone: { hp: 1, pts: 60 },
};

const WORLDS = [
  { name: 'Kolonia Nova', card: 'Sinal desconhecido', story: 'As colônias ficar em silence. You are the last ship sent to investigate.', form: 'grid', rows: 3, cols: 7, t: 'bbb', haz: 0, boss: { name: 'Sentinela Ômega', w: 110, h: 50, vx: 95, body: '#3f6fd0', trim: '#7fd4ff', kind: 0, hp: 60 } },
  { name: 'Belt Aster', card: 'O cerco', story: 'Asteroid traffic. The escort learned your approach vector.', form: 'wedge', rows: 3, cols: 7, t: 'bzb', haz: 0, boss: { name: 'Corvadera Vex', w: 120, h: 46, vx: 110, body: '#a8462f', trim: '#ff9a5a', kind: 1, hp: 74 } },
  { name: 'Crater Mars', card: 'O enxame', story: 'Rust winds carry a drone swarm. They drift on the spot.', form: 'grid', rows: 4, cols: 7, t: 'zbbz', haz: 1, boss: { name: 'Matriarca do Enxame', w: 150, h: 44, vx: 78, body: '#8b3fa8', trim: '#f093fb', kind: 2, hp: 88 } },
  { name: 'Orbital Venus', card: 'Lanterns', story: 'Columned sentries sweep the cloud deck. Snipers sit on top.', form: 'columns', rows: 5, cols: 7, t: 'zszbs', haz: 0, boss: { name: 'Drona Bastion', w: 130, h: 58, vx: 92, body: '#2f8f6f', trim: '#7ff0c0', kind: 4, hp: 100 } },
  { name: 'Ring Saturn', card: 'Storm front', story: 'The rings throw lightning. Aim for the gaps.', form: 'ring', rows: 4, cols: 8, t: 'sbbz', haz: 2, boss: { name: 'Kraken da Orbita', w: 160, h: 52, vx: 85, body: '#5f3f9f', trim: '#c9a2ff', kind: 2, hp: 112 } },
  { name: 'Ice Europa', card: 'Glacier', story: 'Frozen lattice. The floor is closing in.', form: 'stagger', rows: 5, cols: 7, t: 'zazbz', haz: 0, boss: { name: 'Glacial Warden', w: 140, h: 62, vx: 70, body: '#3f9fd0', trim: '#bff0ff', kind: 5, hp: 124 } },
  { name: 'Storm Jupiter', card: 'Tempest', story: 'A wall of rain. Nothing here is quiet.', form: 'grid', rows: 4, cols: 7, t: 'szzs', haz: 2, boss: { name: 'Tempest Node', w: 120, h: 66, vx: 105, body: '#c9a227', trim: '#ffcc00', kind: 7, hp: 136 } },
  { name: 'Canyon Io', card: 'Split', story: 'Every wreck you kill spawns two more. Clear the canyon fast.', form: 'twin', rows: 4, cols: 7, t: 'zaaz', haz: 5, boss: { name: 'Splitter Prime', w: 150, h: 56, vx: 96, body: '#d05f3f', trim: '#ffb0a0', kind: 6, hp: 148 } },
  { name: 'Nebula Zeta', card: 'Spiral', story: 'Dense fog. The commander spins its barrels.', form: 'arrow', rows: 5, cols: 7, t: 'bzszb', haz: 1, boss: { name: 'Spiral Oracle', w: 136, h: 60, vx: 88, body: '#7f3fbf', trim: '#e0b0ff', kind: 3, hp: 160 } },
  { name: 'Wraith Belt', card: 'Wraiths', story: 'Comets fall from the belt. Keep moving.', form: 'cross', rows: 6, cols: 7, t: 'bbbbbb', haz: 3, boss: { name: 'Wraith Sovereign', w: 144, h: 64, vx: 100, body: '#2f5f7f', trim: '#9fd8ff', kind: 4, hp: 172 } },
  { name: 'Forge Vulcan', card: 'Forge', story: 'Heavy plates under gravity. Armored rows lead.', form: 'wall', rows: 5, cols: 7, t: 'aggga', haz: 4, boss: { name: 'Forge Colossus', w: 170, h: 70, vx: 66, body: '#8f5f2f', trim: '#ffd8a0', kind: 0, hp: 184 } },
  { name: 'Void Xeno', card: 'Void', story: 'No stars. Bombers open in three lanes.', form: 'cluster', rows: 5, cols: 7, t: 'smzma', haz: 2, boss: { name: 'Void Harvester', w: 150, h: 68, vx: 112, body: '#4f2f5f', trim: '#d090ff', kind: 5, hp: 196 } },
  { name: 'Comet Trail', card: 'Comets', story: 'A rain of ice. The lance answers every shot.', form: 'snake', rows: 5, cols: 7, t: 'bzszb', haz: 3, boss: { name: 'Comet Lancer', w: 132, h: 62, vx: 118, body: '#2f7f9f', trim: '#a0f0ff', kind: 1, hp: 208 } },
  { name: 'Abyss Theta', card: 'Magnetism', story: 'Your own shots bend. Lead the target.', form: 'hourglass', rows: 5, cols: 7, t: 'gagag', haz: 6, boss: { name: 'Abyss Warden', w: 156, h: 66, vx: 84, body: '#1f3f6f', trim: '#6fa0ff', kind: 7, hp: 220 } },
  { name: 'Gate Omega', card: 'The gate', story: 'A lattice of snipers. They already know where you will be.', form: 'lattice', rows: 6, cols: 7, t: 'sasasa', haz: 2, boss: { name: 'Omega Gatekeeper', w: 164, h: 72, vx: 104, body: '#9f2f5f', trim: '#ff9fd0', kind: 6, hp: 240 } },
  { name: 'Core Prime', card: 'The core', story: 'The mother-fleet core. Everything you learned, it learned too.', form: 'fortress', rows: 6, cols: 7, t: 'gagags', haz: 4, boss: { name: 'Prime Core', w: 180, h: 76, vx: 90, body: '#c9a227', trim: '#fff0a0', kind: 3, hp: 260 } },
];

// One color per seat — four ships on one screen must be tellable apart.
const COLORS = ['#00ff88', '#4facfe', '#ffcc00', '#f093fb'];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// Determinism + rollback-safe PRNG. The random state lives INSIDE the world
// (`w.rngState`), not in a closure, so cloning a world (rollback) restores the
// exact RNG state and re-simulating a tick reproduces the SAME draws the
// authoritative server made at that tick. `CURW` is the world whose state
// rnd() advances; step() sets it synchronously at its top (each step is fully
// synchronous, so stepping many worlds in one server loop stays correct). With
// NO seed (rngState undefined) rnd() falls back to Math.random, so the live
// server path is byte-for-byte unchanged.
let CURW = null;
const rnd = (a, b) => {
  if (CURW && CURW.rngState != null) {
    let s = (CURW.rngState + 0x6D2B79F5) >>> 0;
    let t = s;
    t = (t ^ (t >>> 15)) * 0x85EBCA6B >>> 0;
    t = (t ^ (t >>> 13)) * 0xC2B2AE35 >>> 0;
    CURW.rngState = s;
    return a + (((t ^ (t >>> 16)) >>> 0) / 4294967296) * (b - a);
  }
  return a + Math.random() * (b - a);
};

// ---------------------------------------------------------------- world
function create(mode, seed) {
  const w = {
    tick: 0,
    level: 1,
    status: 'waiting',            // waiting -> live -> over
    mode: MODES[mode] ? mode : 'normal',
    players: [],
    enemies: [], boss: null, bullets: [], enemyBullets: [], powerUps: [], particles: [],
    enemyTimer: 0, enemyDir: 1, fireTimer: 0, bossTimer: 0,
    warning: 0, warningX: 0, flash: 0, laser: 0, laserX: 0,
    hazTimer: 0, storm: 0, stormX: 0, stage: 'fleet',
    story: null, storyTimer: 0,
    createdAt: seed != null ? 0 : Date.now(), lastActivity: seed != null ? 0 : Date.now(),
  };
  if (seed != null) { w.rngState = (seed >>> 0) || 1; w.seed0 = seed; } // deterministic client-side sim (state lives in the world)
  // A fresh world must already have a fleet: server.js does create -> addPlayer
  // -> status='live' and never calls initLevel, so without this the first world
  // has zero enemies and nextLevel() advances it on the very first tick.
  initLevel(w);
  return w;
}

function addPlayer(w, name) {
  if (w.players.length >= 4) return -1;
  const seat = w.players.length;
  const m = MODES[w.mode];
  w.players.push({
    seat, name,
    x: clamp(60 + seat * 110, 0, W - 40), y: H - 42, w: 40, h: 20,
    lives: m.lives, score: 0,
    alive: true, respawn: 0, invuln: 0, shot: 0,
    speed: 1,
    timers: { multishot: 0, shield: 0, rapidfire: 0 },
    mx: 0, my: 0, fire: false,
    lastInput: w.rngState != null ? w.tick : Date.now(), offline: false,
    color: COLORS[seat],
  });
  return seat;
}

function applyInput(w, seat, mx, my, fire) {
  const p = w.players[seat];
  if (!p) return false;
  p.mx = clamp(Number(mx) || 0, -1, 1);
  p.my = clamp(Number(my) || 0, -1, 1);
  p.fire = !!fire;
  p.lastInput = w.rngState != null ? w.tick : Date.now(); // tick clock when deterministic
  p.offline = false;              // any input means the seat is back
  return true;
}

// ---------------------------------------------------------------- level setup
// A WORLD = a fleet phase and then that world's commander. `w.stage` says which
// half of the world is running, so the client renderer needs no extra state.
const FORMS = {
  grid: (r, c, rows, cols) => true,
  wedge: (r, c, rows, cols) => Math.abs(c - (cols - 1) / 2) <= (r + 1) * (cols / (rows * 2)) + 0.5,
  stagger: (r, c) => !(r % 2 === 1 && c % 2 === 0),
  columns: (r, c, rows, cols) => c % 2 === 0 || r < 2,
  ring: (r, c, rows, cols) => r === 0 || r === rows - 1 || c <= 1 || c >= cols - 2,
  twin: (r, c, rows, cols) => c < 3 || c >= cols - 3,
  arrow: (r, c, rows, cols) => Math.abs(c - (cols - 1) / 2) <= r + 0.5,
  cross: (r, c, rows, cols) => r === ((rows - 1) >> 1) || c === ((cols - 1) >> 1) || (r + c) % 3 === 0,
  wall: (r, c) => true,
  cluster: (r, c) => (r + c) % 2 === 0 || r === 0,
  snake: (r, c) => (c + (r >> 1)) % 2 === 0 || r === 0,
  hourglass: (r, c, rows, cols) => Math.abs(c - (cols - 1) / 2) <= (cols - 1) / 2 - Math.abs(r - (rows - 1) / 2),
  lattice: (r, c, rows, cols) => (r + c) % 2 === 0 || r === 0 || r === rows - 1,
  fortress: (r, c, rows, cols) => r === 1 || r === rows - 2 || c % 3 === 0,
};

function worldDef(w) { return WORLDS[Math.min(w.level - 1, WORLDS.length - 1)]; }

function spawnFleet(w) {
  const wd = worldDef(w);
  const rows = wd.rows, cols = wd.cols;
  const keep = FORMS[wd.form];
  const tough = Math.floor((w.level - 1) / 4); // deeper worlds wear more plating
  const stepX = Math.min(58, (W - 60) / (cols - 1));
  const x0 = (W - stepX * (cols - 1) - 34) / 2;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!keep(row, col, rows, cols)) continue;
      const type = FORM_MAP[wd.t[Math.min(row, wd.t.length - 1)]] || 'basic';
      const st = ENEMY[type];
      w.enemies.push({
        x: x0 + col * stepX, y: 52 + row * 42, baseX: x0 + col * stepX,
        w: 34, h: 25, type, hp: st.hp + (type === 'basic' || type === 'zigzag' ? tough : tough * 2),
        t: rnd(0, 6), pts: st.pts,
      });
    }
  }
}

function spawnBoss(w) {
  const d = worldDef(w).boss;
  const seats = Math.max(1, w.players.length);
  // Co-op scaling: a 4-seat match fights a ~2.6x tougher commander than a solo
  // run, so the difficulty the user asked for actually lands in multiplayer.
  const coops = 1 + (seats - 1) * 0.55;
  const hp = Math.round(d.hp * MODES[w.mode].hp * coops);
  w.boss = {
    name: d.name, x: W / 2 - d.w / 2, y: 48, baseY: 48, w: d.w, h: d.h,
    hp, maxHp: hp, vx: d.vx * (1 + (w.level - 1) * 0.03), phase: 0, t: 0, kind: d.kind,
    escort: 0,
  };
  w.bossTimer = 0;
}

function initLevel(w) {
  // spawnFleet() draws from rnd(), so rnd() must advance THIS world's rngState —
  // otherwise create()/restart() would read Math.random() (or worse, a stale
  // world's state) and the seeded sim would stop being deterministic.
  CURW = w;
  w.enemies = []; w.boss = null; w.bullets = []; w.enemyBullets = []; w.powerUps = [];
  w.enemyTimer = 0; w.enemyDir = 1; w.fireTimer = 0; w.bossTimer = 0;
  w.warning = 0; w.laser = 0; w.flash = 0; w.hazTimer = 0; w.storm = 0; w.stormX = 0;
  w.stage = 'fleet';
  spawnFleet(w);
}

// ---------------------------------------------------------------- events
function burst(w, x, y, color) {
  for (let i = 0; i < 12; i++) w.particles.push({ x, y, vx: rnd(-130, 130), vy: rnd(-130, 130), life: 0.5, color });
  if (w.particles.length > 60) w.particles.splice(0, w.particles.length - 60);
}

function bullet(w, hostile, x, y, vx, vy, ww, hh) {
  (hostile ? w.enemyBullets : w.bullets).push({ x, y, vx, vy, w: ww, h: hh, active: true });
}

function hit(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

function power(w, p, type) {
  if (type === 'speed') p.speed = Math.min(1.8, Math.round((p.speed + 0.15) * 100) / 100);
  if (type === 'multishot') p.timers.multishot = 10000;
  if (type === 'shield') p.timers.shield = 5000;
  if (type === 'rapidfire') p.timers.rapidfire = 6000;
  if (type === 'bomb') {
    if (w.boss) w.boss.hp = Math.max(0, w.boss.hp - 4);
    else {
      const n = Math.floor(w.enemies.length * 0.3);
      for (let i = 0; i < n; i++) {
        const idx = Math.floor(rnd(0, w.enemies.length));
        const e = w.enemies.splice(idx, 1)[0];
        if (e) { burst(w, e.x, e.y, '#ffff00'); p.score += 100; }
      }
    }
    w.flash = 130;
  }
}

function drop(w, e) {
  if (rnd(0, 1) >= MODES[w.mode].drop || w.powerUps.length >= 3) return;
  const types = ['speed', 'multishot', 'bomb', 'shield', 'rapidfire'];
  w.powerUps.push({ x: e.x + e.w / 2 - 10, y: e.y, w: 20, h: 20, type: types[Math.floor(rnd(0, 5))], age: 0 });
}

function shoot(w, p) {
  if (p.shot > 0 || !p.alive) return;
  const center = p.x + p.w / 2;
  for (const off of (p.timers.multishot > 0 ? [-12, 0, 12] : [0])) bullet(w, false, center + off - 2, p.y - 10, 0, -470, 4, 11);
  p.shot = p.timers.rapidfire > 0 ? 90 : 170;
}

// A world is two beats: clear its fleet, then kill its commander. `w.stage`
// carries which beat is live, so advancing a world means going back to 'fleet'.
function nextLevel(w) {
  if (w.stage === 'fleet') { w.stage = 'boss'; spawnBoss(w); w.storyTimer = 0; return; }
  if (w.level >= WORLDS.length) {
    w.status = 'over';
    w.story = { title: 'Victória: tour complete', text: 'Every world on the tour is clear. The colonies answer again.' };
    return;
  }
  for (const p of w.players) if (p.alive) p.lives = Math.min(MODES[w.mode].lives, p.lives + 1);
  w.level++;
  const wd = worldDef(w);
  w.story = { title: wd.card, text: wd.story + ' You recovered a life.' };
  w.storyTimer = 2600;
  initLevel(w);
}

function damage(w, p) {
  if (!p.alive || p.invuln > 0 || p.timers.shield > 0) return;
  p.lives--;
  p.invuln = 1200;
  burst(w, p.x + p.w / 2, p.y, '#00ff88');
  if (p.lives <= 0) { p.alive = false; p.respawn = 0; }        // out: waits for the others
  else { p.alive = false; p.respawn = 2500; }                  // back after 2.5 s
}

// ---------------------------------------------------------------- boss AI
// Eight commanders, each with its own signature. `deep` (0..15) is the world
// index, so the same kind is meaner on a later world. Every pattern leaves the
// player a gap: nothing here is un-dodgeable, it is just tighter.
function bossAct(w, b, mode, deep) {
  const tgt = w.players.filter((p) => p.alive && !p.offline);
  const aim = () => {
    if (!tgt.length) return null;
    const p = tgt[Math.floor(rnd(0, tgt.length))];
    return { x: p.x + p.w / 2, y: p.y };
  };
  const spd = (200 + deep * 14) * mode.bullet;
  const rage = 1 + (1 - b.hp / b.maxHp) * 0.8;
  const cx = b.x + b.w / 2, cy = b.y + b.h;

  // Commanders keep a escort of drones alive; the player has to clear them or
  // they crowd the screen. Bounded so the fight can never stall.
  const escorts = w.enemies.filter((e) => e.type === 'drone').length;
  if (escorts < 2 + Math.floor(deep / 5)) {
    w.enemies.push({
      x: clamp(cx + rnd(-b.w, b.w), 6, W - 40), y: b.y + b.h, baseX: 0,
      w: 26, h: 20, type: 'drone', hp: 1 + Math.floor(deep / 6), t: rnd(0, 6), pts: 60,
    });
  }

  switch (b.kind) {
    case 0: { // fan + aimed sniper pair
      const n = 3 + Math.floor(deep / 4);
      for (let i = -Math.floor(n / 2); i <= Math.floor(n / 2); i++)
        bullet(w, true, cx, cy, i * (58 + deep), spd);
      const a = aim();
      if (a) { const dx = a.x - cx, dy = a.y - b.y, len = Math.hypot(dx, dy) || 1; bullet(w, true, cx, b.y + b.h, dx / len * spd * 1.3, dy / len * spd * 1.3); }
      break; }
    case 1: { // twin rain + horizontal sweep
      for (const sx of [b.x + 14, b.x + b.w - 14]) for (let i = -1; i <= 1; i++)
        bullet(w, true, sx + i * 12, cy, i * 26, spd * 1.05);
      if (b.phase % 2 === 0) for (let i = 0; i < 4 + Math.floor(deep / 4); i++)
        bullet(w, true, b.x + b.w / 2, cy, (i % 2 ? 1 : -1) * (120 + i * 12), spd * 0.7);
      break; }
    case 2: { // telegraphed laser wall + 8-way burst
      if (b.phase % 2 === 0) { w.warningX = clamp((aim() || { x: W / 2 }).x, 25, W - 25); w.warning = 700; }
      else for (let a = 0; a < 10; a++) { const ang = a * Math.PI / 5 + b.t; bullet(w, true, cx, b.y + b.h / 2, Math.cos(ang) * (150 + deep * 6), Math.sin(ang) * (130 + deep * 5)); }
      break; }
    case 3: { // rotating spiral barrels
      const arms = 3 + Math.floor(deep / 5);
      for (let k = 0; k < arms; k++) { const ang = b.t * 2 + k * (Math.PI * 2 / arms); bullet(w, true, cx, b.y + b.h / 2, Math.cos(ang) * (170 + deep * 5), Math.abs(Math.sin(ang)) * spd + 60); }
      if (b.phase % 3 === 0) { w.warningX = clamp(rnd(40, W - 40), 25, W - 25); w.warning = 620; }
      break; }
    case 4: { // bastion: three gates, only one opens
      if (b.phase % 3 === 0) { w.warningX = clamp((aim() || { x: W / 2 }).x, 25, W - 25); w.warning = 780; }
      else { const gap = Math.floor(rnd(0, 3)); for (let i = 0; i < 3; i++) if (i !== gap) bullet(w, true, b.x + 20 + i * (b.w - 40) / 2, cy, (i - 1) * 40, spd * 1.1); }
      break; }
    case 5: { // harvester: magnet rain + side vents
      for (let i = 0; i < 3 + Math.floor(deep / 5); i++) bullet(w, true, clamp(cx + (i - 1) * 46, 10, W - 10), cy, rnd(-30, 30), spd);
      if (b.phase % 2 === 0) { w.warningX = clamp((aim() || { x: W / 2 }).x, 25, W - 25); w.warning = 700; }
      break; }
    case 6: { // gatekeeper: crossfire + aimed volley
      for (let i = 0; i < 5 + Math.floor(deep / 3); i++) bullet(w, true, b.x + (i + 0.5) * b.w / (5 + Math.floor(deep / 3)), cy, (i % 2 ? 55 : -55), spd * 1.15);
      const a = aim();
      if (a) for (let k = 0; k < 3; k++) { const dx = a.x - cx + (k - 1) * 30, dy = a.y - b.y, len = Math.hypot(dx, dy) || 1; bullet(w, true, cx, b.y + b.h, dx / len * spd * 1.25, dy / len * spd * 1.25); }
      break; }
    default: { // kind 7 — oracle: everything, escalating
      if (b.phase % 4 === 0) { w.warningX = clamp((aim() || { x: W / 2 }).x, 25, W - 25); w.warning = 640; }
      else if (b.phase % 4 === 1) for (let a = 0; a < 12; a++) { const ang = a * Math.PI / 6 + b.t * 1.5; bullet(w, true, cx, b.y + b.h / 2, Math.cos(ang) * (160 + deep * 5), Math.sin(ang) * (140 + deep * 4)); }
      else if (b.phase % 4 === 2) for (let i = -2; i <= 2; i++) bullet(w, true, cx, cy, i * (70 + deep * 2), spd * 1.1);
      else { const a = aim(); if (a) for (let k = 0; k < 4; k++) { const dx = a.x - cx + (k - 1.5) * 26, dy = a.y - b.y, len = Math.hypot(dx, dy) || 1; bullet(w, true, cx, b.y + b.h, dx / len * spd * 1.2, dy / len * spd * 1.2); } }
    }
  }
}

// ---------------------------------------------------------------- step
function step(w, ms) {
  if (w.status !== 'live') return;
  CURW = w; // rnd() advances THIS world's rngState (rollback-safe)
  const dt = ms / 1000;
  const mode = MODES[w.mode];
  const now = w.rngState != null ? w.tick : Date.now(); // tick clock when deterministic

  if (w.storyTimer > 0) w.storyTimer = Math.max(0, w.storyTimer - ms);
  w.flash = Math.max(0, w.flash - ms);
  if (w.laser > 0) w.laser -= ms;

  for (const p of w.players) {
    for (const k of Object.keys(p.timers)) p.timers[k] = Math.max(0, p.timers[k] - ms);
    p.invuln = Math.max(0, p.invuln - ms);
    p.shot = Math.max(0, p.shot - ms);
    // A seat that stopped sending input is offline: its ship freezes, translucent.
    // 8 s of idle. In the deterministic (tick) clock that is 160 ticks at 50 ms.
    if (!p.offline && now - p.lastInput > (w.rngState != null ? 160 : 8000)) p.offline = true;
    if (!p.alive) {
      if (p.respawn > 0) {
        p.respawn -= ms;
        if (p.respawn <= 0) {
          p.alive = true;
          p.x = clamp(60 + p.seat * 110, 0, W - p.w); p.y = H - 42;
          p.invuln = 1500;
        }
      }
      continue;
    }
    if (p.offline) continue;
    p.x = clamp(p.x + p.mx * BASE_SPEED * p.speed * dt, 0, W - p.w);
    p.y = clamp(p.y + p.my * BASE_SPEED * p.speed * dt, Y_MIN, H - p.h);
    if (p.fire) shoot(w, p);
  }

  for (const e of w.enemies) if (e.type === 'zigzag') { e.t += dt * 3; e.x = clamp(e.baseX + Math.sin(e.t) * 19, 0, W - e.w); }

  const wd = worldDef(w);
  const deep = w.level - 1; // 0..15 — the tour's difficulty ramp

  // ---- world hazard -------------------------------------------------------
  // Each world carries one hazard so the fleet phase is not seven identical
  // screens. 0 none, 1 drift, 2 storm, 3 comets, 4 gravity, 5 splitter, 6 magnet.
  if (w.stage === 'fleet' && wd.haz) {
    w.hazTimer += ms;
    if (wd.haz === 2 && w.storm > 0) {           // storm: telegraphed bolt column
      w.storm -= ms;
      if (w.storm <= 0) { w.laser = 300; w.laserX = w.stormX; }
    } else if (wd.haz === 2 && w.hazTimer >= 2600) {
      w.hazTimer = 0; w.storm = 700; w.stormX = rnd(40, W - 40);
    } else if (wd.haz === 3 && w.hazTimer >= 1500) {   // comets: falling ice
      w.hazTimer = 0;
      const cx = rnd(30, W - 30);
      bullet(w, true, cx, 20, rnd(-40, 40), 250 + deep * 8, 8, 14);
    } else if (wd.haz === 4 && w.hazTimer >= 2000) {   // gravity: fleet lurches down
      w.hazTimer = 0;
      for (const e of w.enemies) e.y += 6;
      w.flash = 60;
    }
  }

  w.enemyTimer += ms;
  const moveInterval = Math.max(140, 470 - deep * 20);
  if (w.enemyTimer >= moveInterval && w.enemies.length) {
    w.enemyTimer %= moveInterval;
    const edge = w.enemies.some((e) => e.baseX < 12 || e.baseX + e.w > W - 12);
    if (edge) w.enemyDir *= -1;
    let reached = false;
    for (const e of w.enemies) {
      e.baseX += w.enemyDir * (7 + deep);
      if (edge) e.y += 10 + Math.floor(deep / 3);
      if (wd.haz === 1) e.baseX += Math.sin(e.t) * 0.6;   // drift
      if (e.type !== 'zigzag') e.x = e.baseX;
      for (const p of w.players) if (p.alive && hit(e, p)) damage(w, p);
      if (e.y + e.h >= H) reached = true;
    }
    // Co-op rule: the fleet reaching the bottom does NOT end the match — every
    // alive ship takes a hit and the level is rebuilt.
    if (reached) {
      for (const p of w.players) if (p.alive) damage(w, p);
      initLevel(w);
    }
  }

  if (w.boss) {
    const b = w.boss;
    b.t += dt;
    b.x += b.vx * dt;
    if (b.x <= 8 || b.x + b.w >= W - 8) { b.x = clamp(b.x, 8, W - 8 - b.w); b.vx *= -1; }
    // Commanders of the later worlds dive further into the playfield.
    const sway = [0, 30, 46, 34, 26, 40, 22, 52][b.kind % 8];
    if (sway) b.y = b.baseY + Math.sin(b.t * (0.8 + deep * 0.05)) * sway;
    w.bossTimer += ms;

    // A telegraphed column always resolves, whatever the boss is doing.
    if (w.warning > 0) {
      w.warning -= ms;
      if (w.warning <= 0) {
        if (b.kind === 2 || b.kind === 5) { w.laser = 380; w.laserX = w.warningX; }
        else for (let i = -1; i <= 1; i++) bullet(w, true, w.warningX + i * 11, b.y + b.h, i * 35, (240 + deep * 6) * mode.bullet);
      }
    }

    // Phase-gated cadence: a commander gets faster AND angrier as it loses hull.
    const rage = 1 + (1 - b.hp / b.maxHp) * 0.8;
    const cadence = Math.max(320, (1500 - deep * 55) * mode.fire / rage);
    if (w.bossTimer >= cadence) {
      w.bossTimer = 0; b.phase++;
      bossAct(w, b, mode, deep);
    }
    if (w.laser > 0) for (const p of w.players) if (p.alive && Math.abs((p.x + p.w / 2) - w.laserX) < 24) damage(w, p);
  }
  else if (w.enemies.length) {
    w.fireTimer += ms;
    // Deeper worlds fire far more often — the fleet phase is the pressure valve.
    const cadence = Math.max(190, (760 - deep * 38) * mode.fire);
    if (w.fireTimer >= cadence) {
      w.fireTimer = 0;
      const e = w.enemies[Math.floor(rnd(0, w.enemies.length))];
      if (e) {
        const speed = (215 + deep * 16) * mode.bullet;
        if (e.type === 'sniper') {
          const target = w.players.filter((p) => p.alive && !p.offline);
          if (target.length) {
            const p = target[Math.floor(rnd(0, target.length))];
            const dx = (p.x + p.w / 2) - (e.x + e.w / 2), dy = p.y - e.y;
            const len = Math.hypot(dx, dy) || 1;
            bullet(w, true, e.x + e.w / 2, e.y + e.h, dx / len * speed, dy / len * speed);
          }
        } else if (e.type === 'armored' || e.type === 'grunt')
          for (const vx of [-70, 0, 70]) bullet(w, true, e.x + e.w / 2, e.y + e.h, vx, speed);
        else if (e.type === 'bomber') {
          for (const vx of [-65, 65]) bullet(w, true, e.x + e.w / 2, e.y + e.h, vx, speed);
          bullet(w, true, e.x + e.w / 2, e.y + e.h, 0, speed * 1.2);
        } else if (e.type === 'drone') {
          const target = w.players.filter((p) => p.alive && !p.offline);
          if (target.length) {
            const p = target[Math.floor(rnd(0, target.length))];
            const dx = (p.x + p.w / 2) - (e.x + e.w / 2), dy = p.y - e.y;
            const len = Math.hypot(dx, dy) || 1;
            bullet(w, true, e.x + e.w / 2, e.y + e.h, dx / len * speed, dy / len * speed);
          }
        } else bullet(w, true, e.x + e.w / 2, e.y + e.h, 0, speed);
      }
    }
  }

  for (const b of w.bullets) {
    if (wd.haz === 6) { // magnetism: your own shots bend toward the nearest target
      let best = null, bestD = 1e9;
      for (const e of w.enemies) { const d = Math.hypot(e.x - b.x, e.y - b.y); if (d < bestD) { bestD = d; best = e; } }
      if (w.boss) { const d = Math.hypot(w.boss.x + w.boss.w / 2 - b.x, w.boss.y - b.y); if (d < bestD) best = w.boss; }
      if (best) {
        const dx = (best.x + best.w / 2) - b.x, dy = (best.y + best.h / 2) - b.y, len = Math.hypot(dx, dy) || 1;
        const v = Math.hypot(b.vx, b.vy) || 470;
        b.vx += (dx / len * v - b.vx) * 0.06;
        b.vy += (dy / len * v - b.vy) * 0.06;
      }
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.y < -20) { b.active = false; continue; }
    if (w.boss && hit(b, w.boss)) {
      b.active = false; w.boss.hp--; burst(w, b.x, b.y, '#ff3366');
      const shooter = nearestShooter(w, b.x);
      if (shooter) shooter.score += 20;
    } else for (const e of w.enemies) if (e.hp > 0 && hit(b, e)) {
      b.active = false; e.hp--;
      if (e.hp <= 0) {
        // credit the kill to the shooter, so the four scores stay independent
        const shooter = nearestShooter(w, e.x + e.w / 2);
        if (shooter) shooter.score += e.pts || 100;
        burst(w, e.x + e.w / 2, e.y + e.h / 2, '#ff3366');
        // Splitter hazard: the wreck breaks into two drones.
        if (wd.haz === 5 && w.enemies.length < 46)
          for (const sx of [-16, 16]) w.enemies.push({ x: e.x + sx, y: e.y, baseX: e.x + sx, w: 22, h: 18, type: 'drone', hp: 1, t: rnd(0, 6), pts: 60 });
        drop(w, e);
      }
      break;
    }
  }
  w.bullets = w.bullets.filter((b) => b.active);
  w.enemies = w.enemies.filter((e) => e.hp > 0);

  for (const b of w.enemyBullets) {
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.y > H + 20 || b.x < -20 || b.x > W + 20) { b.active = false; continue; }
    for (const p of w.players) if (p.alive && hit(b, p)) { b.active = false; damage(w, p); break; }
  }
  w.enemyBullets = w.enemyBullets.filter((b) => b.active);

  if (w.status === 'over') return;
  for (const p of w.powerUps) {
    p.age += ms; p.y += 165 * dt;
    if (p.y > H || p.age > 20000) { p.dead = true; continue; }
    for (const pl of w.players) if (pl.alive && hit(p, pl)) { p.dead = true; power(w, pl, p.type); burst(w, p.x, p.y, '#ffff00'); break; }
  }
  w.powerUps = w.powerUps.filter((p) => !p.dead);

  for (const p of w.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
  w.particles = w.particles.filter((p) => p.life > 0);

  if ((w.boss && w.boss.hp <= 0) || (!w.boss && !w.enemies.length)) nextLevel(w);

  // The match ends only when EVERY seat is out of lives at the same instant.
  if (w.players.length && w.players.every((p) => p.lives <= 0)) {
    w.status = 'over';
    w.story = { title: 'Defeat: the fleet reached Earth', text: 'Every ship is gone. The colonies stay dark.' };
  }
  // Fixed-point positions: rounding here (not in the snapshot) keeps server and
  // client worlds bit-identical while making the JSON payload short — raw doubles
  // serialize as "233.00000000000006", which triples the wire size.
  const q = (v) => Math.round(v * 100) / 100;
  for (const p of w.players) { p.x = q(p.x); p.y = q(p.y); }
  for (const e of w.enemies) { e.x = q(e.x); e.y = q(e.y); e.baseX = q(e.baseX); e.t = q(e.t); }
  if (w.boss) { w.boss.x = q(w.boss.x); w.boss.y = q(w.boss.y); w.boss.vx = q(w.boss.vx); w.boss.t = q(w.boss.t); }
  for (const b of w.bullets) { b.x = q(b.x); b.y = q(b.y); b.vx = q(b.vx); b.vy = q(b.vy); }
  for (const b of w.enemyBullets) { b.x = q(b.x); b.y = q(b.y); b.vx = q(b.vx); b.vy = q(b.vy); }
  for (const p of w.powerUps) { p.x = q(p.x); p.y = q(p.y); }
  for (const p of w.particles) { p.x = q(p.x); p.y = q(p.y); p.vx = q(p.vx); p.vy = q(p.vy); p.life = q(p.life); }
  w.tick++;
}

// Whose bullet killed what: the closest alive ship under the kill, same column band.
function nearestShooter(w, x) {
  let best = null, bestD = Infinity;
  for (const p of w.players) {
    if (p.lives <= 0) continue;
    const d = Math.abs((p.x + p.w / 2) - x);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

function restart(w) {
  const names = w.players.map((p) => p.name);
  // Keep the seed: a rollback client restarts the SAME deterministic world, so
  // its history stays valid and the server and client agree from tick 0.
  // create() already builds world 1's fleet, so no extra initLevel here (that
  // would draw the RNG twice and desync the client's rollback history).
  const fresh = create(w.mode, w.seed0);
  for (const n of names) addPlayer(fresh, n);
  fresh.status = 'live';
  return fresh;
}

// ---------------------------------------------------------------- snapshot (wire)
// The snapshot must be a BIT-EXACT dump of the world, not a render hint: the
// rollback client adopts it as its history anchor mid-match, and any lossy field
// silently desyncs every player (each screen showing a different fleet/phase).
// Measured offenders: dividing timers by TICK (230/50*50 = 229.99999999999997
// shifts the whole fleet cadence) and rounding x/y/e.t (a 7 px fleet drift).
// JSON numbers round-trip exactly, so every field here is sent raw and restore()
// is its exact inverse.
function snapshot(w) {
  return {
    t: w.tick,
    st: w.status,
    lv: w.level,
    md: w.mode,
    s2: w.stage === 'boss' ? 1 : 0,
    rs: w.rngState, // the client must resume the SAME RNG stream
    seed: w.seed0,
    ps: w.players.map((p) => [
      p.seat, p.name, p.x, p.y, p.lives, p.score,
      p.alive ? 1 : 0, p.offline ? 1 : 0, p.color,
      (p.timers.multishot ? 'M' : '') + (p.timers.shield ? 'S' : '') + (p.timers.rapidfire ? 'R' : ''),
      p.speed,
      // state the renderer never draws but the sim must resume exactly
      p.invuln, p.respawn, p.shot,
      p.timers.multishot, p.timers.shield, p.timers.rapidfire,
    ]),
    en: w.enemies.map((e) => [e.x, e.y, e.type, e.hp, e.baseX, e.t]),
    b: w.boss ? [w.boss.name, w.boss.x, w.boss.y, w.boss.w, w.boss.h,
      w.boss.hp, w.boss.maxHp, w.boss.kind, w.boss.vx, w.boss.t, w.boss.phase] : null,
    bl: w.bullets.map((b) => [b.x, b.y, b.w, b.h, b.vx, b.vy]),
    eb: w.enemyBullets.map((b) => [b.x, b.y, b.w, b.h, b.vx, b.vy]),
    pu: w.powerUps.map((p) => [p.x, p.y, p.type, p.age]),
    pa: w.particles.map((p) => [p.x, p.y, p.life, p.color, p.vx, p.vy]),
    wx: w.warningX, ws: w.warning, // exact for the sim; the renderer reads ws > 0
    lx: w.laserX, ls: w.laser,
    fl: w.flash,
    hz: w.hazTimer, sw: w.storm, sx: w.stormX,
    et: w.enemyTimer, ft: w.fireTimer, bt: w.bossTimer, ed: w.enemyDir,
    story: w.story, stt: w.storyTimer,
    total: w.players.reduce((s, p) => s + p.score, 0),
    createdAt: w.createdAt, // the lobby shows how old a room is
  };
}

// ---------------------------------------------------------------- restore (wire)
// Exact inverse of snapshot(). A client that joins mid-match MUST adopt the
// authoritative world as-is; rebuilding from the seed and replaying from tick 0
// gives each browser its own private fleet, which is the desync the user saw.
function restore(s) {
  const w = create(s.md || 'normal', s.seed);
  w.tick = s.t; w.level = s.lv; w.status = s.st;
  w.rngState = s.rs; w.seed0 = s.seed;
  w.stage = s.s2 === 1 ? 'boss' : 'fleet';
  w.enemyTimer = s.et; w.enemyDir = s.ed; w.fireTimer = s.ft; w.bossTimer = s.bt;
  w.warning = s.ws; w.warningX = s.wx; w.flash = s.fl;
  w.laser = s.ls; w.laserX = s.lx;
  w.hazTimer = s.hz; w.storm = s.sw; w.stormX = s.sx;
  w.story = s.story; w.storyTimer = s.stt;
  w.players = s.ps.map((p) => ({
    seat: p[0], name: p[1], x: p[2], y: p[3], w: 40, h: 20,
    lives: p[4], score: p[5], alive: !!p[6], respawn: p[12], invuln: p[11],
    shot: p[13], speed: p[10], offline: !!p[7],
    timers: { multishot: p[14], shield: p[15], rapidfire: p[16] },
    mx: 0, my: 0, fire: false,
    lastInput: s.t, color: p[8],
  }));
  w.enemies = s.en.map((e) => ({ x: e[0], y: e[1], baseX: e[4], w: 34, h: 25, type: e[2], hp: e[3], t: e[5], pts: ENEMY[e[2]].pts }));
  w.bullets = s.bl.map((b) => ({ x: b[0], y: b[1], vx: b[4], vy: b[5], w: b[2], h: b[3], active: true }));
  w.enemyBullets = s.eb.map((b) => ({ x: b[0], y: b[1], vx: b[4], vy: b[5], w: b[2], h: b[3], active: true }));
  w.powerUps = s.pu.map((p) => ({ x: p[0], y: p[1], w: 20, h: 20, type: p[2], age: p[3] }));
  w.particles = s.pa.map((p) => ({ x: p[0], y: p[1], vx: p[4], vy: p[5], life: p[2], color: p[3] }));
  if (s.b) {
    w.boss = { name: s.b[0], x: s.b[1], y: s.b[2], baseY: s.b[2], w: s.b[3], h: s.b[4],
               hp: s.b[5], maxHp: s.b[6], vx: s.b[8], t: s.b[9], phase: s.b[10],
               kind: s.b[7], escort: 0 };
  } else w.boss = null;
  CURW = w; // any rnd() before the next step() still belongs to this world
  return w;
}

const SiSim = {
  create, addPlayer, applyInput, step, initLevel, snapshot, restore, restart, spawnFleet, spawnBoss,
  MODES, WORLDS, COLORS, ENEMY, W, H,
};
// CommonJS on the server; on the browser (a <script src="si-sim.js">) expose it
// as window.SiSim so mp-client.js can run the SAME sim locally (rollback netcode).
if (typeof module !== 'undefined' && module.exports) module.exports = SiSim;
else if (typeof window !== 'undefined') window.SiSim = SiSim;
