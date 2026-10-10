// test-auth-token.js: exercises the VALID-token path of the auth bridge end to end.
//
// Google cannot be reached from here (One Tap needs a browser + a real GOOGLE_CLIENT_ID),
// so the script mints its OWN signed JWT with a local RSA key and serves that key from a
// local JWKS — exactly the shape server.js verifies. It then starts the real server.js
// (GOOGLE_CLIENT_ID + JWKS_URL overridden via env, .env untouched) and drives:
//   POST /api/login {id_token}  -> expect {ok, uid, name, email, picture}
//   POST /api/score {token}     -> expect {ok, rank} and a DB row with user_id
//   forged token                -> expect 401
// Finally it deletes the fixture rows it created (google_users + ranking).
//
// Run: node test-auth-token.js
const fs = require('fs');
const cp = require('child_process');
const http = require('http');
const dotenv = require('dotenv');
const mysql = require('mysql2');
const jose = require('jose');

const env = dotenv.parse(fs.readFileSync(new URL('.env', `file://${process.cwd()}/`)));
const SERVER_PORT = Number(process.env.PORT || 8765);
const JWKS_PORT = 8799;
const CLIENT_ID = 'fixture-client-id';
const TABLE = 'ranking';
const USERS_TABLE = 'google_users';
const FIXTURE_SUB = '__fixture_sub__';
const FIXTURE_NAME = '__test__';

let failures = 0;
let lastStep = 'start';
const step = (label) => { lastStep = label; };
// Watchdog: a stalled remote DB query must never hang the run forever.
const watchdog = setTimeout(() => {
  console.log('TIMEOUT after ' + lastStep + ' — the run stalled there');
  process.exit(2);
}, 90000);
const check = (label, cond, detail) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + label + '  ' + (detail || ''));
  if (!cond) failures++;
};

// ---- 1. local RSA key + a JWKS server that serves its public half ----
async function makeKeys() {
  const kc = await crypto.subtle.generateKey(
    {name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: Uint8Array.of(1, 0, 1), hash: 'SHA-256'},
    true, ['sign', 'verify']);
  const pub = await crypto.subtle.exportKey('jwk', kc.publicKey);
  const jwk = {kty: pub.kty, n: pub.n, e: pub.e, kid: 'fixture-kid', alg: 'RS256', use: 'sig'};
  return {signKey: kc.privateKey, jwk};
}

function jwksServer(jwk) {
  const body = JSON.stringify({keys: [jwk]});
  return http.createServer((req, rq) => {
    rq.writeHead(200, {'Content-Type': 'application/json'});
    rq.end(body);
  }).listen(JWKS_PORT);
}

