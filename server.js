// server.js: serves the static page and the ranking API in one origin.
// Run: node server.js            →  http://localhost:8765
//      node server.js --ensure-table   →  creates the table `ranking` and exits.
// Credentials come from .env (gitignored); the browser never sees them.
const fs = require('fs');
const http = require('http');
const mysql = require('mysql2');
const dotenv = require('dotenv');
const cryptoMod = require('crypto');
// jose v6 calls globalThis.crypto (Web Crypto). Node 18 — the VPS — does NOT define
// that global (it was added in Node 19), so jwtVerify throws "crypto is not defined"
// and every token is rejected. Polyfill it from node:crypto's WebCrypto implementation
// (present since Node 17/18) so verification works on Node 18 too.
if (!globalThis.crypto) {
  try { globalThis.crypto = require('node:crypto').webcrypto; } catch (_) {}
}
// jose v6 is an ES Module: node 18 (the VPS) cannot require() it, so it is loaded
// lazily with dynamic import() — which works on every node >= 12 and on node 24 too.
let jose = null; // resolved on first use; `false` = unavailable
async function ensureJose() {
  if (jose) return jose;
  try { jose = await import('jose'); } catch (e) { jose = false; console.log('[auth] jose unavailable: ' + (e.code || e.message)); }
  return jose;
}

const env = dotenv.parse(fs.readFileSync(new URL('.env', `file://${process.cwd()}/`)));
const DB = {host: env.HOST, port: Number(env.PORT || 3306), user: env.USER, password: env.PASSWORD, database: env.DATABASE};
const TABLE = 'ranking';
const USERS_TABLE = 'google_users';
const PORT = Number(process.env.PORT || 8765);
const GAMES = ['alvos', 'si', 'arkanoid', 'si_mp'];

// ---- multiplayer: the room simulation lives HERE, not in the browser ----
// si-sim.js is CommonJS (require-able) and holds the whole co-op world. The server
// is the single source of truth: it steps every room every TICK ms and clients only
// POST input and GET a snapshot. No WebSocket, no determinism across devices.
const SiSim = require('./si-sim.js');
const TICK = 50;                 // 20 Hz fixed timestep
const ROOM_LIFE_MS = 30 * 60 * 1000;   // a room nobody touches for 30 min is gone
const MAX_ROOMS = 20;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I: codes get typed
const rooms = new Map();         // code -> {code, world, hostIp, lastActivity, started, conns}

// ---- Google OIDC: the client id is public, but it must match the token's aud ----
// Both can be overridden from the real environment (used by test-auth-token.js);
// .env stays the normal source of truth for production runs.
const GOOGLE_CLIENT_ID = String(process.env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID || '').trim();
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'https://oidc.net/https://accounts.google.com'];
const GOOGLE_JWKS_URL = String(process.env.JWKS_URL || env.JWKS_URL || '').trim() || 'https://www.googleapis.com/oauth2/v3/certs';
let jwks = null; // built on first use: a dead Google endpoint must not kill the server

