// server.js: serves the static page and the ranking API in one origin.
// Run: node server.js            →  http://localhost:8765
//      node server.js --ensure-table   →  creates the table `ranking` and exits.
// Credentials come from .env (gitignored); the browser never sees them.
const fs = require('fs');
const http = require('http');
const mysql = require('mysql2');
const dotenv = require('dotenv');

const env = dotenv.parse(fs.readFileSync(new URL('.env', `file://${process.cwd()}/`)));
const DB = {host: env.HOST, port: Number(env.PORT || 3306), user: env.USER, password: env.PASSWORD, database: env.DATABASE};
const TABLE = 'ranking';
const PORT = Number(process.env.PORT || 8765);
const GAMES = ['alvos', 'si', 'arkanoid'];

// ---- database: lazy, reconnects after any connection-level failure ----
// The remote host kills idle sockets (ECONNRESET), so a dead connection must
// never poison the server for good: drop it, and q() retries once on a fresh one.
let conn = null;
function db() {
  if (!conn) {
    const c = mysql.createConnection({...DB, connectTimeout: 8000});
    c.on('error', e => {
      if (conn !== c) return; // queued events from an already-discarded connection
      conn = null;
      console.log('[db] ' + (e.code || '?') + ' → reconnect on next request');
    });
    conn = c;
  }
  return conn;
}
function q1(sql, args) {
  const c = db();
  if (!c) return Promise.reject({code: 'DB_OFF', conn: true});
  return new Promise((ok, fail) => c.query(sql, args, (err, rows) => {
    if (!err) { ok(rows); return; }
    console.log('[db] query ' + (err.code || '?') + ' ' + (err.sqlMessage || err.message || ''));
    const connErr = !err.code || /ECONN|ENSOCKET|EPIPE|TERMINATED|closed state/i.test((err.code || '') + ' ' + (err.sqlMessage || err.message || ''));
    if (connErr && conn === c) { try { c.end(); } catch (_) {} conn = null; }
    fail({code: err.code, msg: err.message, conn: connErr});
  }));
}
function q(sql, args) {
  return q1(sql, args).catch(e => e.conn ? q1(sql, args) : Promise.reject(e));
}

// Best score per player, newest runs ignored. Filtering and deduping in JS keeps
// the SQL plain, so an old MySQL version is enough.
async function board(game, limit) {
  const rows = await q('SELECT player_name, game, score FROM ' + TABLE + ' ORDER BY score DESC LIMIT 500', []);
  const seen = new Set(), out = [];
  for (const r of rows) {
    if (game !== 'all' && r.game !== game) continue;
    if (seen.has(r.player_name)) continue;
    seen.add(r.player_name);
    out.push({name: r.player_name, game: r.game, score: Number(r.score)});
    if (out.length >= limit) break;
  }
  return out;
}

// ---- input validation: the API is public, so nothing is trusted ----
function cleanName(v) {
  let s = String(v == null ? '' : v).replace(/[^\p{L}\p{N} .,'_-]/gu, '').replace(/\s+/g, ' ').trim();
  return s.slice(0, 24) || 'Anônimo';
}
const lastPost = new Map(); // ip → timestamp, one insert per 5s
function tooFast(ip) {
  const now = Date.now(), prev = lastPost.get(ip);
  if (prev && now - prev < 5000) return true;
  lastPost.set(ip, now);
  if (lastPost.size > 5000) lastPost.clear();
  return false;
}

function json(rq, obj, code) {
  const body = JSON.stringify(obj);
  rq.writeHead(code || 200, {'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*'});
  rq.end(body);
}

const STATIC = {'/': 'index.html', '/index.html': 'index.html', '/styles.css': 'styles.css', '/script.js': 'script.js', '/audio.js': 'audio.js', '/aventura-mobile.js': 'aventura-mobile.js', '/ranking.js': 'ranking.js'};
const TYPES = {'index.html': 'text/html; charset=utf-8', 'styles.css': 'text/css; charset=utf-8', 'script.js': 'text/javascript; charset=utf-8', 'audio.js': 'text/javascript; charset=utf-8', 'aventura-mobile.js': 'text/javascript; charset=utf-8', 'ranking.js': 'text/javascript; charset=utf-8'};

function createTable() {
  const sql = fs.readFileSync(new URL('bootstrap.sql', `file://${process.cwd()}/`)).toString();
  return q(sql, []).then(() => console.log('[ok] table ' + TABLE + ' created'));
}

function handle(req, rq) {
  const path = req.url.split('?')[0];
  const qs = {};
  const amp = req.url.indexOf('?');
  if (amp >= 0) for (const p of req.url.slice(amp + 1).split('&')) if (p) { const [k, v] = p.split('='); qs[k] = decodeURIComponent(v || ''); }

  if (req.method === 'OPTIONS') { // preflight for the JSON POST
    rq.writeHead(204, {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type'});
    return rq.end();
  }

  if (path === '/api/health') return json(rq, {ok: true, db: DB.database, table: TABLE});

  if (path === '/api/ranking') {
    const game = GAMES.includes(qs.game) ? qs.game : 'all';
    const limit = Math.min(50, Math.max(1, Number(qs.limit || 10)));
    board(game, limit).then(rows => json(rq, rows), e => json(rq, {error: e.code}, 502));
    return;
  }

  if (path === '/api/score') {
    if (req.method !== 'POST') return json(rq, {error: 'use POST'}, 405);
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (tooFast(ip)) return json(rq, {error: 'too fast'}, 429);
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 2000) req.destroy(); });
    req.on('end', async () => {
      let body;
      try { body = JSON.parse(raw || '{}'); } catch (_) { return json(rq, {error: 'bad json'}, 400); }
      const name = cleanName(body.name);
      const game = GAMES.includes(body.game) ? body.game : null;
      const score = Number(body.score);
      if (!game || !Number.isInteger(score) || score < 0 || score > 1e9) return json(rq, {error: 'bad fields'}, 400);
      try {
        await q('INSERT INTO ' + TABLE + ' (player_name, game, score) VALUES (?, ?, ?)', [name, game, score]);
        const rows = await board(game, 50);
        const rank = rows.findIndex(r => r.name === name) + 1;
        json(rq, {ok: true, name, game, score, rank: rank || null});
      } catch (e) {
        json(rq, {error: e.code}, 502);
      }
    });
    return;
  }

  const file = STATIC[path];
  if (!file) return json(rq, {error: 'not found'}, 404);
  fs.readFile(file, (err, data) => {
    if (err) return json(rq, {error: 'file missing'}, 500);
    rq.writeHead(200, {'Content-Type': TYPES[file]});
    rq.end(data);
  });
}

(async () => {
  if (process.argv.includes('--ensure-table')) {
    try {
      const tables = await q('SHOW TABLES', []);
      const exists = tables.some(t => String(Object.values(t)[0]).toLowerCase() === TABLE);
      if (exists) console.log('[ok] table ' + TABLE + ' already exists');
      else await createTable();
    } catch (e) {
      console.log('[db] ' + e.code + ' ' + (e.msg || ''));
      process.exit(1);
    }
    process.exit(0);
  }
  http.createServer(handle).listen(PORT);
  console.log('serving http://localhost:' + PORT + '  (db: ' + DB.database + '@' + DB.host + ')');
})();
