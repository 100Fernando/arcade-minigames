// test-state-input.js — proves the new wire path: input carried on the state GET.
// Boots server.js as a child, creates + starts a room, then moves a ship using ONLY
// GET /api/mp/state?code=..&seat=..&mx=.. and checks the server applied the input.
// Run: node test-state-input.js

'use strict';
const http = require('http');
const spawn = require('child_process').spawn;
const PORT = Number(process.env.PORT || 8766); // avoid clashing with a running :8765

function req(method, path, obj) {
  return new Promise((ok, fail) => {
    const body = obj == null ? null : JSON.stringify(obj);
    const rq = http.request({
      method, host: '127.0.0.1', port: PORT, path,
      headers: body == null ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 5000,
    });
    if (body !== null) rq.write(body);
    rq.end();
    rq.on('error', (e) => fail({ code: e.code }));
    rq.on('response', (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        if (res.statusCode >= 400) { try { ok(JSON.parse(raw)); } catch (_) { fail({ code: res.statusCode, body: raw }); } return; }
        try { ok(JSON.parse(raw)); } catch (_) { fail({ code: 'BADJSON', body: raw }); }
      });
    });
  });
}
function get(p) { return req('GET', p, null); }
function post(p, o) { return req('POST', p, o); }
function sleep(ms) { return new Promise((s) => setTimeout(s, ms)); }

const results = [];
function check(label, cond, detail) {
  results.push((cond ? 'PASS ' : 'FAIL ') + label + (detail ? ' — ' + detail : ''));
  console.log(results[results.length - 1]);
}

(async () => {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: Object.assign({}, process.env, { PORT: String(PORT) }),
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    await sleep(250);
    try { const h = await get('/api/health'); up = !!h.ok; } catch (_) {}
  }
  if (!up) { console.log('server never answered on :' + PORT + ' — abort'); child.kill('SIGKILL'); process.exit(1); }

  const c = await post('/api/mp/create', { name: 'Probe', mode: 'normal' });
  const code = c.code;
  check('create ok', c && c.ok === true, code);
  await post('/api/mp/start', { code });

  // Move RIGHT using only the state GET carrying the input.
  const before = await get('/api/mp/state?code=' + code);
  const x0 = before.ps[0][2];
  const moved = await get('/api/mp/state?code=' + code + '&seat=0&mx=1&my=0&fire=0');
  await sleep(300);
  const after = await get('/api/mp/state?code=' + code + '&seat=0&mx=1&my=0&fire=0');
  const x1 = after.ps[0][2];
  check('input on GET moved the ship right', x1 > x0, 'x ' + x0 + ' -> ' + x1);

  // fire=1 must produce bullets. The bullet spawns on the NEXT sim step (the state
  // GET applies input then snapshots immediately), so hold fire and read a bit later.
  await get('/api/mp/state?code=' + code + '&seat=0&mx=0&my=0&fire=1');
  await sleep(120);
  const fired = await get('/api/mp/state?code=' + code + '&seat=0&mx=0&my=0&fire=1');
  check('fire=1 on GET spawns a bullet', (fired.bl || []).length > 0, 'bl=' + (fired.bl || []).length);

  // no input params -> world still answers (GET stays valid without them)
  const plain = await get('/api/mp/state?code=' + code);
  check('plain GET still works', plain && plain.ok !== false, 'tick=' + (plain && plain.t));

  child.kill('SIGKILL');
  const fails = results.filter((r) => r.startsWith('FAIL'));
  console.log((results.length - fails.length) + '/' + results.length + ' PASS');
  process.exit(fails.length ? 1 : 0);
})();
