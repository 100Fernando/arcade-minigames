# 🔐 Plano: Google Identity (OpenID Connect) + users table

**Goal:** replace the free-text name gate with a **real Google login**, store a **stable user id** in the database, and persist the **available profile fields** (id, name, email, photo). Scores become attributed to a verified user (anti-cheat + no name collisions).

**Rule:** implement one phase at a time; update this file after each. Never break the 3 games.

**Status:** ✅ Phases A–D complete + **verified end-to-end by `test-auth-token.js` (9/9 PASS, re-run 2026-10-13)** — DB reconciled, browser One Tap wired, server JWKS verify works, `/api/score` 401s without a valid token, valid token links `ranking.user_id`. Login is **code-complete and proven**. **E.2 is the only blocker left and it is user-side** (Google Cloud Console: create the OAuth Client (Web) + set Authorized JavaScript origins). Everything around it is now scripted: **`deploy\phase4.ps1 <client-id>`** fills the id in all THREE places at once (`index.html` `data-client-id`, local `.env`, VPS `/opt/ranking-api/.env` + `pm2 restart` + proves `login: "google"`), and `deploy\phase4.ps1 -show` prints the current wiring. `deploy\vps-setclient.ps1` does the VPS half alone.

**Phase A result (verified on live DB):**
- New table **`google_users`** created: `id · google_sub varchar(255) UNIQUE · name varchar(32) · email varchar(128) · picture varchar(512) · hd varchar(64) · locale varchar(16) · created_at · last_login`.
- Existing password-based **`users` table left untouched** (decision: new separate table, so no risk to any other app).
- **`ranking` reconciled in place** (rows not clobbered): `game` ENUM widened to `('alvos','si','arkanoid')` + `user_id int NULL` added.
- `--ensure-table` is idempotent: creates missing tables, and ALTERs an existing `ranking` only when the ENUM lacks `arkanoid` / `user_id` is missing.

**Decisions (confirmed by user):**
- **Login mode = Optional**: games always playable; a score is only stored in the DB when it carries a **valid Google token**. Without login, the manual name gate still works (local record only, not uploaded).
- **Public board = Name only**: never display email or photo publicly. `picture`/`email` are stored in `users` but not rendered in the ranking.

---

## Reality check — what Google gives (and what it does NOT)

ID Token (JWT) claims from Google Sign-In (scopes `openid email`):

| Save | Claim | Type |
|------|-------|------|
| ✅ user id | `sub` | stable unique string (≤255) |
| ✅ name | `name` | display name |
| ✅ email | `email` + `email_verified` | only with `email` scope |
| ✅ photo | `picture` | **URL** (hotlink), not bytes |
| ✅ domain | `hd` | school/university only |
| ❌ phone | — | **not provided by Google OIDC** |
| ❌ birthday/gender/address | — | not in ID Token (People API restricted/deprecated) |

**Decision:** store `sub, name, email, picture, hd, locale`. Phone is out of scope — do not fake it.

**Privacy:** email + photo are personal data → show a consent line ("sign in to save your name/photo in the ranking"), store minimal data, never expose email in the public ranking (only `name`).

---

## Phase A — Database: users table + FK + ENUM fix

- [x] A.1 `bootstrap.sql`: widen `game ENUM('alvos','si')` → `ENUM('alvos','si','arkanoid')` (current bug: Arkanoid INSERT would fail).
- [x] A.2 New table `google_users` (renamed from `users` to avoid clobbering the existing password-based `users`):
      ```sql
      CREATE TABLE google_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        google_sub VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(32) NOT NULL, email VARCHAR(128),
        picture VARCHAR(512), hd VARCHAR(64), locale VARCHAR(16),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, last_login TIMESTAMP
      );
      ```
- [x] A.3 `ranking` gains `user_id INT NULL` FK; keeps `player_name` for display/back-compat. New inserts set `user_id`.
- [x] A.4 `server.js --ensure-table`: creates `google_users` if missing AND reconciles an existing `ranking` (widen ENUM + add `user_id`) idempotently, without clobbering live rows.

**Acceptance:** both tables exist; ENUM accepts `arkanoid`; `users` UNIQUE on `google_sub`.

---

## Phase B — Browser login (Google Identity Services, One Tap)

- [x] B.1 `index.html`: `.google-login` container (`id="googleLogin"`, `data-client-id=""`) inside the name gate; gsi/client is loaded by `script.js` only when a client id is set (so `file://` never tries).
- [x] B.2 `script.js`: `google.accounts.id.prompt(cb)` → `credential` (id_token JWT) kept in `window.googleCredential`.
- [x] B.3 `POST /api/login {id_token}` → on `{ok, uid, name, email, picture}` stores `window.googleUser` + token. **Server endpoint still missing (Phase C) → login currently rejected, manual name kept.**
- [x] B.4 `pcName()` returns the verified Google name (and `playerName` input is synced); otherwise the gate name.
- [x] B.5 Manual name gate stays the fallback: no client id, `file://`, gsi blocked, or `/api/login` unreachable → games play, name is local.
- [x] B.6 `CLIENT_ID` is public: it lives in `index.html` as `data-client-id`; `.env.example` documents `GOOGLE_CLIENT_ID` for the server check (Phase C).

**Acceptance:** One Tap shows; after sign-in, `window.pcName()` returns the Google name; login failure never blocks the games.

---

## Phase C — Server verifies the token (the security core)

