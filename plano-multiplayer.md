# 🌐 Space Invaders — Multiplayer Online — Plano

**Goal:** multiplayer **online** (never local/split-screen) for Space Invaders: up to **4 players in the same match**, mixing **PC + mobile** arbitrarily. Needs **match creation**, a **lobby**, join-by-code, and a shared game that stays in sync across devices.

**Rule:** implement one phase at a time; update this file after each one. Never break the single-player games (`si`, `alvos`, `arkanoid`).

**Status:** � Complete — Phases 0–4 implemented and verified (2026-10-13): `test-mp.js` 25/25 PASS, two browser pages synced on the same `tick`, live on `https://ferramox.duckdns.org/arcade/` (SHA-matched).

---

## Why this architecture (the decision that shapes everything)

The frontend is **static** (GitHub Pages + `/arcade/` on the VPS). There is no WS server and nginx has no `Upgrade` mapping. So:

> **Server-authoritative, fixed-timestep simulation + HTTP polling.**
> The VPS Node process owns the single source of truth: it steps the world every **50 ms (20 Hz)** and holds each player's input state. Clients only **send input** and **pull a snapshot** to render. No WebRTC, no WS, no determinism requirement across devices (only the server simulates), no new nginx `location` (routes live under the existing `/ranking-api/` proxy), no new pm2 service, no new dependency.

Consequences:
- One origin for everything: `https://ferramox.duckdns.org/ranking-api/api/mp/*` (already proxied, already CORS `*`).
- Latency = one poll (250 ms) — fine for co-op arcade.
- Rooms live **in memory** (Map + TTL), not in MySQL. Ranking still goes to MySQL via the existing `/api/score`.

---

## Phase 0 — Registration + shared simulation module

- [x] 0.1 New file **`si-sim.js`**: CommonJS module (the server `require`s it; the client never needs it — it only renders snapshots). Exports:
  `create(mode)`, `step(world, dtMs)`, `snapshot(world)`, `applyInput(world, seat, input)`, `serialize/deserialize`.
  This is the **only** simulation. The single-player engine in `script.js` is **not touched** (zero regression risk) — the MP sim is a compact re-implementation sharing the same constants (`BASE_SPEED=250`, `Y_MIN=H*0.45`, fleet/boss cadences).
- [x] 0.2 `server.js`: `GAMES` add **`si_mp`**; `--ensure-table` enum widening array becomes `["alvos","si","arkanoid","si_mp"]`.
- [x] 0.3 `ranking.js`: `GAMES` add `si_mp:'🌐 SI Multiplayer'`; global filter `<select>` add the option. (No per-section board: the MP section renders its own result panel.)
- [ ] 0.4 `index.html`: new `game-section minimized` `id="mpGameSection"` — icon `mpIcon` 🌐, title "🌐 Space Invaders · Multiplayer", `mpGameContainer` → wrapper + `canvas id="mpCanvas" width="500" height="600"` + `overlay id="mpOverlay"` (`mpStartBtn` create/join, `mpRestartBtn`, hint).
- [x] 0.5 Styles: `mp-client.js` injects its own `<style>` (same pattern `aventura-mobile.js` uses) — `styles.css` left untouched, zero regression risk.

**Acceptance:** section opens/closes via the icon loop; canvas blank; no console errors; `GET /api/mp/health` → `{ok:true}`.

---

## Phase 1 — Server: rooms, lobby, lifecycle

All in `server.js`, under `/api/mp/*`, with a `ROOMS` Map + a 20 Hz `setInterval` stepper and a TTL sweeper.

| Route | Effect |
|-------|--------|
| `GET /api/mp/health` | `{ok, rooms, tickRate}` |
| `GET /api/mp/lobby` | `[{code, players:[{name,alive,lives,score}], level, status, age}]` — open rooms only |
| `POST /api/mp/create {name,mode}` | new room, 4-char code from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no 0/O/1/I), status `waiting`, returns `{code, seat, snapshot}` |
| `POST /api/mp/join {code,name}` | seat the player (max 4, dedupe by name), returns `{seat, snapshot}` |
| `POST /api/mp/start {code}` | status `live`, everyone starts together |
| `POST /api/mp/input {code,seat,mx,my,fire}` | updates that seat's input; ack only |
| `GET /api/mp/state?code=` | compact snapshot (see 0.1) — `Cache-Control: no-store` |
| `POST /api/mp/leave {code,seat}` | seat goes offline (ship stops, can rejoin) |
| `POST /api/mp/restart {code}` | fresh world, same seats |

