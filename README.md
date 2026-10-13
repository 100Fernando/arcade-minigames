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

### Multiplayer (Space Invaders co-op, up to 4 players across devices)

The simulation lives **in the server** (`si-sim.js`, stepped every 50 ms = 20 Hz). Clients only send input and
read a snapshot — no WebSockets, no WebRTC, no extra nginx location (everything rides the existing
`/ranking-api/` proxy).

| Route | Effect |
|-------|--------|
| `GET /api/mp/health` | `{ok, rooms, tick}` |
| `GET /api/mp/lobby` | open matches: `[{code, level, seats, status, players}]` |
| `POST /api/mp/create` body `{name,mode}` | new room → `{ok, code, seat, snapshot}` (1 per 10 s per IP) |
| `POST /api/mp/join` body `{code,name}` | take a seat (same name = same seat), `409` when full |
| `POST /api/mp/start` body `{code}` | flip the room to `live` |
| `POST /api/mp/input` body `{code,seat,mx,my,fire}` | `mx,my ∈ [-1,1]` — analog, so a phone stick works |
| `POST /api/mp/leave` body `{code,seat}` | freeze that ship |
| `POST /api/mp/restart` body `{code}` | restart the whole room |
| `GET /api/mp/state?code=XXXX` | compact snapshot (`Cache-Control: no-store`) |

Rooms live in memory (Map + 30 min TTL, max 20). The match ends only when **every** seat runs out of lives —
there is no friendly fire and no split-screen/local play. Scores go to the ranking as `game:"si_mp"`.

The page (`ranking.js`) posts the score at every game over / victory and renders the boards; if the server is down it shows "Ranking unavailable" and the local records (`localStorage`) still work.

## Security

- `.env` is gitignored — the browser never sees the credentials; only `server.js` (Node) talks to the database.
- ⚠️ `SERVER_SSH`/`USER_SSH`/`PASSWORD_SSH` in `.env` are **not used** by this project. Recommend removing them from the file or rotating them, since they are plain-text credentials.
- The API is public by nature: inputs are validated (name ≤ 24 chars, score `0..1e9`, game whitelist) and inserts are rate-limited to one per 5s per IP.