// ---- 2. tiny HTTP helpers (no deps, same style as the other test scripts) ----
function req(method, port, path, obj) {
  return new Promise((ok, fail) => {
    const body = obj == null ? null : JSON.stringify(obj);
    const headers = body == null ? {} : {'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body)};
    const r = http.request({host: 'localhost', port, path, method, headers}, (res) => {
      let s = '';
      res.on('data', (c) => s += c);
      res.on('end', () => ok({status: res.statusCode, body: s}));
    });
    r.on('error', (e) => fail(e));
    r.end(body == null ? '' : body);
  });
}

(async () => {
  let keys;
  try { keys = await makeKeys(); } catch (e) { console.log('KEYGEN FAILED -> ' + e.message); process.exit(1); }

  const token = await new jose.SignJWT({
    sub: FIXTURE_SUB, name: FIXTURE_NAME,
    email: 'fixture@example.com', email_verified: true,
    picture: 'https://example.com/p.png', locale: 'pt-BR',
  })
    .setProtectedHeader({alg: 'RS256', kid: 'fixture-kid'})
    .setIssuedAt().setExpirationTime('10m')
    .setIssuer('https://accounts.google.com')
    .setAudience(CLIENT_ID)
    .sign(keys.signKey);

  // sanity: the fixture token must verify against our own JWKS before we trust it
  const self = await jose.jwtVerify(token, jose.createLocalJWKSet({keys: [keys.jwk]}),
    {issuer: 'https://accounts.google.com', audience: CLIENT_ID, clockTolerance: 60});
  check('fixture token self-verifies', self.payload.sub === FIXTURE_SUB, 'sub=' + self.payload.sub);

  const jwks = jwksServer(keys.jwk);

  // ---- 3. start the REAL server.js, pointed at our JWKS + fixture client id ----
  const child = cp.spawn('node', ['server.js'], {
    cwd: process.cwd(),
    env: {...process.env, GOOGLE_CLIENT_ID: CLIENT_ID, JWKS_URL: 'http://localhost:' + JWKS_PORT + '/jwks', PORT: String(SERVER_PORT)},
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  child.stdout.on('data', (d) => { serverLog += d; });
  child.stderr.on('data', (d) => { serverLog += d; });
  step('server started');

  async function waitHealth(attempts) {
    for (let i = 0; i < attempts; i++) {
      try {
        const r = await req('GET', SERVER_PORT, '/api/health', null);
        if (r.status === 200) return JSON.parse(r.body);
      } catch (_) {}
      await new Promise((s) => setTimeout(s, 500));
    }
    return null;
  }

  // The remote host kills idle sockets, so a dead connection must never poison the
  // run: drop it and retry once on a fresh one — same strategy server.js uses.
  let conn = null;
  const mkConn = () => mysql.createConnection({host: env.HOST, port: Number(env.PORT || 3306), user: env.USER, password: env.PASSWORD, database: env.DATABASE, connectTimeout: 15000});
  const dbq1 = (sql, args) => new Promise((ok, fail) => {
    if (!conn) { conn = mkConn(); conn.on('error', () => { conn = null; }); }
    conn.query(sql, args, (err, rows) => err ? fail(err) : ok(rows));
  });
  const dbq = (sql, args) => dbq1(sql, args).catch((e) => { conn = null; return dbq1(sql, args); });

  try {
    const health = await waitHealth(20);
    if (!health) { console.log('SERVER NEVER STARTED -> ' + serverLog); process.exit(1); }
    check('health reports login enabled', health.login === 'google', JSON.stringify(health));

    // forged token must still be rejected
    const forged = await req('POST', SERVER_PORT, '/api/score', {game: 'si', score: 99999, token: 'aaa.bbb.ccc'});
    check('forged token rejected', forged.status === 401, 'HTTP ' + forged.status + ' ' + forged.body);

    // valid token through /api/login
    const login = await req('POST', SERVER_PORT, '/api/login', {id_token: token});
    let loginBody = null;
    try { loginBody = JSON.parse(login.body); } catch (_) {}
    check('/api/login accepts fixture token', login.status === 200 && loginBody && loginBody.ok === true,
      'HTTP ' + login.status + ' ' + login.body);
    const uid = loginBody && loginBody.uid;

    // valid token through /api/score — the server rate-limits one insert per 5s per
    // ip, and the forged attempt above already consumed that slot, so wait for it.
    await new Promise((s) => setTimeout(s, 5200));
    const score = await req('POST', SERVER_PORT, '/api/score', {game: 'si', score: 1234, token});
    let scoreBody = null;
    try { scoreBody = JSON.parse(score.body); } catch (_) {}
    check('/api/score accepts fixture token', score.status === 200 && scoreBody && scoreBody.ok === true,
      'HTTP ' + score.status + ' ' + score.body);

    // the DB row must exist and be linked to user_id
    const rows = await dbq('SELECT id, player_name, game, score, user_id FROM ' + TABLE + ' WHERE player_name = ?', [FIXTURE_NAME]);
    const row = rows.find((r) => Number(r.score) === 1234);
    check('ranking row created', !!row, row ? JSON.stringify(row) : 'no row');
    check('row linked to user_id', row && row.user_id != null && Number(row.user_id) === Number(uid),
      'user_id=' + (row ? row.user_id : '?') + ' uid=' + uid);

    const gu = await dbq('SELECT id, google_sub, name FROM ' + USERS_TABLE + ' WHERE google_sub = ?', [FIXTURE_SUB]);
    check('google_users row created', gu.length === 1, gu.length ? JSON.stringify(gu[0]) : 'missing');

    // cleanup: remove exactly the fixture rows this run created
    const delScore = await dbq('DELETE FROM ' + TABLE + ' WHERE player_name = ? AND score = 1234', [FIXTURE_NAME]);
    const delUser = await dbq('DELETE FROM ' + USERS_TABLE + ' WHERE google_sub = ?', [FIXTURE_SUB]);
    console.log('cleanup     -> fixture rows deleted (ranking + google_users)');
  } catch (e) {
    console.log('FAILED -> ' + [e.code, e.sqlMessage, e.message].filter((x) => x).join(' '));
    failures++;
  } finally {
    try { if (conn) conn.end(); } catch (_) {}
    try { child.kill(); } catch (_) {}
    try { jwks.close(); } catch (_) {}
    if (serverLog) console.log('server log  -> ' + serverLog.trim());
  }

  console.log('RESULT      -> ' + (failures ? failures + ' check(s) FAILED' : 'OK, the valid-token path works end to end'));
  process.exit(failures ? 1 : 0);
})();
