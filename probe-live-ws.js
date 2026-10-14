// probe-live-ws.js — one live round: create a room on the VPS over HTTPS, then
// upgrade a raw socket through nginx to wss://.../ranking-api/api/mp/ws and
// confirm pushed snapshots + fire-and-forget input work on the REAL box.
// Run: node probe-live-ws.js   (needs a room someone created; creates its own)
'use strict';
const https = require('https');
const net = require('net');
const crypto = require('crypto');
const HOST = 'ferramox.duckdns.org';
const BASEPATH = '/ranking-api';

function req(method, path, obj) {
  return new Promise((ok, fail) => {
    const body = obj == null ? null : JSON.stringify(obj);
    const rq = https.request({
      method, host: HOST, path: BASEPATH + path,
      headers: body == null ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 8000,
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

(async () => {
  const c = await req('POST', '/api/mp/create', { name: 'LiveProbe', mode: 'normal' });
  if (!c || !c.ok) { console.log('create failed: ' + JSON.stringify(c)); process.exit(1); }
  const code = c.code;
  console.log('room ' + code);
  const st = await req('POST', '/api/mp/start', { code });
  console.log('start: ' + JSON.stringify(st));

  const key = crypto.randomBytes(16).toString('base64');
  const rq = https.request({
    host: HOST, path: BASEPATH + '/api/mp/ws?code=' + code,
    headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13' },
    timeout: 8000,
  });
  rq.on('upgrade', (res, sock2, rest) => {
    console.log('UPGRADED status=' + res.statusCode);
    let buf = rest && rest.length ? Buffer.from(rest) : Buffer.alloc(0);
    const msgs = [];
    sock2.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      const got = parseFrames(buf);
      buf = got.rest;
      msgs.push(...got.texts);
    });
    const t0 = Date.now();
    sock2.write(wsFrame(JSON.stringify({ s: 0, i: [1, 0, 0] })));
    setTimeout(() => {
      const last = msgs.length ? JSON.parse(msgs[msgs.length - 1]) : null;
      console.log('pushes=' + msgs.length + ' in ' + (Date.now() - t0) + 'ms; last tick=' + (last && last.t) + ' x=' + (last && last.ps && last.ps[0] && last.ps[0][2]));
      sock2.write(Buffer.from([0x88, 0x80, 0, 0, 0, 0]));
      process.exit(0);
    }, 1500);
  });
  rq.on('response', (res) => { console.log('NO UPGRADE: ' + res.statusCode); process.exit(1); });
  rq.on('error', (e) => { console.log('error ' + (e.code || e.message)); process.exit(1); });
  rq.end();
})().catch((e) => { console.log('harness: ' + (e.code || e.message)); process.exit(1); });