- [x] C.1 Dep `jose` (^6.2.12) added to `package.json` — pure JS, verifies against Google JWKS. No native modules.
- [x] C.2 `POST /api/login`: `jose.createRemoteJWKSet('https://www.googleapis.com/oauth2/v3/certs')` + `jwtVerify` with `issuer ∈ {accounts.google.com, oidc.net/…}`, `aud == GOOGLE_CLIENT_ID`, `clockTolerance: 60`. Built lazily so a dead Google endpoint never kills the server.
- [x] C.3 On valid: `SELECT`/`INSERT`/`UPDATE google_users` by `google_sub` (updates `last_login`), returns `{ok, uid, name, email, picture}`.
- [x] C.4 `POST /api/score`: verifies `body.token` first → resolves `user_id` → `INSERT ranking (player_name, game, score, user_id)`. Forged/absent token → **401 `login required`** (verified live: `{"error":"login required"} HTTP 401`).
- [x] C.5 `board()` returns `name` + `uid` only — **no JOIN needed**: the verified Google name is written into `player_name` at insert time, so email/photo are never read for display. (Deviation from the plan's JOIN: simpler, and old manual rows keep their stored name.)
- [x] C.6 `.env.example` documents `GOOGLE_CLIENT_ID`; `.env` stays gitignored. `/api/health` reports `login: "off"|"google"` so the mode is visible.

**Acceptance (live, `login: off` because no client id configured):** forged token → 401; `/api/login` → 501 `login disabled`; ranking → 200 with `uid: null` for legacy rows. A **valid** token path is code-complete but untested until a real `GOOGLE_CLIENT_ID` exists (Phase E.2).

---

## Phase D — ranking.js + display

- [x] D.1 Ranking rows keep showing `name` (the verified Google name, written at insert time). `board()` also returns `uid` for internal use — never rendered. No email/photo in the public board.
- [x] D.2 ~~Avatar~~ — **decided: Name only**, photo stored in `google_users` but never rendered. `ranking.js` needed no change (it reads only `name`/`score`).

---

## Phase E — Playtest + commit

- [x] E.0 `test-auth-token.js` (added): mints a local RSA JWK + local JWKS, spawns the real `server.js` with `GOOGLE_CLIENT_ID`/`JWKS_URL` env overrides, and drives the **valid-token path end to end** — 8 checks PASS (forged→401, `/api/login`→uid, `/api/score`→`user_id` link, DB cleanup). Proves the code works without a real Google client. **Re-run 2026-10-13: 9/9 PASS** (fixture rows cleaned by `cleanup-test-rows.js` afterwards).
- [ ] E.1 Must run via `node server.js` at `http://localhost:8765` (Google login **won't work on `file://`**).
- [ ] **E.2 — THE ONLY BLOCKER (user-side, cannot be automated):** create a Google Cloud Console project → **OAuth Client (Web)** → copy `client_id`. The client MUST list these **Authorized JavaScript origins** (One Tap is origin-checked):
      ```
      https://100fernando.github.io
      https://ferramox.duckdns.org
      http://localhost:8765
      ```
      No "Authorized redirect URIs" are needed (One Tap / ID Token flow, no redirect).
- [x] E.2b **DONE 2026-10-13:** `deploy\phase4.ps1 <id>` ran — `data-client-id` in `index.html`, `GOOGLE_CLIENT_ID` in local `.env` + VPS `.env`, pm2 restarted, `/api/health` flipped `login: "off"` → **`login: "google"`** (upstream AND public).
- [x] **E.2c BUG FOUND + FIXED (was blocking One Tap for everyone):** `script.js` called `google.accounts.id.prompt()` **without `initialize()`** → GSI logged `Missing required parameter: client_id.` and One Tap never rendered. Fix: `window.google.accounts.id.initialize({client_id: clientId})` before `prompt()` (commit `56f83bb`). `node --check` clean.
- [x] E.2d **Client id validated as real + registered:** probing `/o/oauth2/v2/auth` with the id returns **`redirect_uri_mismatch`** (a *known* client), while a fabricated id returns **`invalid_client`**. So the id exists; only the origin list gates it.
- [x] E.2e **Origin check, live from the Pages tab:** after the fix the console no longer says `missing_client_id`; it now says **`Not signed in with the identity provider.`** = the Pages origin **is** authorized and Google accepted the client. (On localhost the same flow reported `Provider's accounts list is empty` + `FedCM get() rejects with NetworkError` — the browser profile has no Google account signed in, so no card can render.)
- [ ] E.3 Browser test with a **signed-in** browser profile: Pages → One Tap card → submit a score → DB row has `user_id` + `game='arkanoid'`.
- [ ] E.4 `node --check` all JS; `get_errors` clean; commit + push; set Status 🟢.

---

## File touch map

| File | Change |
|------|--------|
| `bootstrap.sql` | ENUM +`arkanoid`; new `users` table; `ranking.user_id` FK |
| `server.js` | `jose` dep; `/api/login` verify; `/api/score` requires token; `board()` JOIN users |
| `index.html` | GIS script + One Tap container |
| `script.js` | One Tap prompt → `credential` → `/api/login`; `pcName()` verified; `submitScore` sends token |
| `ranking.js` | (mostly unchanged) display name from verified identity |
| `.env` / `.env.example` | `GOOGLE_CLIENT_ID` |

## Risks / guards
- **Origin**: `file://` cannot do Google login — dev must use `http://localhost:8765`.
- **Login optional**: games must still run if Google is unavailable (offline demo, ad blockers). Keep the manual name fallback.
- **Never trust the browser's name**: server re-derives identity from the verified token, not from `body.name`.
- **Photo = URL**: hotlinked; if Google revokes the URL it can break — store the URL, optionally proxy later.
- **GDPR**: email/photo are personal — minimal storage + consent line; don't publish email.
