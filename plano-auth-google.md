# 🔐 Plano: Google Identity (OpenID Connect) + users table

**Goal:** replace the free-text name gate with a **real Google login**, store a **stable user id** in the database, and persist the **available profile fields** (id, name, email, photo). Scores become attributed to a verified user (anti-cheat + no name collisions).

**Rule:** implement one phase at a time; update this file after each. Never break the 3 games.

**Status:** 🟢 Phase A complete (DB reconciled + verified) — Phases B-E pending.

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

- [ ] B.1 `index.html`: load `https://accounts.google.com/gsi/client` + a container for the One Tap prompt inside the name-gate area.
- [ ] B.2 `script.js`: call `google.accounts.id.prompt()`; on success callback receives `credential` (the **id_token JWT**).
- [ ] B.3 `POST /api/login {id_token}` → on `{ok, uid, name, email, picture}` store verified identity in a module var.
- [ ] B.4 `pcName()` returns the **verified** name (fallback to gate name if login skipped).
- [ ] B.5 Keep the manual name gate as a **fallback** (login optional): if Google not configured/offline, current behavior stays.
- [ ] B.6 `CLIENT_ID` is public (in HTML), not a secret.

**Acceptance:** One Tap shows; after sign-in, `window.pcName()` returns the Google name; login failure never blocks the games.

---

## Phase C — Server verifies the token (the security core)

- [ ] C.1 Add dep `jose` (pure JS, verifies JWT against Google JWKS). No native modules.
- [ ] C.2 `POST /api/login`: verify `id_token` signature via JWKS `https://www.googleapis.com/oauth2/v3/certs`, check `iss ∈ {https://accounts.google.com, oidc.net}` and `aud == GOOGLE_CLIENT_ID` and `exp`.
- [ ] C.3 On valid: `INSERT/UPDATE users` (by `google_sub`), return `{ok, uid, name, email, picture}`.
- [ ] C.4 `POST /api/score`: require a valid `id_token` in the body → verify → extract `sub` → resolve `user_id` → `INSERT ranking (user_id, game, score)`. Reject (401) if token invalid → **closes the current cheat hole**.
- [ ] C.5 `board()` JOINs `users` to show `name` (never email) in the public ranking.
- [ ] C.6 `.env`: add `GOOGLE_CLIENT_ID` (gitignored, like DB creds). `.env.example` documents it.

**Acceptance:** forged/absent token → score rejected; valid token → row linked to `user_id`; ranking shows display name only.

---

## Phase D — ranking.js + display

- [ ] D.1 Ranking rows keep showing `name` (from verified identity). No email/photo in public board.
- [ ] D.2 ~~Avatar~~ — **decided: Name only**, photo stored but never rendered.

---

## Phase E — Playtest + commit

- [ ] E.1 Must run via `node server.js` at `http://localhost:8765` (Google login **won't work on `file://`**).
- [ ] E.2 Create a Google Cloud Console project → OAuth Client (Web) → allowed origin `http://localhost:8765` → copy `client_id` to `.env`.
- [ ] E.3 Browser test: One Tap → login → submit a score → confirm DB row has `user_id` and `game='arkanoid'`.
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
