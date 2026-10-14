// probe-input-lag.js — measure the two things users actually complain about:
//   1) INPUT LAG  : ms from the moment a player SENDS input until the SERVER
//                   applies it (first pushed snapshot where that ship moved).
//   2) CROSS VIEW : ms from that same moment until the OTHER player's socket
//                   sees the move (i.e. "I can't see what the other guy did").
// Everything runs over the real wire: https create/join/start + wss upgrade
// through nginx on ferramox.duckdns.org. Run: node probe-input-lag.js
'use strict';
const https = require('https');
const crypto = require('crypto');
// --local  -> talk to `node server.js` on :8765 with NO nginx in between, so the
//            numbers isolate the nginx proxy layer from the node sim layer.
const LOCAL = process.argv.indexOf('--local') >= 0;
const MOD = LOCAL ? require('http') : https;
const HOST = LOCAL ? 'localhost' : 'ferramox.duckdns.org';
const BASE = LOCAL ? '' : '/ranking-api';

function req(method, path, obj) {
  return new Promise((ok, fail) => {
    const body = obj == null ? null : JSON.stringify(obj);
    const rq = MOD.request({
      method, host: HOST, port: LOCAL ? 8765 : undefined, path: BASE + path,
      headers: body == null ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 10000,
    });
    if (body !== null) rq.write(body);
    rq.end();
    rq.on('error', (e) => fail({ code: e.code }));
    rq.on('response', (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        if (res.statusCode >= 400) { fail({ code: res.statusCode, body: raw }); return; }
        try { ok(JSON.parse(raw)); } catch (_) { fail({ code: 'BADJSON', body: raw }); }
      });
    });
  });
}

function wsFrame(str) {
  const p = Buffer.from(str, 'utf8');
  const mask = crypto.randomBytes(4);
  const masked = Buffer.alloc(p.length);
  for (let i = 0; i < p.length; i++) masked[i] = p[i] ^ mask[i & 3];
  if (p.length < 126) return Buffer.concat([Buffer.from([0x81, 0x80 | p.length]), mask, masked]);
  const h = Buffer.from([0x81, 0xFE, p.length >> 8, p.length & 255]);
  return Buffer.concat([h, mask, masked]);
}

function parseFrames(buf) {
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
    if (masked) { const o = Buffer.alloc(len); for (let i = 0; i < len; i++) o[i] = payload[i] ^ mask[i & 3]; payload = o; }
    buf = buf.slice(off + len);
    if (opcode === 1) out.push(payload.toString('utf8'));
  }
  return { texts: out, rest: buf };
}

// Open one socket for a room; returns { sock, msgs[] } with frames parsed.
function openWs(code) {
  return new Promise((ok, fail) => {
    const key = crypto.randomBytes(16).toString('base64');
    const rq = MOD.request({
      host: HOST, port: LOCAL ? 8765 : undefined, path: BASE + '/api/mp/ws?code=' + code,
      headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13' },
      timeout: 10000,
    });
    rq.on('upgrade', (res, sock, rest) => ok({ sock, rest }));
    rq.on('response', (res) => fail({ code: 'NO_UPGRADE', status: res.statusCode }));
    rq.on('error', (e) => fail({ code: e.code }));
    rq.end();
  });
}

function x(arr) { return arr.sort((a, b) => a - b); }
function pct(arr, p) { const a = x(arr.slice()); return a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : null; }

(async () => {
  const c = await req('POST', '/api/mp/create', { name: 'LagP1', mode: 'normal' });
  if (!c || !c.ok) { console.log('create failed: ' + JSON.stringify(c)); process.exit(1); }
  const code = c.code;
  const j = await req('POST', '/api/mp/join', { code, name: 'LagP2' });
  if (!j || !j.ok) { console.log('join failed: ' + JSON.stringify(j)); process.exit(1); }
  const s = await req('POST', '/api/mp/start', { code });
  if (!s || !s.ok) { console.log('start failed: ' + JSON.stringify(s)); process.exit(1); }
  console.log('room ' + code + ' — 2 seats live');

  const a = await openWs(code);
  const b = await openWs(code);
  const feed = (sock, rest) => {
    const box = { buf: rest && rest.length ? Buffer.from(rest) : Buffer.alloc(0), msgs: [] };
    sock.on('data', (d) => {
      box.buf = Buffer.concat([box.buf, d]);
      const got = parseFrames(box.buf);
      box.buf = got.rest;
      for (const t of got.texts) box.msgs.push({ t: Date.now(), s: JSON.parse(t) });
    });
    return box;
  };
  const A = feed(a.sock, a.rest);
  const B = feed(b.sock, b.rest);

  await new Promise((ok) => setTimeout(ok, 600)); // let both sockets warm up

  const inputLags = [];
  const crossLags = [];
  for (let round = 0; round < 12; round++) {
    const dir = round % 2 ? -1 : 1;
    // P0 sends input at this instant, exactly like the browser does on keydown.
    const t0 = Date.now();
    a.sock.write(wsFrame(JSON.stringify({ s: 0, i: [dir, 0, 0] })));
    // find first snapshot on A (P0's own view) where P0 moved
    const findMove = (box, seat, startX) => box.msgs.find((m) => {
      if (m.t < t0) return false;
      const p = (m.s.ps || []).find((q) => q[0] === seat);
      return p && Math.abs(p[2] - startX) > 1;
    });
    const startX = (A.msgs.length ? A.msgs[A.msgs.length - 1].s.ps[0][2] : 60);
    // wait until observed
    const deadline = t0 + 3000;
    while (Date.now() < deadline) { await new Promise((r) => setTimeout(r, 20));
      if (findMove(A, 0, startX) && findMove(B, 0, startX)) break; }
    const mA = findMove(A, 0, startX), mB = findMove(B, 0, startX);
    inputLags.push(mA ? mA.t - t0 : null);
    crossLags.push(mB ? mB.t - t0 : null);
    // keep both seats alive so the sim keeps stepping
    a.sock.write(wsFrame(JSON.stringify({ s: 0, i: [0, 0, 0] })));
    b.sock.write(wsFrame(JSON.stringify({ s: 1, i: [0, 0, 0] })));
    await new Promise((r) => setTimeout(r, 250));
  }

  const fmt = (arr) => {
    const got = arr.filter((v) => v != null);
    if (!got.length) return 'NO MEASUREMENT';
    return 'min ' + Math.min.apply(null, got) + 'ms · median ' + pct(got, 0.5) + 'ms · p90 ' + pct(got, 0.9) + 'ms · max ' + Math.max.apply(null, got) + 'ms (misses: ' + (arr.length - got.length) + ')';
  };
  console.log('INPUT LAG  (send -> own socket sees move) : ' + fmt(inputLags));
  console.log('CROSS VIEW (send -> other socket sees move): ' + fmt(crossLags));
  const pushA = A.msgs.map((m) => m.t), gapsA = pushA.slice(1).map((t, i) => t - pushA[i]);
  console.log('PUSH RATE  socket A                       : ' + fmt(gapsA) + '  (' + A.msgs.length + ' frames)');
  process.exit(0);
})().catch((e) => { console.log('harness: ' + (e.code || e.message)); process.exit(1); });
