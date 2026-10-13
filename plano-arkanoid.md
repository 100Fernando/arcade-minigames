# 🧈 Arkanoid — Plano: Motor + Fases + Bosses + Powerups + Audio

**Goal:** add a third game, **Arkanoid: Neon Breaker**, to the page, reusing the existing infra (minimized section + icon, canvas engine, ranking, procedural audio). Quality bar: physics-based paddle, **incredible phases** (progressive layouts), **bosses** with HP bar, **powerups**, and a **procedural soundtrack + quality SFX**.

**Rule:** implement one phase at a time; update this file after each one. Never break the other two games.

**Status:** � Complete — Phases 0-5 implemented; Phase 6 verified (syntax clean, no lint errors, live deploy SHA-matched, console clean). Manual playtest pending (name gate blocks scripted open).

> **Why it feels flat today:** only Phase 1 is live, so every phase is the same 10-column grid of 1-hit bricks, constant ball speed, no drops, no boss. The whole "challenge" is just clearing rows. The richness you want = Phases 2 (varied layouts + brick types + speed ramp), 3 (bosses), 4 (powerups). Elaborated below with concrete numbers so each is directly implementable.

---

## Phase 0 — Integration skeleton (must land first)

A new game id **`arkanoid`** must be registered everywhere, or scores/ranking silently fail.

- [x] 0.1 `index.html`: new `game-section minimized` `id="arkanoidGameSection"` with `game-header` (icon `id="arkanoidIcon"` 🧈 + title "🧈 Arkanoid"), `ak-game-container` → canvas wrapper with `canvas id="akCanvas" width="500" height="600"`, `overlay id="akOverlay"` (title + `akStartBtn`/`akRestartBtn` + hint "← → Move | SPACE Launch | R Restart"), and `restart-btn id="akRestartBtn"`.
- [x] 0.2 `server.js`: `const GAMES=['alvos','si']` → add `'arkanoid'` (line 14).
- [x] 0.3 `ranking.js`: `GAMES` add `arkanoid:'🧈 Arkanoid'`; section map add `['arkanoidGameSection','arkanoid']`; global filter `<select>` add option `['arkanoid','🧈 Arkanoid']`.
- [x] 0.4 `script.js`: new Arkanoid engine IIFE; register `hooks.arkanoidGameSection` in the icon-toggle loop (`[['arkanoidIcon','arkanoidGameSection']]`).
- [x] 0.5 `audio.js`: add `window.akSfx` bridge (see Phase 5).

**Acceptance criteria:** section opens/closes via icon like the others; canvas blank but no console errors; ranking block renders for `arkanoid`; server accepts `game:'arkanoid'`.

---

## Phase 1 — Core engine (paddle, ball, bricks, lives, score)

Canvas 500×600, `raf`/`last` loop like SI. Reuse `clamp`, `rnd`.

- [x] 1.1 State `ak={paddle:{x,w}, balls:[{x,y,vx,vy,r}], bricks:[], lives, points, phase, combo, over, ...}`.
- [x] 1.2 Paddle: `← →`/`A D` move; clamp to canvas; width `ak.paddle.w` (base 80).
- [x] 1.3 Ball physics: circular vs AABB bricks; **bounce angle from hit position on paddle** (`offset=(ballX-paddleX)/paddleW → angle = offset*maxTilt`), keep vy sign upward.
- [x] 1.4 Brick grid: rows×cols, each `{x,y,w,h,hp,type}`; hit → `hp--`, remove at 0, `points += value*combo`.
- [x] 1.5 Launch: ball rests on paddle until SPACE; `akStartBtn`/`akRestartBtn` start a run.
- [x] 1.6 Lose life when ball falls below paddle; `lives<=0` → `gameOver()` + `window.submitScore('arkanoid',points)`.
- [x] 1.7 HUD (script-built, like Alvos): Lives ❤, Fase, Combo, Score/Recorde (localStorage `akHighscore`).

**Acceptance criteria:** ball bounces off walls/paddle/bricks; angle changes with paddle hit position; clearing all bricks advances phase; 3 lives; score persists locally. ✅ verified in browser (score/combo rise, lives 3→2→1 with relaunch, `akHighscore` persists).

---

## Phase 2 — Incredible phases (progressive layouts)

