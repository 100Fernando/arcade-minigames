// si-sim.js — Space Invaders simulation for the ONLINE multiplayer rooms.
//
// Single source of truth for a co-op match. The VPS Node process owns it:
// server.js steps it every 50 ms (20 Hz) and hands every client a snapshot.
// The browser NEVER runs this file — it only renders snapshots — so the
// single-player engine inside script.js stays byte-identical (zero regression).
//
// Loaded by server.js: require('./si-sim.js') -> { create, addPlayer, applyInput, step, snapshot, restart }

'use strict';

const W = 500, H = 600, BASE_SPEED = 250, Y_MIN = H * 0.45;

const MODES = {
  facil:   { name: 'Fácil',   lives: 5, fire: 1.35, bullet: 0.85, hp: 0.8, drop: 0.23 },
  normal:  { name: 'Normal',  lives: 3, fire: 1,    bullet: 1,    hp: 1,   drop: 0.15 },
  dificil: { name: 'Difícil', lives: 2, fire: 0.72, bullet: 1.25, hp: 1.3, drop: 0.11 },
};

const BOSS_DEFS = [
  { name: 'Sentinela Ômega',     w: 110, h: 50, vx: 90, body: '#3f6fd0', trim: '#7fd4ff', kind: 0 },
  { name: 'Matriarca do Enxame', w: 160, h: 44, vx: 70, body: '#8b3fa8', trim: '#f093fb', kind: 1 },
  { name: 'Núcleo da Frota',     w: 140, h: 72, vx: 55, body: '#c9a227', trim: '#ffcc00', kind: 2 },
];

const CHAPTERS = [
  ['Sinal desconhecido', 'As colônias ficar em silence. You are the last ship sent to investigate.'],
  ['O cerco', 'The first fleet fell, but its records point to a larger intelligence.'],
  ['O enxame', 'The enemy ships learn your movements. The signal comes from the heart of the fleet.'],
  ['A origem', 'The mother-fleet controls the invasion. Destroy the core and free the colonies.'],
];

// One color per seat — four ships on one screen must be tellable apart.
const COLORS = ['#00ff88', '#4facfe', '#ffcc00', '#f093fb'];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// Determinism: when a world carries a `seed`, every random draw and every
// "clock" read must be reproducible so two clients can replay the SAME match
// (rollback netcode). A seeded PRNG (mulberry32) is read through a module-global
// `RNG` that create()/step() set synchronously at their top - safe because each
// call is fully synchronous (no await inside step), even though the server steps
// many worlds in one loop. With NO seed, RNG stays Math.random and Date.now()
// drives the clock, so the existing server path is byte-for-byte unchanged.
let RNG = Math.random;
function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = (t ^ (t >>> 15)) * 0x85EBCA6B >>> 0; t = (t ^ (t >>> 13)) * 0xC2B2AE35 >>> 0; return ((t ^ (t >>> 16)) >>> 0) / 4294967296; };
}
const rnd = (a, b) => a + RNG() * (b - a);

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
    story: null, storyTimer: 0,
    createdAt: seed != null ? 0 : Date.now(), lastActivity: seed != null ? 0 : Date.now(),
  };
  if (seed != null) { w.seed = seed; w.rng = makeRng(seed); RNG = w.rng; } // deterministic client-side sim
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
    lastInput: Date.now(), offline: false,
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
  p.lastInput = w.seed != null ? w.tick : Date.now(); // tick clock when deterministic
  p.offline = false;              // any input means the seat is back
  return true;
}

// ---------------------------------------------------------------- level setup
function initLevel(w) {
  w.enemies = []; w.boss = null; w.bullets = []; w.enemyBullets = []; w.powerUps = [];
  w.enemyTimer = 0; w.enemyDir = 1; w.fireTimer = 0; w.bossTimer = 0;
  w.warning = 0; w.laser = 0; w.flash = 0;
  if (w.level % 5 === 0) {
    const tier = Math.floor(w.level / 5) - 1;
    const d = BOSS_DEFS[Math.min(tier, BOSS_DEFS.length - 1)];
    const hp = Math.round((20 + tier * 14) * MODES[w.mode].hp);
    w.boss = { name: d.name, x: W / 2 - d.w / 2, y: 48, baseY: 48, w: d.w, h: d.h,
      hp, maxHp: hp, vx: d.vx, phase: 0, t: 0, kind: d.kind };
  } else {
    const rows = Math.min(3 + Math.floor((w.level - 1) / 2), 6), cols = 7;
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const type = w.level >= 3 && row === 0 ? 'sniper'
        : w.level >= 2 && row === 1 ? 'zigzag'
        : w.level >= 4 && row === rows - 1 ? 'armored' : 'basic';
      w.enemies.push({
        x: 50 + col * 58, y: 55 + row * 43, baseX: 50 + col * 58,
        w: 34, h: 25, type, hp: type === 'armored' ? 2 : 1, t: rnd(0, 6),
      });
    }
  }
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
  if (RNG() >= MODES[w.mode].drop || w.powerUps.length >= 3) return;
  const types = ['speed', 'multishot', 'bomb', 'shield', 'rapidfire'];
  w.powerUps.push({ x: e.x + e.w / 2 - 10, y: e.y, w: 20, h: 20, type: types[Math.floor(rnd(0, 5))], age: 0 });
}