Guards: body ≤ 2 KB, code must exist, seat must be an integer in range, `mx/my` clamped `[-1,1]`, `fire` boolean; create rate-limited 1 per 10 s per IP; max 20 open rooms; rooms expire after 30 min of inactivity (sweeper every 60 s).

**Acceptance (scripted, `test-mp.js`):** create → join ×3 → start → 4 seats polling for 6 s → all see the **same `tick`** and identical world arrays; leave marks offline; lobby lists the room; expired room disappears.

---

## Phase 2 — Co-op rules (the actual gameplay design)

Shared world, per-player identity:

- **4 ships, 4 colors**: P1 green `#00ff88`, P2 cyan `#4facfe`, P3 amber `#ffcc00`, P4 magenta `#f093fb`. Name label above each ship.
- **No friendly fire**: bullets pass through other ships; ships pass through each other.
- **Per-player lives (3) + respawn**: a hit ship loses a life and respawns at the bottom after 2.5 s with 1.5 s invulnerability. **The match only ends when every alive seat is 0 lives at the same instant** → status `over`.
- **Shared fleet / level / boss**: same `level`, same boss every 5th level, same chapter cards (`story` shown to all clients).
- **Shared powerups**: any ship can catch one; effect applies only to that ship.
- **Per-player score** + **team total** in the HUD; `SPEED` global.
- **Offline seat**: no input for 8 s → `offline`, ship frozen and translucent, HUD shows 💡; joining again while `live` respawns it.
- **End of match**: each seat posts its own score to `/api/score` with `game:'si_mp'` (Google token path unchanged), and the section shows the ranking of the 4 seats + team total.

**Acceptance:** 4 ships move independently; a ship hit doesn't kill the match while others live; level advances on shared clear; boss appears at level 5 for all; per-player scores differ; match ends only when all are out.

---

## Phase 3 — Client: lobby + join + render + mobile controls

New file **`mp-client.js`** (loaded after `script.js`/`ranking.js`), own IIFE, prefix `mp*`.

- [x] 3.1 **Lobby panel** (DOM, script-built): auto-refresh every 3 s from `/api/mp/lobby` (`startLobby()`, independent of the match loop so the lobby is never blank on a fresh page); rows `code · level · 👤n/4 · status`; buttons **Create match**, **Join by code** (`<input maxLength=4>` + confirm), **Start match**, **Leave my match**.
- [x] 3.2 **Room state machine** in the client: `none → waiting → live → over`, auto-start at 20 s (or when a host presses Start); `endMatch()` posts the seat's own score via `window.submitScore('si_mp', …)`.
- [x] 3.3 **Renderer**: draws the snapshot on `mpCanvas` (starfield, warning/laser columns, enemies, boss + HP bar, bullets, powerups, particles, 4 colored ships with name tag + hearts, flash, story card, `connLost` banner). Verified by reading back the canvas pixels: fleet band `rgb(255,51,102)` + `rgb(240,147,251)`, own ship band `rgb(0,255,136)`.
- [x] 3.4 **Polling loop**: `fetch` state every 250 ms with the 3 s `AbortController` timeout pattern from `ranking.js`; on failure → `connLost` banner and the last frame stays.
- [x] 3.5 **Input**: PC keyboard (`←→↑↓`/`ADWS`/Space) → `POST /api/mp/input` throttled to 100 ms; mobile → analog `#mpStickZone` + 🔥 button, shown only under `@media (max-width:768px)` / `(pointer:coarse)`; own ids, never touches `window.siStick`.
- [x] 3.6 **Join by code UX**: 4-char code typed in a `<input>`, normalized to uppercase, `/^[A-Z2-9]{4}$/` guard, invalid/unknown code → "Match not found — check the code".

**Acceptance:** two browser pages (one desktop-sized, one 390 px wide) create/join the same room and both render the same `tick`; mobile stick drives only the MP ship; console clean.

---

## Phase 4 — Deploy + verification

- [x] 4.1 `node --check si-sim.js mp-client.js server.js test-mp.js` clean; `get_errors` clean.
- [x] 4.2 `test-mp.js` (node, no browser): scripted 4-client match — **25/25 PASS** (tick sync, leave, restart, 20 s direct-sim soak).
- [x] 4.3 VPS: scp `si-sim.js` + `server.js` into `/opt/ranking-api` (CRLF stripped), `node --check` on the box, `pm2 restart ranking-api` → `curl 127.0.0.1:8765/api/mp/health` = `{"ok":true,"rooms":0,"tick":50}`; from Windows `https://ferramox.duckdns.org/ranking-api/api/mp/create` → `{"ok":true,"code":"VL43",…}`.
- [x] 4.4 Frontend: `deploy\deploy-arcade.ps1` `$FILES` gained **`mp-client.js` only** (`si-sim.js` is server-side, it goes to `/opt/ranking-api`, NOT to the webroot) → served bytes SHA `32104bb7…` == local.
- [ ] 4.5 `git commit` + push; verify Pages served bytes match repo (SHA), per the known Pages gotcha.
- [x] 4.6 `README.md` API table extended with the 9 MP routes.

