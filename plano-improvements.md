# 🎮 Space Invaders — Plano: Nave Vertical + Bosses Differentiated

**Goal:** two improvements in `script.js` (plus one hint line in `index.html`):
1. **Improvement 1:** vertical movement of the ship (↑↓ / W-S), restricted to the lower band of the screen.
2. **Improvement 2:** the 3 bosses differentiated by shape, size, color, movement and attack.

**Rule:** execute one improvement at a time; update this file after each one.

**Status:** 🟢 Complete — both improvements implemented in `script.js` (pending: manual playtest)

---

## Improvement 1 — Vertical movement of the ship

- [x] 1.1 Add `up`/`down` to `keys` (`script.js:67`)
- [x] 1.2 Constant `Y_MIN=H*0.45` (ship restricted to the lower ~55%) (`script.js:54`)
- [x] 1.3 `update()`: move `g.y` with `keys.up/down` (`script.js:193`)
- [x] 1.4 Listeners `keydown`/`keyup`/`blur`: arrows + W/S (`script.js:304-316`)
- [x] 1.5 Update texts: controls help (`script.js:78`) and overlay hint (`index.html:37`)
- [x] 1.6 Rule "enemy reaches the ship": replace `e.y+e.h>=g.y` → `end()` with collision `hit(e,g)` → `damage()` + rule reaching the bottom of the screen (`script.js:205`)

**Acceptance criteria:** ship moves in 8 directions; cannot leave the band; W/S work as well as arrows; bullets still start from the ship.

---

## Improvement 2 — Differentiated bosses

| # | Boss (level) | Size | Color | Movement | Attack |
|---|--------------|------|-------|----------|--------|
| 0 | Sentinela Ômega (5) | 110×50 | blue/light blue | horizontal patrol | fan of 5 shots + telegraphed aimed shot |
| 1 | Matriarca do Enxame (10) | 160×44 | purple/pink | horizontal + vertical sine (±30) | parallel rain from wings + telegraphed shot |
| 2 | Núcleo da Frota (15) | 140×72 | yellow/ochre | vertical bob (±46) | 8-way radial burst + telegraphed **full-height laser** |

- [x] 2.1 Replace `bossNames` (`script.js:66`) with `bossDefs` (name, w, h, colors, vx, kind)
- [x] 2.2 `initLevel()` (`script.js:123-127`): build `g.boss` from `bossDefs[tier]` (size, `baseY`, `kind`, `t`)
- [x] 2.3 `update()` (`script.js:210-222`): movement per `kind` (sine/bob) and attack per `kind`
- [x] 2.4 New attack boss 2: telegraphed laser — reuse `warning`/`warningX`, then `g.laser`/`g.laserX` (new fields in `reset()`)
- [x] 2.5 `draw()` (`script.js:280-284`): 3 different drawings (silhouette, color, detail) + laser beam
- [x] 2.6 `nextLevel()` (`script.js:178`): boss name from `bossDefs`

**Acceptance criteria:** levels 5/10/15 show clearly different bosses in shape, size, color, movement and attack; the 3 remain beatable in all 3 difficulties.

---

## Progress log

- **2026-10-09 — Improvement 1 done:** all 6 subtasks applied; `node --check script.js` → OK. Ship moves in 8 directions within the band `y ∈ [270, 580]`; W/S and arrows both work; enemy touching the ship now causes `damage()` (with invulnerability) instead of instant game over, and only reaching the bottom of the screen (`y+h ≥ H`) ends the game.
- **2026-10-09 — Improvement 2 done:** all 6 subtasks applied; `node --check script.js` → OK; 0 references to `bossNames`, 3 to `bossDefs`. Bosses now distinct: **Ômega** (blue, 110×50, patrol, fan of 5 + aimed shot), **Matriarca** (purple, 160×44, sine vertical ±30, flapping wings, parallel rain from wings), **Núcleo** (yellow, 140×72, bob ±46, pulsing core, 8-way radial + telegraphed full-height laser via `g.laser`). HP/cadence still scale with tier and difficulty mode.
- **Pending:** manual playtest (levels 5/10/15, 3 difficulties) and check that minimize/restore, story and victory at level 15 still work.
