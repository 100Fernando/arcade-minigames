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

## Phase 3 — Backend on VPS (nginx → node)  ✅ DONE (2026-10-13)

**Gotcha found on the first run (fixed):** `node server.js --ensure-table` died with `ERR_REQUIRE_ESM` — **jose v6 is an ES Module and node 18 (the VPS) cannot `require()` it** (local node is **v24**, where `require()` of ESM works, which is why it never failed before). Fix in `server.js`: `let jose = null` + `ensureJose()` doing `await import('jose')` lazily (`false` = unavailable → `verifyToken` returns `null`). Verified locally: `node --check` clean and **`test-auth-token.js` 8/8 PASS** (`login: "google"`, forged→401, `/api/login`→uid 3, `/api/score`→`user_id: 3`, DB rows linked).

**Second gotcha (test-side, not code):** running `node server.js` on :8765 in the background **before** `test-auth-token.js` makes the test's child server fail to bind the port → 6 false FAILs. Kill the background server first.

Everything is scripted — **run `deploy\run-vps-deploy.ps1`** from this repo root. It does exactly two commands, so the root password is typed **twice** (once for `scp`, once for `ssh`) and never through the model:

```powershell
deploy\run-vps-deploy.ps1                                   # runs deploy/vps-setup.sh (first attempt)
CERTBOT_EMAIL=you@example.com deploy\run-vps-deploy.ps1     # fully non-interactive certbot
```

**Run 1 (2026-10-12) — partial, then fixed by `deploy/vps-fix.sh`:**
- ✅ 3.1/3.2 staged + `npm install` (15 pkgs, 0 vulns) · ✅ 3.3 `--ensure-table` (all four checks already satisfied) · ✅ 3.4 `pm2 start ranking-api` online (the wedding app is `casamento-backend`, also on pm2) · ✅ certbot installed via apt (2.9.0).
- ❌ **"NODE DOWN"**: false alarm — the health curl raced `pm2 start` (no sleep). Fixed with `sleep 3`.
- ❌ **certbot webroot 404**: `awk` inserted the ACME location after the **first** `server_name` in `sites-enabled/frontend`, which is **not** the ferramox block (nginx also warned `conflicting server name "_" on 0.0.0.0:80`). So the challenge file was served by the wrong block → ACME 404.
- Fix in `deploy/vps-fix.sh`: restore the pristine config from `frontend.bak` (saved by run 1), then **`certbot --nginx`** (the plugin finds and edits the block that serves the domain, adding challenge + HTTPS itself); manual webroot fallback now matches the **domain** in `server_name`, not the first one. The `/ranking-api/` proxy insert likewise matches `index($0, dom)`.

**Run 2 (2026-10-12) — `deploy/vps-fix.sh` (certbot --nginx):** reached node/pm2 state (ranking-api online, error log empty) and ran `certbot --nginx`. **But** its first step `cp "$CONF.bak" "$CONF"` restored the **pre-certbot** config, which **undid HTTPS** — see the `nginx -T` dump below: no loaded file has `listen 443`. So HTTPS is currently **off** again.

**Run 3/4 (2026-10-12) — `vps-fix3.sh` / `vps-fix4.sh`: both FATAL'd** ("no file has `listen 443`"). `vps-fix3` used `grep -rl` which **skips the `sites-enabled` symlinks**; `vps-fix4` used `nginx -T` (correct) but found no `listen 443` because HTTPS was reverted in run 2.

**`nginx -T` dump (the ground truth, run 4):**
- `/etc/nginx/sites-enabled/frontend` → `server_name _;` (catch-all) + `location /.well-known/acme-challenge/` + `location /` + `location /api/` (→ `proxy_pass http://localhost:3001` = wedding backend). **No `listen 443`.**
- `frontend.bak` and `frontend.bak6` are ALSO loaded as sites (my `cp "$CONF" "$CONF.bak"` wrote backups **inside** `sites-enabled/`) → duplicate catch-all `server_name _` blocks → the `conflicting server_name "_"` warning. **These backups must be removed.**