// Returns the verified claims, or null when the token is forged/expired/mismatched.
async function verifyToken(idToken) {
  if (!GOOGLE_CLIENT_ID || typeof idToken !== 'string' || !idToken) return null;
  if (idToken.length > 4000 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(idToken)) return null;
  try {
    const j = await ensureJose();
    if (!j) return null;
    if (!jwks) jwks = j.createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));
    const {payload} = await j.jwtVerify(idToken, jwks, {
      issuer: GOOGLE_ISSUERS, audience: GOOGLE_CLIENT_ID, clockTolerance: 60,
    });
    if (!payload.sub) return null;
    return payload;
  } catch (e) {
    console.log('[auth] token rejected: ' + (e.code || e.message || '?'));
    return null;
  }
}

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
  const rows = await q('SELECT player_name, game, score, user_id FROM ' + TABLE + ' ORDER BY score DESC LIMIT 500', []);
  const seen = new Set(), out = [];
  for (const r of rows) {
    if (game !== 'all' && r.game !== game) continue;
    if (seen.has(r.player_name)) continue;
    seen.add(r.player_name);
    out.push({name: r.player_name, game: r.game, score: Number(r.score), uid: r.user_id == null ? null : Number(r.user_id)});
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
const lastCreate = new Map(); // ip → timestamp, one room per 10s
function tooFast(ip) {
  const now = Date.now(), prev = lastPost.get(ip);
  if (prev && now - prev < 5000) return true;
  lastPost.set(ip, now);
  if (lastPost.size > 5000) lastPost.clear();
  return false;
}

function tooFastCreate(ip) {
  const now = Date.now(), prev = lastCreate.get(ip);
  if (prev && now - prev < 10000) return true;
  lastCreate.set(ip, now);
  if (lastCreate.size > 5000) lastCreate.clear();
  return false;
}

function json(rq, obj, code) {
  const body = JSON.stringify(obj);
  rq.writeHead(code || 200, {'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*'});
  rq.end(body);
}

// ---- multiplayer engine ----
function newCode() {
  for (let tries = 0; tries < 40; tries++) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    if (!rooms.has(c)) return c;
  }
  return null;
}
function touch(w) { w.lastActivity = Date.now(); }
function createRoom(ip, mode) {
  if (rooms.size >= MAX_ROOMS) return null;
  const code = newCode();
  if (!code) return null;
  const world = SiSim.create(mode);
  const room = { code, world, hostIp: ip, lastActivity: Date.now(), started: 0, conns: new Map() };
  rooms.set(code, room);
  return room;
}
function findRoom(code) {
  const c = String(code == null ? '' : code).trim().toUpperCase();
  return rooms.get(c);
}
function lobbyList() {
  const out = [];
  for (const r of rooms.values()) {
    const w = r.world;
    if (w.status === 'over') continue;
    out.push({
      code: r.code,
      status: w.status,
      level: w.level,
      mode: w.mode,
      seats: w.players.length,
      players: w.players.map((p) => ({ name: p.name, lives: p.lives, score: p.score, alive: p.alive ? 1 : 0, offline: p.offline ? 1 : 0 })),
      age: Math.round((Date.now() - w.createdAt) / 1000),
    });
  }
  out.sort((a, b) => b.age - a.age);
  return out;
}
// One stepper for every room: a throwing step must never take down the ranking
// API, so each room is guarded separately and a broken room is dropped.
// Phase 6: the same heartbeat PUSHES the fresh snapshot to every WebSocket
// connected to the room, so clients never wait for a request round trip.
function closeConns(r) {
  if (!r.conns) return;
  for (const sock of r.conns.keys()) { try { sock.destroy(); } catch (_) {} }
  r.conns.clear();
}
setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) {
    if (now - r.world.lastActivity > ROOM_LIFE_MS) { closeConns(r); rooms.delete(code); continue; }
    if (r.world.status === 'live') {
      try { SiSim.step(r.world, TICK); } catch (e) {
        console.log('[mp] room ' + code + ' step failed: ' + (e.message || e) + ' -> dropped');
        closeConns(r); rooms.delete(code); continue;
      }
    }
    if (r.conns && r.conns.size) {
      touch(r.world); // a room with live sockets is alive, whatever the input
      let payload; // one snapshot per room per tick, shared by every socket
      for (const sock of r.conns.keys()) {
        try {
          if (payload === undefined) payload = JSON.stringify(SiSim.snapshot(r.world));
          wsSendText(sock, payload);
        } catch (e) { try { sock.destroy(); } catch (_) {} r.conns.delete(sock); }
      }
    }
  }
}, TICK);

