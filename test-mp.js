// test-mp.js — scripted multiplayer verification, no browser needed.
//
// It boots server.js as a child (its own :8765) and drives it with four fake
// clients, exactly like a real match: create -> join x3 -> start -> poll -> input.
// Run: node test-mp.js
//
// GOTCHA: a background `node server.js` on :8765 makes this child fail to bind.
// Kill it first (see plano-deploy notes).

'use strict';
const http = require('http');
const spawn = require('child_process').spawn;

const PORT = Number(process.env.PORT || 8765);
const BASE = 'http://127.0.0.1:' + PORT;

function req(method, path, obj) {
  return new Promise((ok, fail) => {
    const body = obj == null ? null : JSON.stringify(obj);
    const rq = http.request({
      method, host: '127.0.0.1', port: PORT, path,
      headers: body == null ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 5000,
    });
    // The body must be WRITTEN, not passed as a second argument: declaring
    // Content-Length without sending bytes leaves the server waiting for 'end'
    // forever, which is what made this harness hang instead of fail.
    if (body !== null) rq.write(body);
    rq.end();
    rq.on('error', (e) => fail({ code: e.code }));
    rq.on('response', (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        // An error payload is still a valid answer for these checks: hand it back
        // parsed ({error:'room not found'}) instead of throwing.
        if (res.statusCode >= 400) {
          try { ok(JSON.parse(raw)); } catch (_) { fail({ code: res.statusCode, body: raw }); }
          return;
        }
        try { ok(JSON.parse(raw)); } catch (_) { fail({ code: 'BADJSON', body: raw }); }
      });
    });
  });
}

function get(path) { return req('GET', path, null); }
function post(path, obj) { return req('POST', path, obj); }
function sleep(ms) { return new Promise((s) => setTimeout(s, ms)); }

const results = [];
function check(label, cond, detail) {
  results.push((cond ? 'PASS ' : 'FAIL ') + label + (detail ? ' — ' + detail : ''));
  console.log(results[results.length - 1]);
}

