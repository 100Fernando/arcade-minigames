// probe-live-sync.js - the user's production complaint, tested on the REAL box.
// Two clients open websockets on the VPS, each runs its OWN rollback sim (the
// mp-client.js netcode, modelled here) against the LIVE si-sim.js. If the two
// screens ever disagree about the fleet/phase at the same tick, the desync is
// still live.
'use' + ' strict';
const https = require('https');
const net = require('net');
const crypto = require('crypto');
const fs = require('fs');

const HOST = 'ferramox.duckdns.org';
const BASEPATH = '/ranking-api';

// Load the file the box actually serves, so the probe tests production, not repo.
function fetchLive(path) {
  return new Promise((ok, fail) => {
    const rq = https.get('https://' + HOST + path, (res) => {
      if (res.statusCode >= 400) { res.abort(); fail('BADSTATUS ' + res.statusCode); return; }
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => ok(raw));
    });
    rq.on('error', fail);
  });
}
async function loadLive() {
  let src = '';
  for (let attempt = 0; attempt < 6 && src.length < 1000; attempt++) {
    try { src = await fetchLive('/arcade/si-sim.js'); }
    catch (e) { console.log('fetch retry: ' + (e.code || e)); await new Promise((p) => setTimeout(p, 1200)); }
  }
  if (src.length < 1000) throw new Error('si-sim.js fetch failed');
  const mod = { exports: {} };
  new Function('module', 'require', 'window', src)(mod, require('module').require, undefined);
  return mod.exports;
}
function req(method, path, obj) {
  return new Promise((ok, fail) => {
    const body = obj == null ? null : JSON.stringify(obj);
    // Connection: close - nginx keep-alive + node's agent otherwise ECONNRESETs POSTs here.
    const rq = https.request({ method, host: HOST, path: BASEPATH + path,
      headers: body == null ? { Connection: 'close' } : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), Connection: 'close' },
      timeout: 10000 });
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
  return Buffer.concat([Buffer.from([0x81, 0xFE, p.length >> 8, p.length & 255]), mask, masked]);
}
function parseFrames(buf) {
  const out = [];
  for (;;) {
    if (buf.length < 2) break;
    const opcode = buf[0] & 0x0f, masked = (buf[1] & 0x80) !== 0;
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

let S = null; // filled by loadLive() before any client is built

const TICK = 50, D = 3, RB = 8;
const clone = (w) => JSON.parse(JSON.stringify(w));

// ---- mp-client.js netcode, verbatim in behaviour ----
function makeClient(seat) { return { sim: null, hist: [], recv: {}, tick: 0, base: null, lastAuth: -1, own: {}, anchor: 0, seat }; }
function seedClient(c, s) {
  const lastStep = s.t - 1;
  if (lastStep < 0) return false;
  c.hist = []; c.recv = {}; c.own = {};
  if (lastStep === 0) {
    c.sim = S.create(s.md || 'normal', s.seed);
    for (const p of (s.ps || [])) S.addPlayer(c.sim, p[1]);
    c.sim.status = 'live';
    c.base = clone(c.sim);
    c.anchor = 0; c.tick = 0;
  } else {
    c.sim = S.restore(s);
    c.base = clone(c.sim);
    c.anchor = lastStep + 1; c.tick = lastStep + 1;
    c.hist[lastStep] = { world: c.base, inputs: s.i || null };
  }
  c.lastAuth = lastStep;
  return true;
}
function instantInput(c, t) {
  // deterministic pseudo-input per seat so the two clients mispredict each other
  const s = c.seat;
  return [((t >> (s + 1)) & 1) ? 1 : -1, (t % 7 === 0) ? 1 : 0, t % (2 + s) !== 0 ? 1 : 0];
}
function predictFor(c, t, seat) {
  if (seat === c.seat) { if (c.own[t]) return c.own[t]; return instantInput(c, t); }
  const h = c.hist[t - 1];
  if (h && h.inputs[seat]) return h.inputs[seat];
  return [0, 0, 0];
}
function inputFor(c, t, seat) {
  if (c.recv[t] && c.recv[t][seat]) return c.recv[t][seat];
  return predictFor(c, t, seat);
}
function stepTick(c, t) {
  const inp = [];
  for (let s2 = 0; s2 < c.sim.players.length; s2++) inp.push(inputFor(c, t, s2));
  for (let s2 = 0; s2 < c.sim.players.length; s2++) S.applyInput(c.sim, s2, inp[s2][0], inp[s2][1], inp[s2][2]);
  S.step(c.sim, TICK);
  c.own[t] = inp[c.seat];
  c.hist[t] = { world: clone(c.sim), inputs: inp };
}
function rollbackTo(c, tp) {
  if (tp <= c.anchor) c.sim = clone(c.base);
  else { const h = c.hist[tp - 1]; if (!h) return; c.sim = clone(h.world); }
  for (let t2 = tp; t2 < c.tick; t2++) {
    const in2 = [];
    for (let s2 = 0; s2 < c.sim.players.length; s2++) in2.push(inputFor(c, t2, s2));
    for (let s2 = 0; s2 < c.sim.players.length; s2++) S.applyInput(c.sim, s2, in2[s2][0], in2[s2][1], in2[s2][2]);
    S.step(c.sim, TICK);
    c.own[t2] = in2[c.seat];
    c.hist[t2] = { world: clone(c.sim), inputs: in2 };
  }
}
function handleSimSnapshot(c, s) {
  const k = s.t - 1;
  if (s.i) c.recv[k] = s.i;
  if (k > c.lastAuth) c.lastAuth = k;
  for (let tp = Math.max(c.anchor, k - RB); tp < k; tp++) {
    const r = c.recv[tp];
    if (!r) continue;
    const h = c.hist[tp];
    if (!h) continue;
    let bad = false;
    for (let s2 = 0; s2 < r.length; s2++) if (String(h.inputs[s2]) !== String(r[s2])) { bad = true; break; }
    if (!bad) continue;
    rollbackTo(c, tp);
    break;
  }
}
function simStep(c) {
  if (!c.sim) return;
  if (c.tick > c.lastAuth + D) return;
  stepTick(c, c.tick);
  c.tick++;
}

let stage = 'boot';
process.on('uncaughtException', (e) => { console.log('harness at ' + stage + ': ' + (e.code || e.message)); process.exit(1); });
(async () => {
  stage = 'loadLive';
  S = await loadLive();
  console.log('live si-sim.js: worlds=' + S.WORLDS.length + ' restore=' + (typeof S.restore));
  const c0 = await req('POST', '/api/mp/create', { name: 'SyncA', mode: 'normal' });
  if (!c0 || !c0.code) { console.log('create failed: ' + JSON.stringify(c0)); process.exit(1); }
  const code = c0.code;
  const j = await req('POST', '/api/mp/join', { code, name: 'SyncB' });
  const st = await req('POST', '/api/mp/start', { code });
  console.log('room ' + code + ' seats=' + (st && st.ps ? st.ps.length : '?'));

  const A = makeClient(0), B = makeClient(1);
  let seededA = false, seededB = false, diverged = 0, compared = 0;

  function openSock(seat, cb) {
    const key = crypto.randomBytes(16).toString('base64');
    const rq = https.request({ host: HOST, path: BASEPATH + '/api/mp/ws?code=' + code,
      headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13' },
      timeout: 10000 });
    rq.on('error', (e) => console.log('ws error seat ' + seat + ': ' + (e.code || e.message)));
    rq.on('response', (res) => console.log('no upgrade seat ' + seat + ': ' + res.statusCode));
    rq.on('upgrade', (res, sock, rest) => {
      let buf = rest && rest.length ? Buffer.from(rest) : Buffer.alloc(0);
      sock.on('data', (d) => {
        buf = Buffer.concat([buf, d]);
        const got = parseFrames(buf);
        buf = got.rest;
        for (const txt of got.texts) cb(JSON.parse(txt));
      });
      return sock;
    });
    rq.end();
    return rq;
  }

  let sockA = null, sockB = null;
  function openSock(seat, cb) {
    const key = crypto.randomBytes(16).toString('base64');
    const rq = https.request({ host: HOST, path: BASEPATH + '/api/mp/ws?code=' + code,
      headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13' },
      timeout: 10000 });
    rq.on('error', (e) => console.log('ws error seat ' + seat + ': ' + (e.code || e.message)));
    rq.on('response', (res) => console.log('no upgrade seat ' + seat + ': ' + res.statusCode));
    rq.on('upgrade', (res, sock, rest) => {
      let buf = rest && rest.length ? Buffer.from(rest) : Buffer.alloc(0);
      sock.on('data', (d) => {
        buf = Buffer.concat([buf, d]);
        const got = parseFrames(buf);
        buf = got.rest;
        for (const txt of got.texts) cb(JSON.parse(txt));
      });
      if (seat === 0) sockA = sock; else sockB = sock;
    });
    rq.end();
  }

  openSock(0, (s) => {
    if (!seededA) { if (seedClient(A, s)) seededA = true; return; }
    handleSimSnapshot(A, s);
    simStep(A);
    const inp = instantInput(A, A.tick);
    try { sockA.write(wsFrame(JSON.stringify({ s: 0, i: inp }))); } catch (_) {}
  });
  openSock(1, (s) => {
    if (!seededB) { if (seedClient(B, s)) seededB = true; return; }
    handleSimSnapshot(B, s);
    simStep(B);
    const inp = instantInput(B, B.tick);
    try { sockB.write(wsFrame(JSON.stringify({ s: 1, i: inp }))); } catch (_) {}
  });

  await new Promise((p) => setTimeout(p, 6000));
  // compare the settled history at the SAME step index on both screens
  let minTick = Math.min(A.tick, B.tick) - D - 1;
  for (let t = 0; t <= minTick; t++) {
    if (!A.hist[t] || !B.hist[t]) continue;
    compared++;
    const sa = S.snapshot(A.hist[t].world), sb = S.snapshot(B.hist[t].world);
    if (JSON.stringify(sa.en) !== JSON.stringify(sb.en) || sa.lv !== sb.lv || sa.s2 !== sb.s2) {
      if (diverged === 0) console.log('DESYNC at step ' + t + ': A en=' + sa.en.length + ' lv=' + sa.lv + ' | B en=' + sb.en.length + ' lv=' + sb.lv);
      diverged++;
    }
  }
  console.log('compared steps=' + compared + '  diverged=' + diverged);
  console.log('A tick=' + A.tick + ' lv=' + (A.sim && A.sim.level) + ' enemies=' + (A.sim && A.sim.enemies.length));
  console.log('B tick=' + B.tick + ' lv=' + (B.sim && B.sim.level) + ' enemies=' + (B.sim && B.sim.enemies.length));
  console.log(diverged === 0 && compared > 20 ? 'SYNCHRONIZED (production)' : 'NOT SYNCHRONIZED');
  try { sockA.write(Buffer.from([0x88, 0x80, 0, 0, 0, 0])); sockB.write(Buffer.from([0x88, 0x80, 0, 0, 0, 0])); } catch (_) {}
  process.exit(0);
})().catch((e) => { console.log('harness at ' + stage + ': ' + (e.code || e.message)); process.exit(1); });
