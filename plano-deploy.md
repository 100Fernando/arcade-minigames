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
  **Path mapping (important):** the frontend appends `/api/...` to the base, so the browser really asks `GET /ranking-api/api/ranking` and `POST /ranking-api/api/score`. nginx must therefore `proxy_pass http://127.0.0.1:8765/;` (bare `/` strips only the `/ranking-api/` prefix). Writing `proxy_pass .../api/` would produce `/api/api/score` → 404.
- **Keep same-origin fallback** so local `node server.js` (http://localhost:8765) still works unchanged.

---

## Phase 0 — Decisions + prerequisites  ✅ DONE (2026-10-12)

- [x] 0.1 Pages URL = **`https://100Fernando.github.io/arcade-minigames/`** (project page; repo already renamed `spaces-invaders-game` → `arcade-minigames`, owner `100Fernando`, `origin` updated).
- [x] 0.2 DNS verified: `nslookup ferramox.duckdns.org` → **`51.79.39.178`** (matches `HOST`/`SERVER_SSH` in `.env`). Nothing to change in the DuckDNS panel.
- [x] 0.3 VPS toolchain probed over SSH: **nginx/1.24.0 (Ubuntu)** · **node v18.19.1** · **npm 9.2.0** · **pm2 6.0.8**.
- [ ] 0.4 **certbot NOT installed** (`certbot: command not found`) and `/etc/letsencrypt/certificates` is empty → HTTPS does not exist yet: `https://ferramox.duckdns.org/` → `000` (TLS refused), `http://…/` → `200`.

**⚠ Found during 0.3 (changes Phase 3):** the domain root is **already taken** — `/etc/nginx/sites-enabled/` contains a single site named **`frontend`** serving another app ("Casamento Graziele & Fernando", static HTML + `/static/js/main.*.js`). Worse, its Express app owns the **whole `/api/*` namespace** (`GET /api/x` → `401 {"error":"Token não fornecido"}`). So Phase 3 must **not** replace that server block and must **not** use `/api/`: add a **`location /ranking-api/` proxy only**, leaving every other path of the wedding site intact.

**Acceptance:** met except 0.4 — certbot install is the only outstanding prerequisite (done in Phase 3.6 order: nginx proxy first, then cert).

---

## Phase 1 — Frontend split: absolute API base (code)  ✅ DONE (2026-10-12)

Introduce a single **API base** the frontend uses, defaulting to same-origin so local dev is untouched.

- [x] 1.1 `index.html`: `<meta id="apiBase" content="https://ferramox.duckdns.org/ranking-api">` in `<head>`, before the stylesheet link.
- [x] 1.2 `ranking.js`: `const API = …` computed once at the top of the IIFE — reads `#apiBase`, but returns `''` when `location.href` starts with `http(s)://localhost|127.0.0.1` (so local `node server.js` stays same-origin **even with the meta filled**). `postJson(API + '/api/score')`, `getJson(API + '/api/ranking?...')`.
- [x] 1.3 `script.js` (One Tap IIFE): `apiBase()` helper with the **same localhost rule**; login fetch is `apiBase() + '/api/login'`.
- [x] 1.4 3s timeouts + `getJson`/`postJson` guards untouched; the "Ranking unavailable" fallback still fires.

**Acceptance (verified 2026-10-12):** `node --check` clean on `ranking.js`/`script.js`/`server.js`, no lint errors. With `node server.js` on :8765 the page loads **live** boards (`🥥 FerramoX · 46040`, `🥦 Anônimo · 13150`) — the localhost rule keeps same-origin working. With the API unreachable all 4 boards show the fallback and **no console errors** (only the browser's own network log).

**⚠ Note:** the base is **not live yet** — `https://ferramox.duckdns.org/ranking-api/api/health` → `000` (no cert) and `http://…/ranking-api/api/health` → `200` but returns the **wedding page HTML** (the Express app's catch-all). `getJson` then fails on `JSON.parse` → `null` → the board shows "Ranking unavailable", so the frontend is already graceful **before** Phase 3 exists. Verified live from a `file://` origin: all 4 boards fall back, **zero console errors**.

---

## Phase 2 — GitHub Pages deploy (frontend only)  ✅ DONE (2026-10-12)

- [x] 2.1 `.gitignore` verified: `.env` ignored (line 14), `node_modules/` ignored, `auth-test.log` + `diff_alvos.txt` (stray diff artifact) ignored. `git ls-files` shows only `.env.example` (no secrets) and `server.js` — safe to publish.
- [x] 2.2 `server.js` stays in the repo as **backend source only**; Pages serves the static files and never runs it.
- [x] 2.3 Pushed: `9805c66..b41e059 main -> main`. Verified public: `https://raw.githubusercontent.com/100Fernando/arcade-minigames/main/index.html` → 200 and contains `<meta id="apiBase" content="https://ferramox.duckdns.org/ranking-api">`.
- [x] 2.4 **Pages enabled by the user** (Settings → Pages, "Deploy from a branch", **`main` / root `/`**, Enforce HTTPS on). Banner read: *"GitHub Pages source saved."*

**Note on the commit:** the uncommitted Arkanoid audio work (`audio.js` `window.akSfx` + phase soundtrack, `plano-arkanoid.md` 0.5 / 5.1–5.4) was **verified live first** (icon opens the section, `#akCanvas` + `#akScoreDisplay` HUD render, `window.akSfx` has 12 keys) and then committed together with Phase 1 — so the published frontend is the complete 3-game build, audio included.

**⏳ First build:** the Pages site takes a couple of minutes to compile after saving. `https://100fernando.github.io/arcade-minigames/` still returned **404** at the moment of writing — re-check before declaring it live (the raw-URL check above already proves the content is pushed).

---

## Phase 3 — Backend on VPS (nginx → node)  🟡 RUNNING (2026-10-12)

**Gotcha found on the first run (fixed):** `node server.js --ensure-table` died with `ERR_REQUIRE_ESM` — **jose v6 is an ES Module and node 18 (the VPS) cannot `require()` it** (local node is **v24**, where `require()` of ESM works, which is why it never failed before). Fix in `server.js`: `let jose = null` + `ensureJose()` doing `await import('jose')` lazily (`false` = unavailable → `verifyToken` returns `null`). Verified locally: `node --check` clean and **`test-auth-token.js` 8/8 PASS** (`login: "google"`, forged→401, `/api/login`→uid 3, `/api/score`→`user_id: 3`, DB rows linked).

**Second gotcha (test-side, not code):** running `node server.js` on :8765 in the background **before** `test-auth-token.js` makes the test's child server fail to bind the port → 6 false FAILs. Kill the background server first.

Everything is scripted — **run `deploy\run-vps-deploy.ps1`** from this repo root. It does exactly two commands, so the root password is typed **twice** (once for `scp`, once for `ssh`) and never through the model:

```powershell
deploy\run-vps-deploy.ps1                                   # interactive certbot (asks for email/consent)
CERTBOT_EMAIL=you@example.com deploy\run-vps-deploy.ps1     # fully non-interactive certbot
```

What `deploy/vps-setup.sh` does on the VPS (idempotent, `set -e`, restores the nginx backup if `nginx -t` rejects the edit):

1. **3.1/3.2** stage `server.js` + `bootstrap.sql` + `package.json` + `.env` into `/opt/ranking-api` (`chmod 600` on `.env`, then `shred -u` the staged copy in `/tmp`), `npm install dotenv mysql2 jose`.
2. **3.3** `node server.js --ensure-table` → reconciles `google_users` + `ranking`.
3. **3.4** `pm2 start server.js --name ranking-api` + `pm2 save`; curls `http://127.0.0.1:8765/api/health` directly.
4. **certbot first** (it needs nginx answering): installs `certbot` via apt (missing, found in 0.4), inserts a `location /.well-known/acme-challenge/` served from `/var/www/certbot` (the wedding app is proxied, so its own webroot cannot serve the challenge), `nginx -t` + restart, then `certbot certonly --webroot -w /var/www/certbot -d ferramox.duckdns.org`.
5. **3.5** inserts `location /ranking-api/ { proxy_pass http://127.0.0.1:8765/; ... }` **and** `listen 443 ssl` + cert paths into the **existing** `sites-enabled/frontend` block (never a competing block), forwarding `X-Forwarded-For` for `tooFast(ip)`. Prints `nginx -T | grep location` so any **regex** `location` that could win over our prefix is visible.

**Acceptance (script prints all four):**
- `curl -sk https://ferramox.duckdns.org/ranking-api/api/health` → `{"ok":true,"db":"estudo","table":"ranking","login":"off"}`
- `curl -s http://ferramox.duckdns.org/` → still the wedding page (**regression**)
- `curl -s -o /dev/null -w "%{http_code}" http://ferramox.duckdns.org/api/x` → still `401` from the wedding app (**regression**)
- `nginx -t` clean; on failure the script restores `frontend.bak2` and exits 1.

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
- [ ] 5.3 **Rate limit:** nginx must forward `X-Forwarded-For` so `tooFast(ip)` sees the real client, not the VPS socket (`server.js:175` reads `req.headers['x-forwarded-for'] || req.socket.remoteAddress`).
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
| `deploy/nginx-api.conf` | **new**: the ready-to-paste nginx `location` block for 3.5 (reference copy) |
| `deploy/vps-setup.sh` | **new**: the whole Phase 3 as one idempotent VPS script (3.1→3.6 + regressions) |
| `deploy/run-vps-deploy.ps1` | **new**: Windows entry point — 1 `scp` + 1 `ssh`, password typed twice |

**Reminder:** the API bridge must stay lazy/graceful — if the VPS is down, the Pages frontend still plays and keeps local records.