function shoot(w, p) {
  if (p.shot > 0 || !p.alive) return;
  const center = p.x + p.w / 2;
  for (const off of (p.timers.multishot > 0 ? [-12, 0, 12] : [0])) bullet(w, false, center + off - 2, p.y - 10, 0, -470, 4, 11);
  p.shot = p.timers.rapidfire > 0 ? 90 : 170;
}

function nextLevel(w) {
  const wasBoss = w.level % 5 === 0;
  if (w.level === 15 && wasBoss) {
    w.status = 'over';
    w.story = { title: 'Victória: sinal restaurado', text: 'The core was destroyed. The colonies answer again.' };
    return;
  }
  w.level++;
  if (wasBoss) {
    for (const p of w.players) if (p.alive) p.lives = Math.min(MODES[w.mode].lives, p.lives + 1);
    const ch = CHAPTERS[Math.min(Math.floor((w.level - 1) / 5), CHAPTERS.length - 1)];
    w.story = { title: ch[0], text: ch[1] + ' You recovered a life.' };
  } else if (w.level % 5 === 0) {
    const d = BOSS_DEFS[Math.min(Math.floor(w.level / 5) - 1, BOSS_DEFS.length - 1)];
    w.story = { title: 'ALERTA: ' + d.name, text: 'Enemy transmission located. Dodge the telegraphed attacks and destroy the commander.' };
  } else w.story = null;
  w.storyTimer = w.story ? 2600 : 0;
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

// ---------------------------------------------------------------- step
function step(w, ms) {
  if (w.status !== 'live') return;
  const dt = ms / 1000;
  const tier = Math.floor((w.level - 1) / 5);
  const mode = MODES[w.mode];
  if (w.rng) RNG = w.rng; // keep every draw reproducible for this world
  const now = w.seed != null ? w.tick : Date.now(); // tick clock when deterministic

  if (w.storyTimer > 0) w.storyTimer = Math.max(0, w.storyTimer - ms);
  w.flash = Math.max(0, w.flash - ms);
  if (w.laser > 0) w.laser -= ms;

  for (const p of w.players) {
    for (const k of Object.keys(p.timers)) p.timers[k] = Math.max(0, p.timers[k] - ms);
    p.invuln = Math.max(0, p.invuln - ms);
    p.shot = Math.max(0, p.shot - ms);
    // A seat that stopped sending input is offline: its ship freezes, translucent.
    // 8 s of idle. In the deterministic (tick) clock that is 160 ticks at 50 ms.
    if (!p.offline && now - p.lastInput > (w.seed != null ? 160 : 8000)) p.offline = true;
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

  w.enemyTimer += ms;
  const moveInterval = Math.max(150, 480 - w.level * 22);
  if (w.enemyTimer >= moveInterval && w.enemies.length) {
    w.enemyTimer %= moveInterval;
    const edge = w.enemies.some((e) => e.baseX < 12 || e.baseX + e.w > W - 12);
    if (edge) w.enemyDir *= -1;
    let reached = false;
    for (const e of w.enemies) {
      e.baseX += w.enemyDir * (7 + tier * 2);
      if (edge) e.y += 12;
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
    if (b.kind === 1) b.y = b.baseY + Math.sin(b.t * 1.6) * 30;
    if (b.kind === 2) b.y = b.baseY + Math.sin(b.t * 0.9) * 46;
    w.bossTimer += ms;
    if (w.warning > 0) {
      w.warning -= ms;
      if (w.warning <= 0) {
        if (b.kind === 2) { w.laser = 380; w.laserX = w.warningX; }
        else for (let i = -1; i <= 1; i++) bullet(w, true, w.warningX + i * 11, b.y + b.h, i * 35, 240 * mode.bullet);
      }
    }
    const cadence = Math.max(600, (1700 - tier * 150) * mode.fire);
    if (w.bossTimer >= cadence) {
      w.bossTimer = 0; b.phase++;
      if (b.phase % 3 === 0) {
        const target = w.players.filter((p) => p.alive && !p.offline);
        w.warningX = clamp((target.length ? target[Math.floor(rnd(0, target.length))].x : W / 2) + 20, 25, W - 25);
        w.warning = b.kind === 2 ? 850 : 650;
      }
      else if (b.kind === 0) for (let i = -2; i <= 2; i++) bullet(w, true, b.x + b.w / 2, b.y + b.h, i * 75, (205 + tier * 22) * mode.bullet);
      else if (b.kind === 1) for (const sx of [b.x + 14, b.x + b.w - 14]) for (let i = -1; i <= 1; i++) bullet(w, true, sx + i * 12, b.y + b.h, 0, (210 + tier * 20) * mode.bullet);
      else for (let a = 0; a < 8; a++) { const ang = a * Math.PI / 4; bullet(w, true, b.x + b.w / 2, b.y + b.h / 2, Math.cos(ang) * 160, Math.sin(ang) * 140); }
    }
    if (w.laser > 0) for (const p of w.players) if (p.alive && Math.abs((p.x + p.w / 2) - w.laserX) < 24) damage(w, p);
  }
  else if (w.enemies.length) {
    w.fireTimer += ms;
    const cadence = Math.max(230, (780 - w.level * 36) * mode.fire);
    if (w.fireTimer >= cadence) {
      w.fireTimer = 0;
      const e = w.enemies[Math.floor(rnd(0, w.enemies.length))];
      if (e) {
        const speed = (220 + tier * 20) * mode.bullet;
        if (e.type === 'sniper') {
          const target = w.players.filter((p) => p.alive && !p.offline);
          if (target.length) {
            const p = target[Math.floor(rnd(0, target.length))];
            const dx = (p.x + p.w / 2) - (e.x + e.w / 2), dy = p.y - e.y;
            const len = Math.hypot(dx, dy) || 1;
            bullet(w, true, e.x + e.w / 2, e.y + e.h, dx / len * speed, dy / len * speed);
          }
        } else if (e.type === 'armored') for (const vx of [-65, 65]) bullet(w, true, e.x + e.w / 2, e.y + e.h, vx, speed);
        else bullet(w, true, e.x + e.w / 2, e.y + e.h, 0, speed);
      }
    }
  }

  for (const b of w.bullets) {
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
        if (shooter) shooter.score += e.type === 'armored' ? 200 : 100;
        burst(w, e.x + e.w / 2, e.y + e.h / 2, '#ff3366');
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
  const fresh = create(w.mode);
  for (const n of names) addPlayer(fresh, n);
  fresh.status = 'live';
  initLevel(fresh);
  return fresh;
}

// ---------------------------------------------------------------- snapshot (wire)
// Compact arrays: four phones polling 4x/s must stay far below a few KB each.
function snapshot(w) {
  return {
    t: w.tick,
    st: w.status,
    lv: w.level,
    md: w.mode,
    ps: w.players.map((p) => [
      p.seat, p.name, Math.round(p.x), Math.round(p.y), p.lives, p.score,
      p.alive ? 1 : 0, p.offline ? 1 : 0, p.color,
      (p.timers.multishot ? 'M' : '') + (p.timers.shield ? 'S' : '') + (p.timers.rapidfire ? 'R' : ''),
      p.speed,
    ]),
    en: w.enemies.map((e) => [Math.round(e.x), Math.round(e.y), e.type, e.hp]),
    b: w.boss ? [w.boss.name, Math.round(w.boss.x), Math.round(w.boss.y), w.boss.w, w.boss.h,
      Math.ceil(w.boss.hp), w.boss.maxHp, w.boss.kind] : null,
    bl: w.bullets.map((b) => [Math.round(b.x), Math.round(b.y), b.w, b.h]),
    eb: w.enemyBullets.map((b) => [Math.round(b.x), Math.round(b.y), b.w, b.h]),
    pu: w.powerUps.map((p) => [Math.round(p.x), Math.round(p.y), p.type]),
    pa: w.particles.map((p) => [Math.round(p.x), Math.round(p.y), Math.round(p.life * 100) / 100, p.color]),
    wr: w.warning > 0 ? Math.round(w.warningX) : -1,
    la: w.laser > 0 ? Math.round(w.laserX) : -1,
    fl: w.flash,
    story: w.storyTimer > 0 ? w.story : null,
    total: w.players.reduce((s, p) => s + p.score, 0),
    createdAt: w.createdAt,
  };
}

const SiSim = {
  create, addPlayer, applyInput, step, initLevel, snapshot, restart,
  MODES, BOSS_DEFS, CHAPTERS, COLORS, W, H,
};
module.exports = SiSim;