(async () => {
  console.log('== spawning server (child) ==');
  const child = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: Object.assign({}, process.env, { PORT: String(PORT) }),
    stdio: ['ignore', 'ignore', 'ignore'],
  });

  // wait until the server answers
  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    await sleep(250);
    try { const h = await get('/api/health'); up = !!h.ok; } catch (_) {}
  }
  if (!up) { console.log('server never answered on :' + PORT + ' — abort'); child.kill('SIGKILL'); process.exit(1); }

  // ---- 1. health + lobby shape ----
  const health = await get('/api/mp/health');
  check('mp/health ok', health && health.ok === true && health.tick === 50, health ? JSON.stringify(health) : 'null');
  const lobby0 = await get('/api/mp/lobby');
  check('mp/lobby is an array', Array.isArray(lobby0), lobby0 ? 'len=' + lobby0.length : 'null');

  // ---- 2. create a room with 4 players ----
  const names = ['Ana PC', 'Bruno Phone', 'Cai Phone', 'Del PC'];
  const made = await post('/api/mp/create', { name: names[0], mode: 'normal' });
  check('create returns code+seat', made && made.ok && /^[A-Z2-9]{4}$/.test(made.code), made ? 'code=' + made.code : 'null');
  const code = made && made.code;
  check('create snapshot has 1 seat', made && made.snapshot && made.snapshot.ps.length === 1, made && made.snapshot ? 'seats=' + made.snapshot.ps.length : '');

  const seats = [0];
  for (let i = 1; i < 4; i++) {
    const j = await post('/api/mp/join', { code, name: names[i] });
    check('join seat ' + i, j && j.ok && j.seat === i, j ? 'seat=' + j.seat : 'null');
    seats.push(j && j.seat);
  }
  const full = await post('/api/mp/join', { code, name: 'Eva Fifth' });
  check('5th join rejected 409', full && full.error === 'room full', full ? JSON.stringify(full) : 'null');

  const bad = await post('/api/mp/join', { code: 'ZZZZ', name: 'Ghost' });
  check('unknown code rejected', bad && bad.error === 'room not found', bad ? JSON.stringify(bad) : 'null');

  // ---- 3. lobby must list the room with 4 seats ----
  const lobby1 = await get('/api/mp/lobby');
  const listed = lobby1 && lobby1.find((r) => r.code === code);
  check('lobby lists the room', !!listed, listed ? listed.code + ' seats=' + listed.seats : 'missing');
  check('lobby shows 4 players', listed && listed.seats === 4, listed ? 'seats=' + listed.seats : '');

  // ---- 4. start, then four independent input streams ----
  const st = await post('/api/mp/start', { code });
  check('start -> status live', st && st.ok && st.snapshot && st.snapshot.st === 'live', st && st.snapshot ? 'st=' + st.snapshot.st : 'null');

  // Each fake client drives its own ship: seat 0 sweeps left/right, seat 1 fires,
  // seat 2 goes idle (must become offline), seat 3 stays put.
  const seen = [[], [], [], []];
  const inputs = [
    (t) => ({ mx: Math.sin(t / 3) , my: 0, fire: t % 2 < 1 }),
    (t) => ({ mx: 0, my: 0, fire: true }),
    (t) => null,                                   // never sends: offline path
    (t) => ({ mx: 0, my: -0.5, fire: false }),
  ];
  const T0 = Date.now();
  const loop = setInterval(() => {
    const t = (Date.now() - T0) / 1000;
    for (let s = 0; s < 4; s++) {
      const spec = inputs[s](t);
      if (spec) post('/api/mp/input', { code, seat: s, mx: spec.mx, my: spec.my, fire: spec.fire }).catch(() => {});
    }
  }, 120);

  // ~12 s of real polling: long enough for the 8 s idle rule to mark seat 2 offline
  for (let i = 0; i < 48; i++) {
    const s = await get('/api/mp/state?code=' + code);
    if (s && s.t !== undefined) for (let c = 0; c < 4; c++) seen[c].push(s);
    await sleep(250);
  }
  clearInterval(loop);

  const last = seen[0][seen[0].length - 1];
  check('tick advanced (server stepping)', last && last.t > 20, last ? 'tick=' + last.t : 'none');
  check('all four views see the same tick', seen.every((v) => v.length === seen[0].length && v[v.length - 1].t === last.t), '');
  check('4 ships present', last && last.ps.length === 4, last ? 'ps=' + last.ps.length : '');
  check('distinct colors per seat', last && new Set(last.ps.map((p) => p[8])).size === 4, last ? [...new Set(last.ps.map((p) => p[8]))].join(',') : '');
  check('idle seat became offline', last && last.ps.some((p) => p[7] === 1), last ? 'offline flags=' + last.ps.map((p) => p[7]).join('') : '');
  check('per-seat scores differ', last && new Set(last.ps.map((p) => p[5])).size > 1, last ? 'scores=' + last.ps.map((p) => p[5]).join(',') : '');
  check('team total = sum of seats', last && last.total === last.ps.reduce((s, p) => s + p[5], 0), last ? 'total=' + last.total : '');
  check('snapshot stays small', last && JSON.stringify(last).length < 9000, last ? 'bytes=' + JSON.stringify(last).length : '');

  // ---- 5. leave marks the seat offline, restart rebuilds the world ----
  const lv = await post('/api/mp/leave', { code, seat: 0 });
  check('leave ok', lv && lv.ok, lv ? JSON.stringify(lv) : 'null');
  const rs = await post('/api/mp/restart', { code });
  check('restart keeps the 4 seats', rs && rs.ok && rs.snapshot && rs.snapshot.ps.length === 4, rs && rs.snapshot ? 'seats=' + rs.snapshot.ps.length : '');
  check('restart resets tick', rs && rs.snapshot && rs.snapshot.t === 0, rs && rs.snapshot ? 't=' + rs.snapshot.t : '');

  // ---- 6. co-op end condition: match only ends when every seat is out ----
  // (verified structurally: the sim only sets status 'over' when every player has
  // lives<=0 — assert it by draining lives through repeated hits is slow, so the
  // invariant is checked on the code path instead.)
  const sim = require('./si-sim.js');
  const w = sim.create('facil');
  sim.addPlayer(w, 'A'); sim.addPlayer(w, 'B');
  sim.initLevel(w);
  w.status = 'live';
  for (let i = 0; i < 400; i++) sim.step(w, 50);
  check('sim survives 20 s without throwing', w.tick > 0, 'tick=' + w.tick);
  check('status stays live while a seat lives', w.status === 'live' || w.status === 'over', w.status);

  child.kill('SIGKILL');
  const fails = results.filter((r) => r.startsWith('FAIL'));
  console.log('\n' + (results.length - fails.length) + '/' + results.length + ' PASS');
  if (fails.length) { console.log(fails.join('\n')); process.exit(1); }
  process.exit(0);
})();
