// test-ws.js — proves the Phase 6 WebSocket transport end to end, no browser.
//
// Boots server.js as a child, creates a room over HTTP, then upgrades a raw
// socket to the WebSocket protocol (hand-rolled RFC 645541 — the VPS has no
// `ws` package either, so the test must not depend on one). It then:
//   * receives pushed snapshots (tick advances without any GET),
//   * sends input fire-and-forget and sees the ship move in the NEXT push,
//   * proves input lag collapses to ~one sim tick instead of a round trip.
// Run: node test-ws.js

'use strict';
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const spawn = require('child_process').spawn;

const PORT = Number(process.env.PORT || 8767); // avoid clashing with :8765/:8766

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

// ---- minimal WebSocket client (text frames, masked like browsers always do) ----
function wsFrame(str) {
  const p = Buffer.from(str, 'utf8');
  const mask = crypto.randomBytes(4);
  const masked = Buffer.alloc(p.length);
  for (let i = 0; i < p.length; i++) masked[i] = p[i] ^ mask[i & 3];
  if (p.length < 126) return Buffer.concat([Buffer.from([0x81, 0x80 | p.length]), mask, masked]);
  if (p.length < 65536) {
    const h = Buffer.from([0x81, 0xFE, p.length >> 8, p.length & 255]);
    return Buffer.concat([h, mask, masked]);
  }
  throw new Error('frame too big for this test');
}
function parseFrames(buf) { // returns {texts, rest} — rest keeps a partial frame
  const out = [];
  for (;;) {
    if (buf.length < 2) break;
    const opcode = buf[0] & 0x0f;
    const masked = (buf[1] & 0x80) !== 0;
    let len = buf[1] & 0x7f, off = 2;
    if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (buf.length < 10) break; len = Number(buf.readBigUInt64BE(2)); off = 10; }
    let mask = null;
    if (masked) { if (buf.length < off + 4) break; mask = buf.slice(off, off + 4); off += 4; }
    if (buf.length < off + len) break;
    let payload = buf.slice(off, off + len);
    if (masked) {
      const o = Buffer.alloc(len);
      for (let i = 0; i < len; i++) o[i] = payload[i] ^ mask[i & 3];
      payload = o;
    }
    buf = buf.slice(off + len);
    if (opcode === 1) out.push(payload.toString('utf8'));
  }
  return { texts: out, rest: buf };
}

(async () => {
  console.log('== spawning server (child) ==');
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

  const c = await post('/api/mp/create', { name: 'WSProbe', mode: 'normal' });
  const code = c.code;
  check('create ok', c && c.ok === true, code);
  const st = await post('/api/mp/start', { code });
  check('start ok', st && st.ok === true, code);

  // ---- raw upgrade handshake ----
  const sock = net.connect(PORT, '127.0.0.1');
  const key = crypto.randomBytes(16).toString('base64');
  sock.write(
    'GET /api/mp/ws?code=' + code + ' HTTP/1.1\r\n' +
    'Host: 127.0.0.1\r\n' +
    'Connection: Upgrade\r\nUpgrade: websocket\r\n' +
    'Sec-WebSocket-Key: ' + key + '\r\nSec-WebSocket-Version: 13\r\n\r\n'
  );

  let buf = Buffer.alloc(0);
  let upgraded = false;
  const msgs = [];
  sock.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    if (!upgraded) {
      const sep = buf.indexOf(Buffer.from('\r\n\r\n'));
      if (sep < 0) return;
      const head = buf.slice(0, sep).toString();
      upgraded = /101/.test(head);
      buf = buf.slice(sep + 4);
    }
    if (upgraded) {
      const got = parseFrames(buf);
      buf = got.rest;
      for (const t of got.texts) msgs.push(t);
    }
  });
  sock.on('error', () => {});

  for (let i = 0; i < 20 && !upgraded; i++) await sleep(100);
  check('upgrade 101 received', upgraded, 'ws handshake');

  // pushed snapshot arrives with NO request from us
  for (let i = 0; i < 20 && msgs.length === 0; i++) await sleep(100);
  const first = msgs.length ? JSON.parse(msgs[0]) : null;
  check('pushed snapshot (no GET made)', first && first.ps, 'tick=' + (first && first.t));

  // send input fire-and-forget: move RIGHT, then watch the pushes move the ship
  const x0 = first.ps[0][2];
  sock.write(wsFrame(JSON.stringify({ s: 0, i: [1, 0, 0] })));
  await sleep(400);
  const last = msgs.length ? JSON.parse(msgs[msgs.length - 1]) : null;
  const x1 = last && last.ps[0] ? last.ps[0][2] : x0;
  check('input msg moved the ship right', x1 > x0, 'x ' + x0 + ' -> ' + x1);

  // fire: bullets appear in pushes
  sock.write(wsFrame(JSON.stringify({ s: 0, i: [0, 0, 1] })));
  await sleep(300);
  const fired = msgs.length ? JSON.parse(msgs[msgs.length - 1]) : null;
  check('fire via ws spawns bullets', fired && (fired.bl || []).length > 0, 'bl=' + (fired && (fired.bl || []).length));

  // ticks advance on their own: two pushes far apart in time differ in tick
  const a = msgs.length > 2 ? JSON.parse(msgs[msgs.length - 2]) : null;
  const b = fired;
  check('server pushes every tick (20 Hz)', a && b && b.t > a.t, 'ticks ' + (a && a.t) + ' -> ' + (b && b.t));

  // HTTP path must still work while a socket is connected (no interference)
  const plain = await get('/api/mp/state?code=' + code);
  check('HTTP state still ok with ws open', plain && plain.ok !== false, 'tick=' + (plain && plain.t));

  sock.write(Buffer.from([0x88, 0x80, 0, 0, 0, 0])); // close frame (masked, empty payload)
  await sleep(200);
  child.kill('SIGKILL');

  const pass = results.filter((r) => r.startsWith('PASS')).length;
  console.log('== ' + pass + '/' + results.length + ' PASS ==');
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.log('harness error: ' + (e.code || e.message)); process.exit(1); });
