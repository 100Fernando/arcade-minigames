// mp-client.js — Space Invaders ONLINE multiplayer client (PC + mobile, up to 4 per match).
//
// The browser NEVER simulates: the VPS owns the world (si-sim.js, stepped at 20 Hz)
// and this file only (a) sends input, (b) pulls a snapshot every 250 ms, (c) draws it.
// That is what makes a phone and a desktop share one match without WebRTC or WebSockets.
//
// Loaded after script.js / ranking.js / audio.js. Own IIFE, every id prefixed mp*.

(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const section = $('mpGameSection'), canvas = $('mpCanvas'), overlay = $('mpOverlay');
  const mpStart = $('mpStartBtn'), mpRestart = $('mpRestartBtn'), mpIcon = $('mpIcon');
  if (!section || !canvas || !overlay || !mpStart || !mpRestart || !mpIcon) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const CW = canvas.width, CH = canvas.height;

  // Same API base ranking.js uses: absolute on Pages, same-origin on localhost.
  const apiBase = () => {
    if (/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(location.href)) return '';
    const m = document.getElementById('apiBase');
    return (m && m.content || '').trim();
  };
  const API = apiBase;

  // ---------------------------------------------------------------- layout
  const css = document.createElement('style');
  css.textContent = `
    #mpGameSection.minimized > *:not(.game-header) { display:none !important; }
    #mpCanvas { display:block; width:100%; max-width:500px; height:auto; aspect-ratio:5/6; touch-action:none; }
    #mpGameSection, #mpGameContainer, #mpGameSection .mp-canvas-wrapper { min-width:0; max-width:100%; }
    #mpGameSection .mp-canvas-wrapper { position:relative; }
    #mpGameSection .overlay { z-index:11; }
    #mpLobby { display:block;margin:10px auto 14px;max-width:500px;color:#cfd6ff;font:12px sans-serif; }
    #mpLobby .mp-row { display:block;padding:5px 8px;margin:0;background:#1b1e38;border-radius:8px; }
    #mpLobby .mp-row b { color:#7fe7ff; }
    #mpControls { display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;margin:12px 0;color:#fff;font:13px sans-serif; }
    #mpControls input { padding:6px;border-radius:8px;background:#24243e;color:#fff;border:1px solid #667eea;font:14px monospace;width:80px;letter-spacing:2px; }
    #mpControls button { padding:8px 12px;border-radius:8px;background:#667eea;color:white;border:0;cursor:pointer;font:13px sans-serif; }
    #mpHud { display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin:8px 0;color:#fff;font:12px monospace; }
    #mpHud .mp-seat { display:inline-block;padding:3px 7px;border-radius:7px;background:#1b1e38; }
    #mpMobileControls { display:none;width:min(100%,500px);margin:14px auto 8px;gap:12px;justify-content:space-between;align-items:center;user-select:none;-webkit-user-select:none;touch-action:none; }
    #mpMobileControls button { flex:1;min-width:0;min-height:68px;border:1px solid #7486ff;border-radius:16px;color:white;background:#2a2e64;font-size:27px;font-weight:700;touch-action:none;-webkit-tap-highlight-color:transparent; }
    #mpMobileControls button:last-child { flex:1.25;background:#75407c; }
    #mpMobileControls button:active, #mpMobileControls button.pressed { background:#5669c8;transform:scale(.97); }
    #mpStickZone { position:relative;flex:1.6;min-width:0;min-height:120px;border:1px solid #7486ff;border-radius:18px;background:#20244a;touch-action:none;-webkit-tap-highlight-color:transparent; }
    @media (max-width:768px) { #mpMobileControls { display:flex; } #mpHud { font-size:11px; } }
    @media (pointer:coarse) { #mpMobileControls { display:flex; } }
  `;
  document.head.appendChild(css);

  // Lobby + controls bar, built by script so index.html stays lean.
  const lobby = document.createElement('div');
  lobby.id = 'mpLobby';
  const controls = document.createElement('div');
  controls.id = 'mpControls';
  const codeInput = document.createElement('input');
  codeInput.id = 'mpCodeInput';
  codeInput.type = 'text';
  codeInput.maxLength = 4;
  codeInput.placeholder = 'CODE';
  const joinBtn = document.createElement('button');
  joinBtn.type = 'button'; joinBtn.textContent = 'Join by code';
  const createBtn = document.createElement('button');
  createBtn.type = 'button'; createBtn.textContent = 'Create match';
  const startBtn = document.createElement('button');
  startBtn.type = 'button'; startBtn.textContent = 'Start match';
  const leaveBtn = document.createElement('button');
  leaveBtn.type = 'button'; leaveBtn.textContent = 'Leave my match';
  controls.appendChild(createBtn); controls.appendChild(joinBtn);
  controls.appendChild(codeInput); controls.appendChild(startBtn); controls.appendChild(leaveBtn);
  const mpContainer = $('mpGameContainer');
  const anchor = mpContainer || section.firstChild;
  section.insertBefore(lobby, anchor);
  section.insertBefore(controls, anchor);

  const hud = document.createElement('div');
  hud.id = 'mpHud';
  section.appendChild(hud);

  // ---------------------------------------------------------------- state
  let myCode = null, mySeat = -1, myName = '';
  let snap = null, prevSnap = null, snapAt = 0, snapGap = 120, lastTick = -1, lastStatus = '', connLost = false;
  let pollTimer = null, lobbyTimer = null, startedAt = 0;
  let running = false;

  // A round trip to the VPS costs ~140 ms (the box lives in France, the player in
  // Brazil). The old loop paid that latency SEQUENTIALLY (await, then sleep 250 ms),
  // which capped the whole game at ~2.5 fps. Two changes, both invisible to the sim:
  //   1. polls are scheduled START-TO-START, so the request latency overlaps the next
  //      poll instead of adding to it -> the poll rate is 1/latency, not 1/(latency+250);
  //   2. the input rides on the state GET as query params, so one SIMPLE request per
  //      poll (a GET with no custom headers never triggers a CORS preflight, which
  //      used to double every input round trip).
  const POLL_MS = 120;

  const nameOf = () => {
    const inp = document.getElementById('playerName');
    if (window.pcName) { const n = window.pcName(); if (n) return n; }
    return (inp && inp.value || 'Anônimo').trim() || 'Anônimo';
  };

  async function getJson(path) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 3000);
    try {
      const r = await fetch(API() + path, { signal: ac.signal });
      if (!r.ok) return null;
      return JSON.parse(await r.text());
    } catch (_) { return null; }
    finally { clearTimeout(t); }
  }
  async function postJson(path, obj) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 3000);
    try {
      const r = await fetch(API() + path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(obj), signal: ac.signal,
      });
      if (!r.ok) return null;
      return JSON.parse(await r.text());
    } catch (_) { return null; }
    finally { clearTimeout(t); }
  }

  // ---------------------------------------------------------------- lobby render
  function renderLobby(rows) {
    lobby.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'mp-row';
    if (!rows) { head.textContent = 'Multiplayer server unreachable — try again in a few seconds'; lobby.appendChild(head); return; }
    if (!rows.length) { head.textContent = 'No open match. Create one and share its code.'; lobby.appendChild(head); return; }
    for (const r of rows) {
      const row = document.createElement('div');
      row.className = 'mp-row';
      const who = (r.players || []).map((p) => p.name + (p.offline ? ' 💡' : '')).join(' · ');
      row.innerHTML = '<b>' + r.code + '</b> · fase ' + r.level + ' · ' + (r.seats) + '/4 · ' +
        (r.status === 'live' ? 'playing' : 'waiting') + (who ? ' — ' + who : '');
      if (r.code === myCode) row.classList.add('mp-mine');
      lobby.appendChild(row);
    }
  }

  async function refreshLobby() {
    const rows = await getJson('/api/mp/lobby');
    renderLobby(rows);
  }

  // ---------------------------------------------------------------- actions
  async function doCreate() {
    const d = await postJson('/api/mp/create', { name: nameOf(), mode: 'normal' });
    if (!d || !d.ok) { flashMsg('Could not create the match'); return; }
    myCode = d.code; mySeat = d.seat;
    startedAt = Date.now();
    overlay.style.display = 'none';
    flashMsg('Match ' + myCode + ' — share the code!');
    if (d.snapshot) { snap = d.snapshot; lastTick = snap.t; }
    startLoop();
  }
  async function doJoin() {
    const code = (codeInput.value || '').trim().toUpperCase();
    if (!/^[A-Z2-9]{4}$/.test(code)) { flashMsg('Type the 4-character code'); return; }
    const d = await postJson('/api/mp/join', { code, name: nameOf() });
    if (!d || !d.ok) { flashMsg('Match not found — check the code'); return; }
    myCode = code; mySeat = d.seat;
    if (d.snapshot) { snap = d.snapshot; lastTick = snap.t; }
    overlay.style.display = 'none';
    startLoop();
  }
  async function doStart() {
    if (!myCode) { flashMsg('Create or join a match first'); return; }
    const d = await postJson('/api/mp/start', { code: myCode });
    if (!d || !d.ok) { flashMsg('Cannot start yet'); return; }
    if (d.snapshot) { snap = d.snapshot; lastTick = snap.t; }
  }
  async function doLeave() {
    if (!myCode) return;
    await postJson('/api/mp/leave', { code: myCode, seat: mySeat });
    flashMsg('You left (the ship freezes — send input again to come back)');
  }

  let msgText = '', msgTimer = 0;
  function flashMsg(t) { msgText = t; msgTimer = 4000; }

  createBtn.addEventListener('click', () => doCreate());
  joinBtn.addEventListener('click', () => doJoin());
  startBtn.addEventListener('click', () => doStart());
  leaveBtn.addEventListener('click', () => doLeave());
  mpStart.addEventListener('click', () => doCreate());
  mpRestart.addEventListener('click', () => { if (myCode) postJson('/api/mp/restart', { code: myCode }); });

  // ---------------------------------------------------------------- input
  const keys = { left: false, right: false, up: false, down: false, shoot: false };
  // A key/stick change is pushed to the socket the instant it happens (throttled
  // to 40 ms), so the server sees the command at press time - not at poll time.
  let lastSentInput = 0;
  function sendInputNow() {
    if (!wsSock || mySeat < 0) return;
    const now = Date.now();
    if (now - lastSentInput < 40) return;
    lastSentInput = now;
    const inp = currentInput();
    try { wsSock.send(JSON.stringify({ s: mySeat, i: [inp.mx, inp.my, inp.fire ? 1 : 0] })); }
    catch (_) {}
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') keys.left = true;
    if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') keys.right = true;
    if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') keys.up = true;
    if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') keys.down = true;
    if (e.key === ' ') keys.shoot = true;
    sendInputNow();
  });
  document.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') keys.left = false;
    if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') keys.right = false;
    if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') keys.up = false;
    if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') keys.down = false;
    if (e.key === ' ') keys.shoot = false;
    sendInputNow();
  });

  // Mobile: analog stick in a fixed zone LEFT of the fire button, so the finger
  // never covers the ships. Own ids — never touches window.siStick (single player).
  const mobile = document.createElement('div');
  mobile.id = 'mpMobileControls';
  const stickZone = document.createElement('div');
  stickZone.id = 'mpStickZone';
  stickZone.setAttribute('aria-label', 'Control de movement: touch and drag to move the ship');
  const base = document.createElement('div');
  base.style.cssText = 'position:absolute;left:50%;top:50%;width:110px;height:110px;border-radius:50%;transform:translate(-50%,-50%);pointer-events:none;background:rgba(40,46,90,.35);border:2px solid rgba(120,140,255,.55);';
  const knob = document.createElement('div');
  knob.style.cssText = 'position:absolute;left:50%;top:50%;width:60px;height:60px;border-radius:50%;transform:translate(-50%,-50%);pointer-events:none;background:rgba(120,140,255,.55);border:2px solid rgba(180,200,255,.9);';
  stickZone.appendChild(base); stickZone.appendChild(knob);
  mobile.appendChild(stickZone);
  const fireBtn = document.createElement('button');
  fireBtn.type = 'button'; fireBtn.textContent = '🔥'; fireBtn.setAttribute('aria-label', 'Fire');
  mobile.appendChild(fireBtn);
  section.appendChild(mobile);

  const STICK_RADIUS = 48;
  let stick = { x: 0, y: 0 }, stickPointer = null;
  function setStick(nx, ny) { stick.x = Math.max(-1, Math.min(1, nx)); stick.y = Math.max(-1, Math.min(1, ny)); }
  function resetStick() { setStick(0, 0); knob.style.left = '50%'; knob.style.top = '50%'; stickPointer = null; }
  stickZone.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    stickPointer = ev.pointerId;
    if (stickZone.setPointerCapture) stickZone.setPointerCapture(ev.pointerId);
    moveStick(ev);
  });
  stickZone.addEventListener('pointermove', (ev) => { if (stickPointer === ev.pointerId) moveStick(ev); });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    stickZone.addEventListener(t, (ev) => { if (stickPointer === ev.pointerId) resetStick(); });
  }
  function moveStick(ev) {
    const r = stickZone.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const dx = ev.clientX - cx, dy = ev.clientY - cy;
    const len = Math.hypot(dx, dy) || 1;
    const pull = Math.min(len, STICK_RADIUS) / STICK_RADIUS;
    setStick((dx / len) * pull, (dy / len) * pull);
    knob.style.left = (50 + (dx / len) * pull * 40) + '%';
    knob.style.top = (50 + (dy / len) * pull * 40) + '%';
  }
  let fireHeld = null;
  fireBtn.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    if (fireHeld !== null) return;
    fireHeld = ev.pointerId;
    fireBtn.classList.add('pressed');
    if (fireBtn.setPointerCapture) fireBtn.setPointerCapture(ev.pointerId);
  });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    fireBtn.addEventListener(t, (ev) => {
      if (fireHeld !== null && fireHeld !== ev.pointerId) return;
      fireHeld = null; fireBtn.classList.remove('pressed');
    });
  }
  window.addEventListener('blur', () => { resetStick(); fireHeld = null; keys.left = keys.right = keys.up = keys.down = keys.shoot = false; });

  function currentInput() {
    const mx = (Number(keys.right) - Number(keys.left)) + stick.x;
    const my = (Number(keys.down) - Number(keys.up)) + stick.y;
    return { mx: Math.max(-1, Math.min(1, mx)), my: Math.max(-1, Math.min(1, my)), fire: keys.shoot || fireHeld !== null };
  }

  // ---------------------------------------------------------------- loop
  function handleSnapshot(s) {
    connLost = false;
    const now = Date.now();
    snapGap = snapAt ? Math.min(400, now - snapAt) : POLL_MS; // push arrives every 50 ms, polling every ~150
    prevSnap = snap; snap = s; snapAt = now;
    if (s.t !== lastTick || s.st !== lastStatus) { lastTick = s.t; lastStatus = s.st; drawHud(s); }

    // Auto-start: the host opens the match once 4 seats are in, or after 20 s.
    if (s.st === 'waiting' && mySeat === 0) {
      const seats = (s.ps || []).length;
      if (seats >= 4 || Date.now() - startedAt > 20000) doStart();
    }

    if (s.st === 'over') endMatch(s);
  }

  async function tick() {
    if (!myCode) return;
    // Input travels ON the state request: the server applies it and answers with the
    // snapshot in one round trip. A GET with no body and no custom headers is a
    // "simple" CORS request, so the browser never sends an OPTIONS preflight here.
    const inp = currentInput();
    const s = await getJson('/api/mp/state?code=' + encodeURIComponent(myCode)
      + '&seat=' + mySeat + '&mx=' + inp.mx + '&my=' + inp.my + '&fire=' + (inp.fire ? 1 : 0));
    if (!s) {
      if (snap) connLost = true;             // keep the last frame, say so
      return;
    }
    handleSnapshot(s);
  }

  // ---------------------------------------------------------------- Phase 6: WS transport
  // HTTP polling (Phase 5) pays a full round trip per poll - measured 150 ms to 2 s
  // from Brazil to this box - which is exactly the "controls respond late" problem.
  // A WebSocket is ONE persistent connection: the server PUSHES a snapshot every
  // tick (20 Hz) and the client SENDS input fire-and-forget, so input lag collapses
  // to the sim tick. If the socket cannot open (proxy without upgrade mapping, an
  // extension, a flaky network) the polling loop below takes over automatically.
  let wsSock = null, wsAlive = false, wsInputTimer = null;

  function openSocket() {
    if (!myCode || wsSock) return;
    const base = API() || (location.protocol + '://' + location.host);
    let url;
    try { url = base.replace(/^http/, 'ws') + '/api/mp/ws?code=' + encodeURIComponent(myCode); }
    catch (_) { return; }
    let sock;
    try { sock = new WebSocket(url); } catch (_) { return; }
    wsSock = sock; wsAlive = true;

    sock.addEventListener('message', (ev) => {
      let s;
      try { s = JSON.parse(ev.data); } catch (_) { return; }
      if (s && s.ok !== false && (s.ps || s.st)) handleSnapshot(s);
    });
    const drop = () => {
      if (wsSock !== sock) return;
      wsSock = null; wsAlive = false;
      if (wsInputTimer) { clearInterval(wsInputTimer); wsInputTimer = null; }
      // The socket died mid-match: fall back to the polling path, never die.
      if (running && myCode) startPolling();
    };
    sock.addEventListener('error', drop);
    sock.addEventListener('close', drop);

    // Input rides every 150 ms whether or not it changed - the server also uses
    // lastInput to mark idle seats offline, so a held-still player must stay alive.
    wsInputTimer = setInterval(() => {
      if (!wsAlive || !wsSock || mySeat < 0) return;
      const inp = currentInput();
      try { wsSock.send(JSON.stringify({ s: mySeat, i: [inp.mx, inp.my, inp.fire ? 1 : 0] })); }
      catch (_) { drop(); }
    }, 150);
  }

  function startPolling() {
    if (pollTimer || wsSock) return;
    const step = async () => {
      if (!running || wsSock) return;
      await tick();
      const now = Date.now();
      pollTimer = setTimeout(step, Math.max(0, (next += POLL_MS) - now));
    };
    let next = Date.now();
    step();
  }

  function startLoop() {
    if (running) return;
    running = true;
    // Preferred transport: one persistent socket, push snapshots + send input.
    openSocket();
    // If the socket never opened (no WebSocket in this context, proxy refused the
    // upgrade), the polling path is the fallback - it is what Phase 5 made playable.
    if (!wsSock) startPolling();
    // Rendering is decoupled from transport: the canvas repaints at the display
    // refresh rate, interpolating between the last two snapshots. 20 Hz sim +
    // push or poll still looks like a 60 fps game whatever the network does.
    const frame = () => {
      if (!running) return;
      drawFrame();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
  function stopLoop() {
    running = false;
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    if (wsInputTimer) { clearInterval(wsInputTimer); wsInputTimer = null; }
    if (wsSock) { try { wsSock.close(); } catch (_) {} wsSock = null; wsAlive = false; }
  }

  // ---------------------------------------------------------------- HUD
  function drawHud(s) {
    hud.innerHTML = '';
    if (!s) return;
    const total = document.createElement('span');
    total.className = 'mp-seat';
    total.textContent = 'TEAM ' + (s.total || 0) + ' · fase ' + s.lv;
    hud.appendChild(total);
    for (const p of (s.ps || [])) {
      const el = document.createElement('span');
      el.className = 'mp-seat';
      el.style.color = p[8];
      el.textContent = p[1] + ' · ' + p[5] + ' · ' + '❤'.repeat(Math.max(0, p[4])) + (p[7] ? ' 💡' : '') + (p[6] ? '' : ' ✝');
      hud.appendChild(el);
    }
    if (myCode) {
      const mine = document.createElement('span');
      mine.className = 'mp-seat';
      mine.textContent = 'code ' + myCode;
      hud.appendChild(mine);
    }
  }

  // ---------------------------------------------------------------- draw
  const ENEMY_COLOR = { basic: '#ff3366', zigzag: '#f093fb', sniper: '#ffcc00', armored: '#00bbee' };
  const PU_COLOR = { speed: '#0088ff', multishot: '#ff8800', bomb: '#ffff00', shield: '#00ff88', rapidfire: '#ffffaa' };
  const PU_GLYPH = { speed: '⚡', multishot: '🔥', bomb: '💣', shield: 'S', rapidfire: 'R' };

  function draw(s) {
    ctx.fillStyle = '#101329';
    ctx.fillRect(0, 0, CW, CH);
    if (!s) {
      ctx.fillStyle = '#5a6bb8';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Create or join a match to start', CW / 2, CH / 2);
      return;
    }
    for (let i = 0; i < 35; i++) { ctx.fillStyle = '#283452'; ctx.fillRect((i * 97) % CW, (i * 137) % CH, 2, 2); }

    if (s.wr >= 0) {
      ctx.fillStyle = 'rgba(255,60,70,.18)'; ctx.fillRect(s.wr - 22, 0, 44, CH);
      ctx.strokeStyle = '#ff5566'; ctx.strokeRect(s.wr - 22, 0, 44, CH);
    }
    if (s.la >= 0) {
      ctx.fillStyle = 'rgba(255,90,100,.4)'; ctx.fillRect(s.la - 10, 0, 20, CH);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(s.la - 3, 0, 6, CH);
    }

    for (const e of s.en) {
      const x = e[0], y = e[1], type = e[2], hp = e[3];
      ctx.fillStyle = ENEMY_COLOR[type] || '#ff3366';
      ctx.fillRect(x + 3, y, 34 - 6, 25 - 5); ctx.fillRect(x, y + 9, 34, 8);
      ctx.fillStyle = '#101329'; ctx.fillRect(x + 9, y + 8, 4, 4); ctx.fillRect(x + 34 - 13, y + 8, 4, 4);
      if (hp > 1) { ctx.fillStyle = '#fff'; ctx.fillRect(x + 5, y - 4, 34 - 10, 2); }
    }

    if (s.b) {
      const [, bx, by, bw, bh, bhp, bmax, kind] = s.b;
      const body = ['#3f6fd0', '#8b3fa8', '#c9a227'][kind];
      const trim = ['#7fd4ff', '#f093fb', '#ffcc00'][kind];
      ctx.fillStyle = body; ctx.fillRect(bx, by + 10, bw, bh - 10);
      ctx.fillStyle = trim; ctx.fillRect(bx + 8, by + bh - 12, 14, 10); ctx.fillRect(bx + bw - 22, by + bh - 12, 14, 10);
      ctx.fillStyle = '#101329'; ctx.fillRect(bx + 26, by + 16, 12, 10); ctx.fillRect(bx + bw - 38, by + 16, 12, 10);
      // boss HP bar above the sprite, so every device reads the same state
      ctx.fillStyle = '#342039'; ctx.fillRect(bx, by - 10, bw, 5);
      ctx.fillStyle = '#ff3366'; ctx.fillRect(bx, by - 10, bw * Math.max(0, bhp / bmax), 5);
    }

    ctx.fillStyle = '#00ff88';
    for (const b of s.bl) ctx.fillRect(b[0], b[1], b[2], b[3]);
    ctx.fillStyle = '#ff5577';
    for (const b of s.eb) ctx.fillRect(b[0], b[1], b[2], b[3]);

    for (const p of s.pu) {
      ctx.fillStyle = PU_COLOR[p[2]] || '#ffff00';
      ctx.fillRect(p[0], p[1], 20, 20);
      ctx.fillStyle = '#101329'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(PU_GLYPH[p[2]] || '?', p[0] + 10, p[1] + 15);
    }

    for (const p of s.pa) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p[2] * 2));
      ctx.fillStyle = p[3];
      ctx.fillRect(p[0], p[1], 3, 3);
    }
    ctx.globalAlpha = 1;

    // Four ships, four colors, name tag each — the heart of the co-op view.
    for (const p of s.ps) {
      const [, , x, y, lives, , alive, offline, color] = p;
      if (!alive) continue;                       // respawn handled server-side
      ctx.globalAlpha = offline ? 0.35 : 1;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 40, 20);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 20, y - 12); ctx.lineTo(x + 40, y); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(p[1], x + 20, y + 34);
      ctx.fillText('❤'.repeat(Math.max(0, lives)), x + 20, y + 46);
    }

    if (s.fl > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (s.fl / 450) + ')'; ctx.fillRect(0, 0, CW, CH); }

    if (s.story) {
      ctx.fillStyle = 'rgba(8,10,30,.86)';
      ctx.fillRect(0, CH * 0.3, CW, 96);
      ctx.fillStyle = '#00f2fe'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(s.story.title, CW / 2, CH * 0.3 + 26);
      ctx.fillStyle = '#cfd6ff'; ctx.font = '13px sans-serif';
      ctx.fillText(s.story.text, CW / 2, CH * 0.3 + 52);
    }

    if (msgTimer > 0) {
      ctx.fillStyle = '#ffe35a'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(msgText, CW / 2, 22);
    }
    if (connLost) {
      ctx.fillStyle = '#ff5566'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('connection lost — retrying', CW / 2, CH - 20);
    }
  }

  // ---------------------------------------------------------------- smooth render
  // Snapshots only change every server tick (20 Hz) and arrive every poll (~140 ms),
  // so drawing them raw would crawl at 2-3 fps. Instead every frame blends the
  // previous snapshot into the current one, which keeps motion continuous at the
  // display refresh rate whatever the network is doing. Entities are matched by index
  // (the sim keeps them in order); a big jump or a type change means "not the same
  // thing", so that row is drawn as-is instead of streaking across the screen.
  function lerpSnap(a, b, t) {
    if (!a || !b) return b;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const rows = (prev, cur, xi, yi, maxd, ki) => {
      const out = [];
      for (let i = 0; i < cur.length; i++) {
        const q = cur[i].slice();
        const o = prev && prev[i];
        if (o && (ki < 0 || o[ki] === q[ki])) {
          const dx = q[xi] - o[xi], dy = q[yi] - o[yi];
          if (Math.abs(dx) <= maxd && Math.abs(dy) <= maxd) {
            q[xi] = o[xi] + dx * t;
            q[yi] = o[yi] + dy * t;
          }
        }
        out.push(q);
      }
      return out;
    };
    const one = (p, c, maxd) => (p == null || c == null || Math.abs(c - p) > maxd) ? c : p + (c - p) * t;
    let boss = b.b;
    if (a.b && b.b && a.b[7] === b.b[7] && Math.abs(b.b[1] - a.b[1]) < 60 && Math.abs(b.b[2] - a.b[2]) < 60) {
      boss = b.b.slice();
      boss[1] = a.b[1] + (b.b[1] - a.b[1]) * t;
      boss[2] = a.b[2] + (b.b[2] - a.b[2]) * t;
    }
    return {
      ...b,
      ps: rows(a.ps, b.ps, 2, 3, 60, 0),      // [seat,name,x,y,...] — seat is the key
      en: rows(a.en, b.en, 0, 1, 40, 2),      // [x,y,type,hp]
      bl: rows(a.bl, b.bl, 0, 1, 90, -1),     // player bullets travel far per poll
      eb: rows(a.eb, b.eb, 0, 1, 90, -1),
      pu: rows(a.pu, b.pu, 0, 1, 30, 2),      // [x,y,type]
      pa: rows(a.pa, b.pa, 0, 1, 60, -1),
      wr: one(a.wr, b.wr, 60),
      la: one(a.la, b.la, 60),
      b: boss,
    };
  }

  let lastFrame = 0;
  function drawFrame() {
    const now = Date.now();
    if (msgTimer > 0) msgTimer -= lastFrame ? now - lastFrame : 0;
    lastFrame = now;
    const t = prevSnap && snap ? (now - snapAt) / snapGap : 0;
    const view = t > 0 ? lerpSnap(prevSnap, snap, t) : snap;
    if (view !== snap) predictOwn(view, now);   // never mutate the stored snapshot
    draw(view);
  }

  // Own-ship prediction (client-side lag compensation): the server has the input
  // but the snapshot carrying its effect is still in flight, so between snapshots
  // the client extrapolates ITS OWN ship using the input it already sent. The
  // server's next snapshot is authoritative and corrects any drift. Only the
  // local ship is predicted - the other three come from the shared world.
  function predictOwn(view, now) {
    if (!view || !view.ps || mySeat < 0) return;
    if (!wsAlive) return;                       // polling path already waits for the server
    const dt = Math.min(0.25, (now - snapAt) / 1000);
    if (dt <= 0.02) return;
    const inp = currentInput();
    for (const p of view.ps) {
      if (p[0] !== mySeat) continue;
      if (!p[6]) return;                        // dead/respawning: nothing to move
      const speed = 250 * (p[10] || 1);
      p[2] = Math.max(0, Math.min(500 - 40, p[2] + inp.mx * speed * dt));
      p[3] = Math.max(600 * 0.45, Math.min(600 - 20, p[3] + inp.my * speed * dt));
    }
  }

  function endMatch(s) {
    stopLoop();
    const mine = (s.ps || []).find((p) => p[0] === mySeat);
    overlay.style.display = 'flex';
    const title = $('mpTitle');
    if (title) title.textContent = 'Match over · fase ' + s.lv;
    const box = overlay.querySelector('.overlay-content');
    if (box) {
      const p = document.createElement('p');
      p.textContent = 'Team: ' + (s.total || 0) + ' · you: ' + (mine ? mine[5] : 0);
      box.appendChild(p);
    }
    mpStart.style.display = '';
    mpRestart.style.display = '';
    // Only the local player posts their own score, through the existing bridge.
    if (mine && window.submitScore) window.submitScore('si_mp', mine[5]);
    myCode = null; mySeat = -1;
  }

  // ---------------------------------------------------------------- open/close
  function open() {
    startLobby();
    if (!myCode) {
      overlay.style.display = 'flex';
      mpStart.style.display = '';
      mpRestart.style.display = '';
      drawFrame();
      return;
    }
    startLoop();
  }
  function close() {
    stopLoop();
    if (lobbyTimer) { clearTimeout(lobbyTimer); lobbyTimer = null; }
  }

  // The icon lives INSIDE the section, so both click paths must collapse into ONE
  // toggle guarded by the event timeStamp — same pattern script.js uses, or a
  // single click would open and immediately close the section.
  let handled = null;
  function toggle(stamp) {
    if (stamp === handled) return;
    handled = stamp;
    const wasCollapsed = section.classList.contains('minimized');
    section.classList.toggle('minimized');
    // Keep the card expanded while any game is open, like script.js does.
    const card = document.querySelector('.card');
    if (card) {
      const anyOpen = !$('targetGameSection').classList.contains('minimized')
        || !$('siGameSection').classList.contains('minimized')
        || !$('arkanoidGameSection').classList.contains('minimized')
        || !section.classList.contains('minimized');
      card.classList.toggle('game-open', anyOpen);
    }
    if (wasCollapsed) open(); else close();
  }
  mpIcon.addEventListener('click', (e) => toggle(e.timeStamp));
  section.addEventListener('click', (e) => {
    if (section.classList.contains('minimized')) toggle(e.timeStamp);
  });

  if (!section.classList.contains('minimized')) open();
})();