**⏸ END OF DAY 2026-10-12 — RESUME HERE (VPS nginx is in a messy, half-broken state):**
1. **Delete the backup pollution:** `rm /etc/nginx/sites-enabled/frontend.bak*` (they are loaded as duplicate sites). Keep only `frontend`.
2. **Re-issue HTTPS:** `certbot --nginx -d ferramox.duckdns.org --non-interactive --agree-tos --email fernando-klj@hotmail.com` (cert may already exist in `/etc/letsencrypt`; `--nginx` will add `listen 443 ssl` to the `frontend` block).
3. **Insert the proxy into `frontend`** (the catch-all IS the block that serves the domain — `server_name _` matches every host, and it's the only site). Use `location ^~ /ranking-api/ { proxy_pass http://127.0.0.1:8765/; ... }` — `^~` so no regex location can shadow it; bare `/` so `/ranking-api/api/health` → `:8765/api/health`. Do NOT match on the domain in `server_name` (it's `_`).
4. `nginx -t` → `systemctl restart nginx` → verify the 4 points (health JSON over HTTPS, ranking board, wedding root 200, wedding `/api/x` 401).

### ✅ Closed 2026-10-13 — fully autonomous, ZERO password prompts

SSH is now **key-only**: `~/.ssh/config` has `Host ferramox-vps 51.79.39.178` → `User root`,
`IdentityFile ~/.ssh/id_vps_ferramox` (ed25519, **no passphrase**), `PasswordAuthentication no`,
`BatchMode yes`. The one-time `deploy\vps-keypair.ps1` bootstrap (one manual password, typed by the
user in the terminal) installed the pubkey in `/root/.ssh/authorized_keys`. From then on:

- `deploy\vps.ps1 "nginx -t; pm2 list"` → run any VPS command (never prompts; fails fast on auth loss)
- `deploy\vps.ps1 -upload vps-ssl.sh` → scp a `deploy\` script to `/tmp`, strip CRLF, `chmod +x`, run it
- `deploy\run-vps-deploy.ps1 [script]` → same, using the `ferramox-vps` alias

The old `vps-fix.sh / vps-fix2..4.sh` chain is **superseded** — this run replaced it. What actually happened:

1. **Backup pollution removed:** `rm /etc/nginx/sites-enabled/frontend.bak*` → only `frontend` is loaded,
   so the `conflicting server_name "_"` warning is gone. Every backup this run takes goes to **`/tmp` only**.
2. **certbot had no nginx plugin** (`Discovered plugins: manual,null,standalone,webroot`) → `--nginx`
   silently did nothing. Fixed with `apt-get install -y python3-certbot-nginx`. ACME then served 200
   (`location /.well-known/acme-challenge/ { alias /var/www/certbot/; }` was already in the block).
3. **`certbot --nginx -d ferramox.duckdns.org --non-interactive --agree-tos --email fernando-klj@hotmail.com`**
   → certificate **issued** (ECDSA, valid 89 days, `/etc/letsencrypt/live/ferramox.duckdns.org/`, renewal
   cron installed). Its **installer** then refused: *"Could not automatically find a matching server block …
   Set the `server_name` directive"* — because the block is the catch-all `server_name _`. Net effect:
   **cert exists, but no `listen 443`**.
4. **`deploy\vps-ssl.sh` finished it by hand, inside the SAME `frontend` block** (idempotent, `nginx -t`
   guard + restore-on-failure, backups in `/tmp`): `listen [::]:443 ssl;` + `listen 443 ssl;` +
   `ssl_certificate`/`ssl_certificate_key` → `/etc/letsencrypt/live/<dom>/fullchain.pem` and `privkey.pem`
   (the earlier guess `certificates/<dom>.pem` does **not** exist and made nginx `emerg`), then
   `location ^~ /ranking-api/ { proxy_pass http://127.0.0.1:8765/; … }` right after `server_name`.
   The wedding `location /` and `location /api/` → `:3001` are **byte-identical** — both apps serve
   off one block, which is exactly why the API lives under a separate `^~` prefix.

**Acceptance — all green, checked from the VPS *and* from Windows:**

| check | result |
|---|---|
| `https://ferramox.duckdns.org/ranking-api/api/health` | **200** `{"ok":true,"db":"estudo","table":"ranking","login":"off"}` |
| `https://…/ranking-api/api/ranking?game=alvos&limit=3` | **200** `[{"name":"FerramoX",…29700},{"name":"Anônimo",…13150}]` |
| `http://ferramox.duckdns.org/` (wedding) | **200** `<!doctype html>…` |
| `https://ferramox.duckdns.org/` (wedding, new) | **200** |
| `http://ferramox.duckdns.org/api/x` (wedding Express) | **401** `{"error":"Token não fornecido"}` |
| CORS preflight from Pages origin | **204** + `Access-Control-Allow-Origin: *`, `GET,POST,OPTIONS`, `Content-Type` |
| Pages | `https://100fernando.github.io/arcade-minigames/` → **200** |
| pm2 | `casamento-backend` online **and** `ranking-api` online |

**⚠ GOTCHA (certbot + catch-all):** with `server_name _` the certbot nginx **installer** can never edit
this block, so HTTPS must be added by hand after `certbot --nginx` issues the cert. Re-running certbot
later re-issues but still won't install; `deploy\vps-ssl.sh` is idempotent and adds nothing if `listen 443`
is present. On renewal the `live/` symlinks update themselves — no config edit needed.

**What is GREEN as of 2026-10-13 (do not redo):** the whole of Phase 3 — HTTPS + `/ranking-api/` proxy +
both wedding regressions + CORS + Pages live. `ranking-api` and `casamento-backend` both online on pm2,
served off the **same** nginx block (hence the separate `location ^~` prefix). SSH is key-only, so the
assistant can drive the VPS with no user input. **Only Phase 4 remains** (Google login wiring — needs
user-side Google Cloud Console work, cannot be automated).

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

## Phase 4 — Google login wiring (optional path)  🟡 BLOCKED on one user-side step (2026-10-13)

- [x] 4.0 **Code side is 100% done and proven**: `test-auth-token.js` **9/9 PASS** (re-run 2026-10-13) —
      forged token → 401, `/api/login` → `uid`, `/api/score` → row with `user_id`, `google_users` row created.
      Fixture rows cleaned with `cleanup-test-rows.js`.
- [ ] **4.1 Google Cloud Console — THE ONLY BLOCKER, cannot be automated** (the browser is not signed in,
      and signing in / creating a project needs the user). Create project → **OAuth Client (Web)** →
      Authorized JavaScript origins **must** include all three:
      ```
      https://100fernando.github.io     # Pages (One Tap origin check)
      https://ferramox.duckdns.org      # the API origin the page also talks to
      http://localhost:8765             # local dev
      ```
      No redirect URIs needed (ID-Token / One Tap flow).
- [ ] 4.2 **One command does all the wiring** once the id exists:
      `deploy\phase4.ps1 <client-id>` → sets `data-client-id` in `index.html`, `GOOGLE_CLIENT_ID` in
      local `.env` **and** `/opt/ranking-api/.env` on the VPS, `pm2 restart ranking-api`, then prints
      `/api/health` which must flip `login: "off"` → `login: "google"`. Add `-push` to commit+push
      `index.html` so Pages rebuilds. `deploy\phase4.ps1 -show` prints the current wiring state.
      (`deploy\vps-setclient.ps1 <id>` = VPS half only; `-clear` = disable login again.)
- [ ] 4.3 Live check: open the Pages URL → One Tap → submit a score → DB row has `user_id` + `game='arkanoid'`.

**Acceptance:** One Tap signs in from Pages; `/api/score` with a valid token stores `user_id`; forged token → 401.
**Note:** the client id is **public by design** (Google ships it in HTML), so it is safe in `index.html`/git —
but the **server must still verify `aud`**, which it does (`server.js:42`).

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