// ---- Phase 6: WebSocket room transport (zero dependencies) ----
// HTTP polling (Phase 5) pays a full round trip per poll - measured 150 ms to 2 s
// from Brazil to this box - which is exactly the "controls respond late" problem.
// A WebSocket is ONE persistent connection: the server PUSHES a snapshot every
// tick and the client SENDS input fire-and-forget, so input lag collapses to the
// sim tick. Node 18 emits 'upgrade' natively and the framing below is plain RFC
// 645541 - the VPS has no `ws` package and must not need one.
const WSGUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function wsSendText(sock, str) {
  const p = Buffer.from(str, 'utf8');
  let head;
  if (p.length < 126) head = Buffer.from([0x81, p.length]);
  else if (p.length < 65536) head = Buffer.from([0x81, 126, p.length >> 8, p.length & 255]);
  else {
    head = Buffer.alloc(10);
    head[0] = 0x81; head[1] = 127;
    head.writeBigInt64BE(BigInt(p.length), 2);
  }
  sock.write(head);
  sock.write(p);
}

// Incremental frame reader for the client->server direction (browsers ALWAYS mask).
function makeWsParser(onMsg, onClose) {
  let buf = Buffer.alloc(0);
  return (chunk) => {
    buf = chunk ? Buffer.concat([buf, chunk]) : buf;
    for (;;) {
      if (buf.length < 2) return;
      const opcode = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      let mask = null;
      if (masked) { if (buf.length < off + 4) return; mask = buf.slice(off, off + 4); off += 4; }
      if (buf.length < off + len) return;
      let payload = buf.slice(off, off + len);
      if (masked) {
        const out = Buffer.alloc(len);
        for (let i = 0; i < len; i++) out[i] = payload[i] ^ mask[i & 3];
        payload = out;
      }
      buf = buf.slice(off + len);
      if (opcode === 1) onMsg(payload.toString('utf8'));
      else if (opcode === 8) { onClose(); return; }
      // ping(9)/pong(10)/unknown: ignore
    }
  };
}

function mpUpgrade(req, sock, head) {
  const amp = req.url.indexOf('?');
  const qs = {};
  if (amp >= 0) for (const p of req.url.slice(amp + 1).split('&')) if (p) { const [k, v] = p.split('='); qs[k] = decodeURIComponent(v || ''); }
  const room = findRoom(qs.code);
  const key = req.headers['sec-websocket-key'];
  if (!room || !key || !room.conns) {
    sock.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    try { sock.destroy(); } catch (_) {}
    return;
  }
  if (room.conns.size >= 4) { // one socket per seat, like the HTTP seats
    sock.write('HTTP/1.1 408 Conflict\r\nConnection: close\r\n\r\n');
    try { sock.destroy(); } catch (_) {}
    return;
  }
  const accept = cryptoMod.createHash('sha1').update(key + WSGUID).digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  const conn = { sock, seat: -1 };
  const feed = makeWsParser((msg) => {
    // Input arrives fire-and-forget: {"s":seat,"i":[mx,my,fire01]}. Nothing is
    // awaited - the snapshot push IS the ack - which is what kills the input lag.
    let d;
    try { d = JSON.parse(msg); } catch (_) { return; }
    if (!d) return;
    if (d.s != null) {
      const s = Number(d.s);
      if (Number.isInteger(s) && s >= 0 && s < room.world.players.length) conn.seat = s;
    }
    if (d.i && Number.isInteger(conn.seat) && conn.seat >= 0) {
      SiSim.applyInput(room.world, conn.seat, d.i[0], d.i[1], d.i[2]);
      touch(room.world);
    }
  }, () => {
    try { sock.destroy(); } catch (_) {}
    room.conns.delete(sock);
  });
  conn.seat = -1;
  room.conns.set(sock, conn);
  sock.on('error', () => room.conns.delete(sock));
  sock.on('close', () => room.conns.delete(sock));
  if (head && head.length) feed(head);
  sock.on('data', feed);
  // first snapshot right away so the client renders before its first poll would
  try { wsSendText(sock, JSON.stringify(SiSim.snapshot(room.world))); } catch (_) {}
}

