# 🚀 Plano: Deploy — Frontend on GitHub Pages + Backend on VPS (nginx)

**Goal:** serve the static frontend (3 games + ranking UI) from **GitHub Pages**, and keep the **ranking API + Google-token verification + MySQL** on the **VPS** (`51.79.39.178`) behind **nginx** on the subdomain `ferramox.duckdns.org` (already in `.env`).

**Rule:** implement one phase at a time; update this file after each. Never break the 3 games. The frontend must keep working with the API **down** (shows "Ranking unavailable", records stay in `localStorage`).

**Key facts (verified):**
- Frontend is 100% static: `index.html`, `styles.css`, `script.js`, `audio.js`, `ranking.js`, `aventura-mobile.js`.
- Backend = `server.js` only: `/api/health`, `/api/ranking`, `/api/score`, `/api/login` (MySQL + `jose` JWKS verify). Credentials from `.env` (gitignored).
- `server.js` already sends `Access-Control-Allow-Origin: *` + answers `OPTIONS` preflight with `Access-Control-Allow-Headers: Content-Type` → **cross-origin fetch from Pages → VPS works out of the box**.
- **Problem:** `ranking.js` and `script.js` use **same-origin relative** URLs (`/api/...`). On Pages these resolve to `https://<user>.github.io/api/...` → 404. Must become an **absolute API base**.
- **HTTPS is mandatory** on the VPS: Pages is HTTPS, so the browser blocks "mixed content" against a plain-HTTP API. DuckDNS → free cert via certbot.