---

## Phase 5 — Performance (the ~2 fps problem, fixed 2026-10-13)

**Symptom:** the match ran but crawled at ~1–2 fps — unplayable. Root cause was NOT the sim (the VPS steps at 20 Hz fine, `test-mp.js` 25/25) nor the payload (snapshots ~700 bytes). It was the **request pattern**:

1. **Sequential latency.** The old loop did `await tick(); draw(); setTimeout(step, 250)` — the ~140 ms round trip (VPS is in France, players in Brazil) was paid **on top of** the 250 ms sleep, so each poll took ~400 ms → **2.5 fps**. Measured: state-request gaps were ~400 ms, not 250.
2. **Double round trips.** Input was a separate `POST /api/mp/input` with `Content-Type: application/json` → a **CORS preflight** (OPTIONS) before every input POST. Two network trips per poll.

**Fixes (all client-side + a tiny server addition, sim untouched):**
- [x] 5.1 **Start-to-start polling** (`mp-client.js`): schedule the next poll from a running `next += POLL_MS` clock, so a 140 ms request inside a 120 ms slot costs **zero** extra delay. Poll rate now tracks the network (~140–160 ms ≈ 7 polls/s) instead of `latency + 250`.
- [x] 5.2 **Input rides on the state GET** (`?code=&seat=&mx=&my=&fire=`). A GET with no body and no custom headers is a *simple* CORS request → **no preflight**, one round trip per poll. `server.js` `/api/mp/state` now calls `applyInput` when those params are present. `POST /api/mp/input` kept for back-compat (test-mp.js still uses it).
- [x] 5.3 **Interpolated 60 fps render** (`mp-client.js`): the canvas repaints on `requestAnimationFrame`, blending the previous snapshot into the current one (`lerpSnap`, entities matched by index/seat/type with a max-delta guard so a respawn never streaks across the screen). 20 Hz sim + ~7 Hz poll now *looks* like a smooth 60 fps game. HUD redraw decoupled (only on tick/status change) so it stops thrashing the DOM every frame.

**Verified (2026-10-13):** `node --check` clean, `get_errors` clean, `test-mp.js` 25/25, new `test-state-input.js` 4/4 (input-on-GET moves the ship + spawns a bullet). Live on `https://ferramox.duckdns.org/arcade/`: canvas draw rate went from ~2.5 fps to **~187 fillRect/s** (rAF-driven), state-request gaps ~140–160 ms, pixel bands green (own ship `rgb(0,255,136)` + fleet `rgb(255,51,102)` present), console clean.

---

## Phase 6 — Input lag (the "responds late after commands" problem, 2026-10-14)

### Analysis (measured, not guessed)

**Symptom:** the match renders smoothly (Phase 5 fixed fps) but the ship reacts ~0.5–2 s after a key/stick press — players give up because dodging feels impossible.

**Root cause — the architecture is still request/response over slow HTTP:**

1. **Input is a round trip.** Every command travels to the VPS and waits for the response: `mp-client.js` polls `GET /api/mp/state?...&mx=&my=&fire=` every 120 ms. The ship only moves once the server has *received* that input. So input lag ≈ **poll interval + one full network round trip**.
2. **The round trip is much worse than assumed.** Measured from Windows today: first request 2.2 s, second 4.7 s, steady state 130–530 ms. nginx keeps `Connection: keep-alive` but the browser still pays a fresh **TLS handshake per burst** (no `keepalive` directive in the `/ranking-api/` block → nginx closes idle upstreams), and the box is in France while players are in Brazil. Phase 5 assumed ~140 ms; reality spikes to 500 ms–2 s.
3. **No own-client prediction.** The client never simulates its own ship, so a key press can never take effect before the network answers. This is the textbook fix for network-action games and it is missing.

**Technology audit:**

