# 🧈 Arkanoid — Plano: Motor + Fases + Bosses + Powerups + Audio

**Goal:** add a third game, **Arkanoid: Neon Breaker**, to the page, reusing the existing infra (minimized section + icon, canvas engine, ranking, procedural audio). Quality bar: physics-based paddle, **incredible phases** (progressive layouts), **bosses** with HP bar, **powerups**, and a **procedural soundtrack + quality SFX**.

**Rule:** implement one phase at a time; update this file after each one. Never break the other two games.

**Status:** 🟡 Phase 0 + Phase 1 complete (core engine verified in browser) — Phases 2-6 pending.

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

`phaseFor`/`layoutFor(phase)` returns a pattern. Difficulty ramps: more rows, tougher bricks, faster ball.

- [ ] 2.1 Layout generators (distinct silhouettes): pyramid, arch/dome, checkerboard, tunnel/corridor, fortress (hollow core), spiral, "invader" silhouette (homage to SI).
- [ ] 2.2 Brick types by phase: normal (1 hit), **tough** (2–3 hits, color-shifts), **armored** (needs laser/2 hits, immune to side), **moving** (drifts horizontally, reuse SI `vx` idea).
- [ ] 2.3 Ball speed ramps per phase (`speed = base + phase*k`, clamped).
- [ ] 2.4 `nextPhase()`: rebuild layout, bump speed, `sfx('wave')`, update HUD.
- [ ] 2.5 Cap phases (e.g., 12) then loop with speed multiplier (endless-ish), like Alvos caps at 12.

**Acceptance criteria:** each phase has a visibly different layout; tough/armored/moving bricks appear as phases progress; ball accelerates; clear → next phase.

---

## Phase 3 — Bosses (reuse `.boss-bar` HUD)

Boss every 4th phase (4/8/12), like Alvos/SI.

- [ ] 3.1 `akBossDefs`: 3 bosses (name, w, h, colors, kind) — mirror SI `bossDefs` shape.
- [ ] 3.2 Boss = a moving multi-HP entity patrolling above bricks; HP bar via existing `.boss-bar` (name + hp/maxHp + fill%).
- [ ] 3.3 Boss attacks per `kind`: (a) drops projectiles the paddle must dodge, (b) spawns minion bricks, (c) shifts the whole layout / fires a sweeping laser telegraph (reuse SI `warning`/`laser` idea).
- [ ] 3.4 Ball hits boss → `hp--`, `sfx('bossHit')`; boss defeated → big bonus + phase clear; boss projectile hits paddle → `loseLife`.
- [ ] 3.5 Boss must be defeated to advance (locks the phase).

**Acceptance criteria:** boss appears at phase 4 with HP bar; attacks differ per kind; defeating it clears the phase; projectiles threaten the paddle.

---

## Phase 4 — Powerups (falling capsules caught by paddle)

Drop from destroyed bricks (prob ~0.12, cap concurrent like Alvos).

- [ ] 4.1 Falling capsule `{x,y,type}`; paddle overlap → apply + `sfx('power')`.
- [ ] 4.2 Types: **expand** (wider paddle), **multiball** (split into 3), **laser** (paddle shoots up for Ns, breaks armored), **sticky** (catch & relaunch), **slow** (ball speed ×0.7 for Ns), **x2** (score ×2 for Ns), **life** (+1, cap 5), **shield** (one free bounce below paddle).
- [ ] 4.3 Timers decay in the loop (like SI `g.timers`); HUD shows active effects (reuse `tgEffects` pattern → `akEffects`).
- [ ] 4.4 Bad powerups (rare): shrink paddle, speed-up — visual ⚠️ so player avoids.

**Acceptance criteria:** capsules fall and are caught; each type visibly changes gameplay; timers expire; HUD lists active effects.

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

- [ ] 6.1 `styles.css`: `.arkanoid-*` (section, overlay) reuse existing `.boss-bar`/`.powerup`; add paddle/ball neon glow if drawn in DOM (mostly canvas, so minimal).
- [ ] 6.2 Browser playtest (open via icon, scripted auto-play to reach phase 4 boss + a powerup).
- [ ] 6.3 `node --check script.js audio.js`; `get_errors` clean.
- [ ] 6.4 Commit + push; update this file's Status to 🟢.

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