**Decisions (to confirm):**
- **Pages type:** project page → `https://100Fernando.github.io/arcade-minigames/` (repo renamed to `arcade-minigames`, owner `100Fernando`). Confirm before Phase 2.
- **API base:** **`https://ferramox.duckdns.org/ranking-api`** — chosen because the domain's whole `/api/*` namespace is **already owned by another Express app** (see 0.3 note): `GET /api/x` → `401 {"error":"Token não fornecido"}` + `X-Powered-By: Express`. A path prefix (`/ranking-api`) is collision-free and keeps ONE certbot cert. (A DuckDNS subdomain `api.ferramox…` would be equally safe but needs an extra A record + a second cert.)
- **Keep same-origin fallback** so local `node server.js` (http://localhost:8765) still works unchanged.

---

## Phase 0 — Decisions + prerequisites  ✅ DONE (2026-10-12)

- [x] 0.1 Pages URL = **`https://100Fernando.github.io/arcade-minigames/`** (project page; repo already renamed `spaces-invaders-game` → `arcade-minigames`, owner `100Fernando`, `origin` updated).
- [x] 0.2 DNS verified: `nslookup ferramox.duckdns.org` → **`51.79.39.178`** (matches `HOST`/`SERVER_SSH` in `.env`). Nothing to change in the DuckDNS panel.
- [x] 0.3 VPS toolchain probed over SSH: **nginx/1.24.0 (Ubuntu)** · **node v18.19.1** · **npm 9.2.0** · **pm2 6.0.8**.
- [ ] 0.4 **certbot NOT installed** (`certbot: command not found`) and `/etc/letsencrypt/certificates` is empty → HTTPS does not exist yet: `https://ferramox.duckdns.org/` → `000` (TLS refused), `http://…/` → `200`.

**⚠ Found during 0.3 (changes Phase 3):** the domain root is **already taken** — `/etc/nginx/sites-enabled/` contains a single site named **`frontend`** serving another app ("Casamento Graziele & Fernando", static HTML + `/static/js/main.*.js`). So Phase 3 must **not** replace that server block: add a **`location /api/` proxy only**, leaving every other path of the wedding site intact.

**Acceptance:** met except 0.4 — certbot install is the only outstanding prerequisite (done in Phase 3.6 order: nginx proxy first, then cert).

---

## Phase 1 — Frontend split: absolute API base (code)  ✅ DONE (2026-10-12)

Introduce a single **API base** the frontend uses, defaulting to same-origin so local dev is untouched.

- [x] 1.1 `index.html`: `<meta id="apiBase" content="https://ferramox.duckdns.org/ranking-api">` in `<head>`, before the stylesheet link.
- [x] 1.2 `ranking.js`: `const API = …` computed once at the top of the IIFE — reads `#apiBase`, but returns `''` when `location.href` starts with `http(s)://localhost|127.0.0.1` (so local `node server.js` stays same-origin **even with the meta filled**). `postJson(API + '/api/score')`, `getJson(API + '/api/ranking?...')`.
- [x] 1.3 `script.js` (One Tap IIFE): `apiBase()` helper with the **same localhost rule**; login fetch is `apiBase() + '/api/login'`.
- [x] 1.4 3s timeouts + `getJson`/`postJson` guards untouched; the "Ranking unavailable" fallback still fires.

**Acceptance (verified 2026-10-12):** `node --check` clean on `ranking.js`/`script.js`/`server.js`, no lint errors. With `node server.js` on :8765 the page loads **live** boards (`🥥 FerramoX · 46040`, `🥦 Anônimo · 13150`) — the localhost rule keeps same-origin working. With the API unreachable all 4 boards show the fallback and **no console errors** (only the browser's own network log).

**⚠ Note:** the base is **not live yet** — `https://ferramox.duckdns.org/ranking-api/health` 404s until Phase 3 adds the nginx proxy. Until then the Pages frontend shows "Ranking unavailable" (graceful, by design).

---

## Phase 2 — GitHub Pages deploy (frontend only)

- [ ] 2.1 Ensure `.gitignore` excludes `.env`, `node_modules/`, and any secrets (verify before pushing).
- [ ] 2.2 Do **not** rely on `server.js` on Pages (it's the backend). Pages just serves the static files.
- [ ] 2.3 Enable Pages: push to `main`, set Pages source to **branch `main` / root `/`** (index.html is at root). No `/docs` needed.
- [ ] 2.4 Confirm the live Pages URL loads the 3 games (audio included) with the API base pointing at the VPS.

**Acceptance:** `https://100Fernando.github.io/arcade-minigames/` opens, games playable, ranking block shows either live board or the "unavailable" fallback.

---

## Phase 3 — Backend on VPS (nginx → node)

- [ ] 3.1 Copy `server.js`, `bootstrap.sql`, `package.json`, `node_modules` (or `npm install dotenv mysql2 jose`) to the VPS.
- [ ] 3.2 Create a VPS-only `.env` (same keys as local `.env`); keep it out of any public repo.
- [ ] 3.3 Run `node server.js --ensure-table` on the VPS to create/reconcile `google_users` + `ranking`.
- [ ] 3.4 Keep node alive: `pm2 start server.js --name ranking-api` (or a `systemd` unit). Node listens on `127.0.0.1:8765`.
- [ ] 3.5 nginx: edit the **EXISTING** `sites-enabled/frontend` server block (do NOT create a competing block for the same `server_name`) and add, **before** its `location /api/`:
  ```nginx
  location /ranking-api/ {
      proxy_pass http://127.0.0.1:8765/api/;   # /ranking-api/health -> /api/health
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; # tooFast(ip) needs the real client
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_set_header X-Real-IP $remote_addr;
  }
  ```
  Everything else (the wedding site, incl. its own `/api/*`) stays untouched.
- [ ] 3.6 certbot (DuckDNS): **install it first** (`apt-get install certbot` — found missing in 0.4), then issue a cert for `ferramox.duckdns.org` → nginx serves HTTPS. Node must already listen + the proxy must exist (do 3.5 before 3.6, see 5.4).

**Acceptance:** `curl https://ferramox.duckdns.org/ranking-api/health` → `{"ok":true,...}` **and** `curl http://ferramox.duckdns.org/` still returns the wedding page (regression check).

---

## Phase 4 — Google login wiring (optional path)

- [ ] 4.1 Google Cloud Console: add **authorized origins** = Pages origin (`https://100Fernando.github.io`) **and** API origin (`https://ferramox.duckdns.org`).
- [ ] 4.2 Fill the SAME `client_id` in BOTH `data-client-id` in `index.html` AND `GOOGLE_CLIENT_ID` in the VPS `.env` (server verifies `aud`).
- [ ] 4.3 Re-run `test-auth-token.js` (8/8) and a live One-Tap check from the Pages origin.

**Acceptance:** One Tap signs in from Pages; `/api/score` with a valid token stores `user_id`; forged token → 401.

---

## Phase 5 — Gotchas / verification

- [ ] 5.1 **Mixed content:** Pages is HTTPS → API MUST be HTTPS (certbot done in 3.6).
- [ ] 5.2 **CORS:** already `*` in `server.js` — no change needed (fetch sends no cookies).
- [ ] 5.3 **Rate limit:** nginx must forward `X-Forwarded-For` so `tooFast(ip)` sees the real client, not the VPS socket.
- [ ] 5.4 **DuckDNS SSL:** certbot needs nginx listening first (do 3.5 before 3.6), or use `--certonly --webroot`.
- [ ] 5.5 Final end-to-end: open Pages → play a game → score appears on the VPS board.

---

## Files touched

| File | Change |
|------|--------|
| `index.html` | `<meta id="apiBase">` (absolute base) + fill `data-client-id` |
| `ranking.js` | absolute API base for `/api/score` + `/api/ranking` |
| `script.js` | absolute API base for `/api/login` (One Tap) |
| VPS `server.js` | unchanged (already CORS + OPTIONS) |
| VPS nginx | new: `location /ranking-api/` proxy → node (added to the existing `frontend` block), HTTPS via certbot |

**Reminder:** the API bridge must stay lazy/graceful — if the VPS is down, the Pages frontend still plays and keeps local records.