| Layer | Current | Verdict |
|-------|---------|---------|
| Sim | server-authoritative 20 Hz (`si-sim.js`) | ✅ keep — single source of truth, no cross-device determinism needed |
| Transport | HTTP polling, input rides on GET | ❌ latency-bound; **WebSocket push** is the right upgrade: one persistent connection, server PUSHES snapshots (~20/s), client SENDS input fire-and-forget (no waiting) → input lag ≈ sim tick (50 ms) |
| nginx | `/ranking-api/` proxy without upgrade mapping | ❌ must add `map $http_upgrade` + `proxy_set_header Upgrade/Connection` (one-time VPS edit, wedding app untouched) |
| Client render | rAF + `lerpSnap` interpolation | ✅ keep — becomes the smoothing between pushed snapshots |
| Fallback | none | must keep the HTTP polling path (Phase 5) as automatic fallback if the WS fails (proxy blocks it, extension, flaky net) — game must degrade, never die |

**Alternatives considered:** WebRTC (overkill, no STUN/TURN needed for text state), RTMP/long-poll (same latency class), moving the sim client-side (breaks the single-source-of-truth rule + desync risk). WS push + client-side own-ship prediction is the standard "lag compensation" architecture and needs **zero new dependencies** (Node 18 `upgrade` event + hand-rolled RFC645541 frames, verified by `probe-upgrade.js`).

### Plan (execute one at a time, verify each)

- [x] 6.0 Probe: Node emits `upgrade` with no dependency (`probe-upgrade.js` → PASS).
- [ ] 6.1 `server.js`: WebSocket room transport — `GET /api/mp/ws?code=XXXX` upgrades; server PUSHES `snapshot` every 50 ms tick (only when ≥1 socket connected), accepts `{i:[mx,my,fire],s:seat}` messages fire-and-forget; per-socket seat binding; TTL/limits identical to HTTP path.
- [ ] 6.2 `mp-client.js`: WS transport — on create/join, open the socket; input sent immediately (no await); snapshots received push-based; **own-ship prediction** (client applies its own input locally between snapshots so a press acts at once, server snapshot corrects); keep HTTP polling loop as automatic fallback when the socket errors/closes.
- [ ] 6.3 nginx on VPS: add `map $http_upgrade $connection_upgrade` + upgrade headers to the `/ranking-api/` location (idempotent script, `nginx -t` guard, wedding + ranking regressions re-checked).
- [ ] 6.4 Tests: `test-ws.js` (node, hand-rolled client): create→join→ws→start→input msg→tick advances→snapshot push→seat sync; `test-mp.js` + `test-state-input.js` still green (HTTP path untouched).
- [ ] 6.5 Deploy: scp `server.js` → `/opt/ranking-api` + `pm2 restart`; run nginx upgrade script; push `mp-client.js` to `/var/www/arcade` + Pages; live verify two browser pages on the same room, measure input→response delay < 150 ms.
- [ ] 6.6 `git commit` + push; SHA-match check per the Pages gotcha.

## File touch map

| File | Change |
|------|--------|
| `si-sim.js` | **new** — the shared simulation (server + browser), the single source of truth |
| `mp-client.js` | **new** — lobby, join, polling renderer, PC + mobile input, result panel; Phase 5: start-to-start poll + input-on-GET + interpolated rAF render |
| `server.js` | `GAMES` + `si_mp`; `/api/mp/*` routes; `ROOMS` Map + 20 Hz stepper + TTL sweeper; Phase 5: `/api/mp/state` applies `?seat=&mx=&my=&fire=` input |
| `index.html` | `mpGameSection` block + `<script src="mp-client.js">` + `si-sim.js` |
| `ranking.js` | `GAMES` + filter option for `si_mp` |
| `styles.css` | `.mp-*` lobby/overlay (minor) |
| `test-mp.js` | **new** — scripted 4-player verification |
| `deploy/deploy-arcade.ps1` | `$FILES` add `si-sim.js`, `mp-client.js` |

## Risks / guards
- **Never** reuse ids (`si*`, `ak*`, `tg*`) — MP uses `mp*`.
- `si-sim.js` must be CommonJS-loadable (`require`) **and** browser-loadable (`window.SiSim`); no `require` at top level of browser path.
- The MP stepper must be inside `try/catch` — a throwing step must not crash the pm2 process (that would take down `/api/ranking` too).
- Snapshot must stay small: cap particles at 60, enemies at 42, bullets at 80; drop `baseX`/`t` from the wire format.
- `Cache-Control: no-store` on state responses — nginx/Pages caching would freeze the match.
- Single-player SI stays byte-identical; the MP sim is separate. If they ever drift, that is a deliberate fork, not a shared refactor.
- Room codes are unauthenticated by design (public lobby). Cap creates/IP and cap open rooms so the box can't be flooded.