function mpHandle(path, req, rq, body, qs) {
  if (path === '/api/mp/health') return json(rq, { ok: true, rooms: rooms.size, tick: TICK });

  if (path === '/api/mp/lobby') return json(rq, lobbyList());

  if (path === '/api/mp/create') {
    if (req.method !== 'POST') return json(rq, { error: 'use POST' }, 405);
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (tooFastCreate(ip)) return json(rq, { error: 'too fast' }, 429);
    const room = createRoom(ip, String(body.mode || ''));
    if (!room) return json(rq, { error: 'server full' }, 503);
    const seat = SiSim.addPlayer(room.world, cleanName(body.name));
    touch(room.world);
    json(rq, { ok: true, code: room.code, seat, snapshot: SiSim.snapshot(room.world) });
    return;
  }

  if (path === '/api/mp/join') {
    if (req.method !== 'POST') return json(rq, { error: 'use POST' }, 405);
    const room = findRoom(body.code);
    if (!room) return json(rq, { error: 'room not found' }, 404);
    const name = cleanName(body.name);
    for (const p of room.world.players) if (p.name === name) { // same name = same seat
      return json(rq, { ok: true, seat: p.seat, snapshot: SiSim.snapshot(room.world) });
    }
    const seat = SiSim.addPlayer(room.world, name);
    if (seat < 0) return json(rq, { error: 'room full' }, 409);
    touch(room.world);
    json(rq, { ok: true, seat, snapshot: SiSim.snapshot(room.world) });
    return;
  }

  if (path === '/api/mp/start') {
    const room = findRoom(body.code);
    if (!room) return json(rq, { error: 'room not found' }, 404);
    if (!room.world.players.length) return json(rq, { error: 'no players' }, 403);
    room.world.status = 'live';
    room.started = Date.now();
    touch(room.world);
    json(rq, { ok: true, snapshot: SiSim.snapshot(room.world) });
    return;
  }

  if (path === '/api/mp/input') {
    const room = findRoom(body.code);
    if (!room) return json(rq, { error: 'room not found' }, 404);
    const seat = Number(body.seat);
    if (!Number.isInteger(seat) || seat < 0 || seat >= room.world.players.length) return json(rq, { error: 'bad seat' }, 403);
    SiSim.applyInput(room.world, seat, body.mx, body.my, body.fire);
    touch(room.world);
    json(rq, { ok: true, t: room.world.tick });
    return;
  }

  if (path === '/api/mp/leave') {
    const room = findRoom(body.code);
    if (!room) return json(rq, { error: 'room not found' }, 404);
    const seat = Number(body.seat);
    const p = room.world.players[Number.isInteger(seat) ? seat : -1];
    if (!p) return json(rq, { error: 'bad seat' }, 403);
    p.offline = true; p.mx = 0; p.my = 0; p.fire = false;
    touch(room.world);
    json(rq, { ok: true });
    return;
  }

  if (path === '/api/mp/restart') {
    const room = findRoom(body.code);
    if (!room) return json(rq, { error: 'room not found' }, 404);
    room.world = SiSim.restart(room.world);
    touch(room.world);
    json(rq, { ok: true, snapshot: SiSim.snapshot(room.world) });
    return;
  }

  if (path === '/api/mp/state') {
    const room = findRoom(qs.code);
    if (!room) return json(rq, { error: 'room not found' }, 404);
    // The client can ride its input on this GET (?seat=&mx=&my=&fire=). A GET with no
    // body and no custom headers is a "simple" CORS request, so the browser never
    // fires an OPTIONS preflight — one round trip per poll instead of two. That is
    // what makes the match playable from Brazil on a server in France.
    if (qs.seat !== undefined && (qs.mx !== undefined || qs.my !== undefined || qs.fire !== undefined)) {
      const seat = Number(qs.seat);
      if (Number.isInteger(seat) && seat >= 0 && seat < room.world.players.length) {
        SiSim.applyInput(room.world, seat, qs.mx, qs.my, qs.fire !== undefined && qs.fire !== '0' && qs.fire !== '');
      }
    }
    touch(room.world);
    rq.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',   // a cached snapshot would freeze the match
    });
    rq.end(JSON.stringify(SiSim.snapshot(room.world)));
    return;
  }

  return json(rq, { error: 'unknown mp route' }, 404);
}

