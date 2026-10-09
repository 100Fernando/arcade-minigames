# Hello World — Minigames + Ranking

🎯 Jogo de Alvos and 👾 Space Invaders, with a ranking (global + per game) stored in the MySQL database described in `.env`.

## How to run

```bash
node server.js            # serves the page AND the API on one origin
# open http://localhost:8765
```

Requirements: `node_modules` (`dotenv`, `mysql2`) and a `.env` with the database keys — copy `.env.example` and fill it in.

The table `ranking` is created automatically by `node server.js --ensure-table` (source of truth: `bootstrap.sql`).

## API (same origin, no CORS)

| Route | Effect |
|-------|--------|
| `GET /api/health` | `{ok, db, table}` |
| `GET /api/ranking?game=all\|alvos\|si&limit=10` | best score per player |
| `POST /api/score` body `{"name","game","score"}` | inserts, returns `{ok, rank}` |

The page (`ranking.js`) posts the score at every game over / victory and renders the boards; if the server is down it shows "Ranking unavailable" and the local records (`localStorage`) still work.

## Security

- `.env` is gitignored — the browser never sees the credentials; only `server.js` (Node) talks to the database.
- ⚠️ `SERVER_SSH`/`USER_SSH`/`PASSWORD_SSH` in `.env` are **not used** by this project. Recommend removing them from the file or rotating them, since they are plain-text credentials.
- The API is public by nature: inputs are validated (name ≤ 24 chars, score `0..1e9`, game whitelist) and inserts are rate-limited to one per 5s per IP.