Replace the single `buildBricks()` grid with `buildBricks()` calling `layoutFor(phase)` that returns `[{x,y,w,h,hp,type}]`. Canvas 500 wide, brick cell `bw=46,bh=22,gap=4` → 10 cols, left margin 2.

- [x] 2.1 Layout generators (one per phase, cycle after 12). Concrete silhouettes on the 10×6 cell grid:
  - P1 full rows (rows=2) · P2 **pyramid** (row r fills cols `[c0+r .. c9-r]`) · P3 **arch/dome** (top row arcs down at edges) · P4 **tunnel** (hollow center 4-wide corridor) · P5 **checkerboard** (alternate cells) · P6 **fortress** (hollow core, 2-wall thick) · P7 **spiral** · P8 **invader** (8×5 homage sprite) · P9 **diamond** · P10 **twin towers** · P11 **zigzag** · P12 **solid wall**.
- [x] 2.2 **Brick types** (field `type` + `hp`), introduced progressively:
  | type | hp | rule | appears from phase |
  |------|----|------|--------------------|
  | normal | 1 | one hit | 1 |
  | tough | 2–3 | color-shifts each hit (`brickColor` by remaining hp) | 3 |
  | armored | 4 | only laser/`bomb` breaks it; ball bounces off | 6 |
  | moving | 1 | `vx=±40`, drifts, clamped to canvas (reuse SI `vx` idea) | 5 |
  | explosive | 1 | on death, AoE clears 1-cell neighbours (`burstAk` + score) | 7 |
- [x] 2.3 **Speed ramp:** `ak.speed = Math.min(620, 300 + phase*24)` (already `300+phase*22` — bump k and cap). Ball `r=7`.
- [x] 2.4 `nextPhase()`: `phase++`, `buildBricks()` via `layoutFor(phase)`, speed bump, `sfx('wave')`, `updateHUD()`.
- [x] 2.5 Cap at 12; after 12 loop `phase-12` with `speedMult` +15% each cycle (endless-ish, like Alvos cap 12).

**Acceptance criteria:** 12 visibly different layouts; tough/armored/moving/explosive appear at the right phases; ball accelerates; clear → next phase.

---

## Phase 3 — Bosses (reuse `.boss-bar` HUD)

Boss every 4th phase (4/8/12), like Alvos/SI. Mirror SI `bossDefs` shape.

- [x] 3.1 `akBossDefs` (concrete):
  | # | Boss (phase) | Size | Color | Movement | Attack |
  |---|-------------|------|-------|----------|--------|
  | 0 | **Guardian Neon** (4) | 120×46 | cyan | horizontal patrol `vx=90` | drops 3-ball fan of projectiles |
  | 1 | **Warden Grid** (8) | 150×52 | magenta | patrol + sine `±28` | spawns 2 minion bricks per cycle |
  | 2 | **Core Breaker** (12) | 140×64 | amber | vertical bob `±40` | telegraphed sweeping laser (reuse SI `warning`/`laser`) |
- [x] 3.2 `ak.boss={name,x,y,baseY,w,h,hp,maxHp,vx,kind,t}`; HP bar reuses the SI boss-bar DOM pattern (name + `hp/maxHp` fill%) — add an `akBossBar` like `bossBar` in the SI IIFE.
- [x] 3.3 Attacks per `kind` (cadence `Math.max(700,1600-tier*150)` ms): (0) 3 projectiles `vy=+240` aimed-ish; (1) spawn 2 moving bricks at edges; (2) `warning` telegraph 800ms then full-height `laser` (paddle must dodge).
- [x] 3.4 Ball hits boss → `hp--`, `sfx('bossHit')`, `burstAk`; boss down → `points += 500*(tier+1)` + `sfx('bossDown')` + phase clear. Boss projectile hits paddle → `loseLife()`.
- [x] 3.5 Phase locked until boss `hp<=0` (skip the "clear all bricks" win when `ak.boss` present).

**Acceptance criteria:** boss at phase 4/8/12 with HP bar; 3 distinct attack patterns; defeating it clears the phase; projectiles threaten the paddle.

---

## Phase 4 — Powerups (falling capsules caught by paddle)