const STATIC = {'/': 'index.html', '/index.html': 'index.html', '/styles.css': 'styles.css', '/script.js': 'script.js', '/audio.js': 'audio.js', '/aventura-mobile.js': 'aventura-mobile.js', '/ranking.js': 'ranking.js', '/mp-client.js': 'mp-client.js'};
const TYPES = {'index.html': 'text/html; charset=utf-8', 'styles.css': 'text/css; charset=utf-8', 'script.js': 'text/javascript; charset=utf-8', 'audio.js': 'text/javascript; charset=utf-8', 'aventura-mobile.js': 'text/javascript; charset=utf-8', 'ranking.js': 'text/javascript; charset=utf-8', 'mp-client.js': 'text/javascript; charset=utf-8'};

function createTable() {
  const sql = fs.readFileSync(new URL('bootstrap.sql', `file://${process.cwd()}/`)).toString();
  return q(sql, []).then(() => console.log('[ok] tables ' + USERS_TABLE + ' + ' + TABLE + ' created'));
}
function tableExists(name) {
  return q('SHOW TABLES', []).then((rows) => rows.some((t) => String(Object.values(t)[0]).toLowerCase() === String(name).toLowerCase()));
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

  // ---- multiplayer: everything under /api/mp/ is served from the room map ----
  if (path.indexOf('/api/mp/') === 0) {
    if (path === '/api/mp/state') return mpHandle(path, req, rq, null, qs);
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 2000) req.destroy(); });
    req.on('end', () => {
      let body;
      try { body = JSON.parse(raw || '{}'); } catch (_) { return json(rq, { error: 'bad json' }, 400); }
      mpHandle(path, req, rq, body, qs);
    });
    return;
  }

  if (path === '/api/health') return json(rq, {ok: true, db: DB.database, table: TABLE, login: GOOGLE_CLIENT_ID ? 'google' : 'off'});

  // ---- POST /api/login {id_token}: the browser's One Tap credential, verified here ----
  if (path === '/api/login') {
    if (req.method !== 'POST') return json(rq, {error: 'use POST'}, 405);
    if (!GOOGLE_CLIENT_ID) return json(rq, {error: 'login disabled'}, 501);
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 6000) req.destroy(); });
    req.on('end', async () => {
      let body;
      try { body = JSON.parse(raw || '{}'); } catch (_) { return json(rq, {error: 'bad json'}, 400); }
      const claims = await verifyToken(body.id_token);
      if (!claims) return json(rq, {error: 'bad token'}, 401);
      const sub = String(claims.sub).slice(0, 255);
      const name = cleanName(claims.name).slice(0, 32);
      const email = String(claims.email_verified ? claims.email || '' : '').slice(0, 128);
      const picture = String(claims.picture || '').slice(0, 512);
      const hd = String(claims.hd || '').slice(0, 64);
      const locale = String(claims.locale || '').slice(0, 16);
      try {
        const rows = await q('SELECT id FROM ' + USERS_TABLE + ' WHERE google_sub = ?', [sub]);
        let uid;
        if (rows.length) {
          uid = Number(rows[0].id);
          await q('UPDATE ' + USERS_TABLE + ' SET name = ?, email = ?, picture = ?, hd = ?, locale = ?, last_login = NOW() WHERE google_sub = ?', [name, email, picture, hd, locale, sub]);
        } else {
          const ins = await q('INSERT INTO ' + USERS_TABLE + ' (google_sub, name, email, picture, hd, locale, last_login) VALUES (?, ?, ?, ?, ?, ?, NOW())', [sub, name, email, picture, hd, locale]);
          uid = Number(ins.insertId || ins.lastInsertRowid);
        }
        json(rq, {ok: true, uid, name, email, picture});
      } catch (e) { json(rq, {error: e.code}, 502); }
    });
    return;
  }

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
      // A score only reaches the DB when it carries a verified Google token: this
      // closes the old hole where any visitor could POST any name/any score.
      const claims = await verifyToken(body.token);
      if (!claims) return json(rq, {error: 'login required'}, 401);
      const sub = String(claims.sub).slice(0, 255);
      const gname = cleanName(claims.name);
      try {
        const ur = await q('SELECT id FROM ' + USERS_TABLE + ' WHERE google_sub = ?', [sub]);
        let uid;
        if (ur.length) uid = Number(ur[0].id);
        else {
          const ins = await q('INSERT INTO ' + USERS_TABLE + ' (google_sub, name, email, picture, hd, locale, last_login) VALUES (?, ?, ?, ?, ?, ?, NOW())',
            [sub, gname, String(claims.email_verified ? claims.email || '' : '').slice(0, 128), String(claims.picture || '').slice(0, 512), String(claims.hd || '').slice(0, 64), String(claims.locale || '').slice(0, 16)]);
          uid = Number(ins.insertId || ins.lastInsertRowid);
        }
        await q('INSERT INTO ' + TABLE + ' (player_name, game, score, user_id) VALUES (?, ?, ?, ?)', [gname, game, score, uid]);
        const rows = await board(game, 50);
        const rank = rows.findIndex(r => r.uid === uid || r.name === gname) + 1;
        json(rq, {ok: true, name: gname, game, score, rank: rank || null});
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
      const sql = fs.readFileSync(new URL('bootstrap.sql', `file://${process.cwd()}/`)).toString();
      // Split into statements on ';', drop comment-only lines, keep CREATE TABLE ones.
      const stmts = sql.split(';')
        .map((s) => s.split(/\r?\n/).filter((ln) => !/^\s*--/.test(ln)).join(' ').trim())
        .filter((s) => /^CREATE\s+TABLE\s+(\w+)/i.test(s));
      for (const s of stmts) {
        const name = s.replace(/^CREATE\s+TABLE\s+(\w+).*$/i, '$1');
        if (await tableExists(name)) { console.log('[ok] table ' + name + ' already exists'); continue; }
        await q(s, []);
        console.log('[ok] table ' + name + ' created');
      }
      // Reconcile an existing `ranking` to the new schema without recreating it
      // (never clobber live rows): widen the game ENUM and add the user_id FK.
      if (await tableExists(TABLE)) {
        const cols = await q('DESCRIBE ' + TABLE, []);
        const byName = {};
        for (const c of cols) byName[String(c.Field).toLowerCase()] = c;
        const gameCol = byName['game'];
        if (gameCol) {
          const type = String(gameCol.Type || gameCol.sql_type || '').toLowerCase();
          if (!type.includes('arkanoid')) {
            const enumVals = ["alvos", "si", "arkanoid", "si_mp"];
            const nn = String(gameCol.Null || '').toUpperCase() === 'NO' ? 'NOT NULL' : '';
            await q('ALTER TABLE ' + TABLE + " MODIFY game ENUM('" + enumVals.join("','") + "')" + (nn ? ' ' + nn : ''), []);
            console.log('[ok] ranking.game ENUM widened to include arkanoid');
          } else console.log('[ok] ranking.game ENUM already includes arkanoid');
        }
        if (!byName['user_id']) {
          await q('ALTER TABLE ' + TABLE + ' ADD user_id INT NULL', []);
          console.log('[ok] ranking.user_id added');
        } else console.log('[ok] ranking.user_id already present');
      }
    } catch (e) {
      console.log('[db] ' + e.code + ' ' + (e.msg || ''));
      process.exit(1);
    }
    process.exit(0);
  }
  const srv = http.createServer(handle);
  srv.on('upgrade', mpUpgrade); // WebSocket transport for /api/mp/ws (Phase 6)
  srv.listen(PORT);
  console.log('serving http://localhost:' + PORT + '  (db: ' + DB.database + '@' + DB.host + ')');
})();