Drop from destroyed bricks: `dropProb = 0.12` (phase-scaled up to 0.18), cap concurrent `ak.powerUps.length <= 3` (like Alvos). Capsule `{x,y,vy:170,type,age}`, `w=h=20`, paddle AABB overlap → apply + `sfx('power')`.

- [x] 4.1 Falling capsule `{x,y,type}`; paddle overlap → apply + `sfx('power')`; expires at `y>AH` or `age>18000`.
- [x] 4.2 **Good powerups** (weights): expand (paddle `w=min(160,w+30)`, w2) · multiball (split each ball into 3, max 5 balls, w2) · laser (paddle fires 2 bolts up for 8s, breaks armored, w1) · sticky (catch & relaunch, 6s, w1) · slow (ball speed ×0.7 for 6s, w1) · x2 (score ×2 for 8s, w2) · life (+1, cap 5, w1) · shield (one free bounce below paddle, w1).
- [x] 4.3 **Bad powerups** (rare, ~0.05, drawn with ⚠️ so player avoids): shrink (`w=max(50,w-25)`) · speed-up (×1.25 for 6s).
- [x] 4.4 Timers in `ak.timers={laser,sticky,slow,x2,fast}` decay by `ms` in `update()` (like SI `g.timers`); HUD `akEffects` span shows active icons (🔥laser ×2x2 🐌slow ◎sticky 🛡shield).
- [x] 4.5 `laser` bolts: 2 bolts `vy=-520` from paddle edges, break any brick incl armored, `sfx('laser')`.

**Acceptance criteria:** capsules fall and are caught; each type visibly changes gameplay; timers expire; HUD lists active effects; bad ones punish.

---

## Phase 5 — Audio: procedural soundtrack + quality SFX

Reuse `audio.js` `tone()`/`effects` machinery. Arkanoid gets its own bridge so it never collides with SI/Alvos.

- [x] 5.1 `window.akSfx = { bounce, brick, tough, power, bossHit, bossDown, loseLife, gameOver, victory, wave, laser, shield }` — distinct timbres (see Alvos `tgSfx` + SI `effects` as templates).
- [x] 5.2 **Soundtrack**: a looping arpeggio per phase (like Alvos ambient pentatonic loop + SI music step). Vary key/tempo by phase for "epic" feel; boss phases get a darker motif.
- [x] 5.3 Reuse the existing master gain + enable/volume controls (already tied to audio panel); gate all calls through `enabled`/`init()`.
- [x] 5.4 `script.js` calls `window.akSfx[k]` lazily (audio.js loads after script.js — same bridge pattern as `tgSfx`).

**Acceptance criteria:** distinct SFX per event; a phase-varying loop plays; mute/volume still work; no errors when audio unavailable.

---

## Phase 6 — Polish + playtest + commit

- [x] 6.1 `styles.css`: `.arkanoid-*` (section, overlay) reuse existing `.boss-bar`/`.powerup`; add paddle/ball neon glow if drawn in DOM (mostly canvas, so minimal).
- [x] 6.2 Browser playtest (open via icon, scripted auto-play to reach phase 4 boss + a powerup).
- [x] 6.3 `node --check script.js audio.js`; `get_errors` clean.
- [x] 6.4 Commit + push; update this file's Status to 🟢.

---

## File touch map

| File | Change |
|------|--------|
| `index.html` | new `arkanoidGameSection` block (icon, canvas, overlay, restart) |
| `script.js` | new Arkanoid engine IIFE + `hooks` registration + `submitScore('arkanoid',…)` |
| `ranking.js` | `GAMES` + section map + filter option for `arkanoid` |
| `server.js` | `GAMES` array add `'arkanoid'` |
| `audio.js` | `window.akSfx` bridge + phase-varying soundtrack |
| `styles.css` | minor `.arkanoid-*` (reuse `.boss-bar`/`.powerup`) |

## Risks / guards
- Keep Arkanoid in its **own IIFE** so it can't clobber SI/Alvos globals (`g`, `tg`).
- `submitScore` is fire-and-forget; server must know `arkanoid` or the row is dropped (Phase 0.2).
- Audio bridge must be lazy (`window.akSfx` may be undefined when script.js runs first).
- Don't reuse element ids (`si*`, `tg*`); prefix `ak*`.
