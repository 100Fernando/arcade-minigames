// ranking.js: talks to the bridge server (same origin) and renders the board.
// A slow or dead server must never freeze the game: every fetch has a 3s timeout
// and, on failure, the block shows the fallback (records stay in localStorage).
(() => {
  const $ = id => document.getElementById(id);
  const TIMEOUT = 3000;
  // API base: absolute origin from <meta id="apiBase"> so the board works cross-origin
  // on GitHub Pages. Empty = same origin; localhost always stays same-origin so local
  // `node server.js` keeps working unchanged.
  const API = (() => {
    const m = document.getElementById('apiBase');
    if (/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(location.href)) return '';
    return (m && m.content || '').trim();
  })();
  const GAMES = {alvos: '🎯 Alvos', si: '👾 Space Invaders', arkanoid: '🧈 Arkanoid'};

  async function getJson(url) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT);
    try {
      const r = await fetch(url, {signal: ac.signal});
      if (!r.ok) return null;
      return JSON.parse(await r.text());
    } catch (_) { return null; }
    finally { clearTimeout(timer); }
  }
  async function postJson(url, obj) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT);
    try {
      const r = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(obj), signal: ac.signal});
      return r.ok;
    } catch (_) { return false; }
    finally { clearTimeout(timer); }
  }

  // Fire-and-forget: the game never waits for the network.
  window.submitScore = (game, score) => {
    const name = window.pcName ? window.pcName() : 'Anônimo';
    const token = window.googleCredential || null; // verified Google id_token, null = manual name
    (async () => {
      await postJson(API + '/api/score', {name, game, score, token});
      refresh(game); refresh('all'); // success or not, the board is re-read
    })();
  };
  window.loadRanking = game => getJson(API + '/api/ranking?game=' + encodeURIComponent(game) + '&limit=10');

  const medals = ['🥥', '🥦', '🥧'];
  const bodies = {}; // game → ranking-body element (alvos, si, all)
  function fill(body, data) {
    body.innerHTML = '';
    if (!data) {
      const s = document.createElement('p');
      s.className = 'ranking-off';
      s.textContent = 'Ranking unavailable — records stay local';
      body.appendChild(s);
      return;
    }
    if (!data.length) {
      const s = document.createElement('p');
      s.className = 'ranking-off';
      s.textContent = 'No scores yet';
      body.appendChild(s);
      return;
    }
    for (let i = 0; i < data.length; i++) {
      const line = document.createElement('div');
      line.className = 'ranking-row';
      line.textContent = (i < 3 ? medals[i] : String(i + 1) + '.') + ' ' + data[i].name + ' · ' + data[i].score;
      body.appendChild(line);
    }
  }

  function refresh(game) {
    const body = bodies[game];
    if (!body) return;
    window.loadRanking(game).then(d => fill(body, d));
  }
  function makeBlock(parent, game) {
    const box = document.createElement('div'); box.className = 'ranking-block';
    const title = document.createElement('div'); title.className = 'ranking-title';
    title.textContent = '🏆 Ranking' + (GAMES[game] ? ' · ' + GAMES[game] : ' · Global');
    const body = document.createElement('div'); body.className = 'ranking-body';
    box.appendChild(title); box.appendChild(body);
    parent.appendChild(box);
    bodies[game] = body;
    refresh(game);
    return {box, body};
  }

  // One board per game, at the end of each section.
  for (const [secId, game] of [['targetGameSection', 'alvos'], ['siGameSection', 'si'], ['arkanoidGameSection', 'arkanoid']]) {
    const sec = $(secId);
    if (sec) makeBlock(sec, game);
  }

  // Global board with the filter (All / Alvos / Space Invaders), inside the card.
  const card = document.querySelector('.card');
  if (card) {
    const global = makeBlock(card, 'all');
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Filter');
    select.style.cssText = 'display:block;margin:8px auto 0;padding:6px;border-radius:8px;background:#24243e;color:#fff;border:1px solid #667eea;font:13px sans-serif';
    for (const [v, t] of [['all', 'All'], ['alvos', '🎯 Alvos'], ['si', '👾 Space Invaders'], ['arkanoid', '🧈 Arkanoid']]) {
      const o = document.createElement('option'); o.value = v; o.textContent = t; select.appendChild(o);
    }
    try { select.value = localStorage.getItem('rankingFilter') || 'all'; } catch (_) { select.value = 'all'; }
    select.addEventListener('change', () => {
      try { localStorage.setItem('rankingFilter', select.value); } catch (_) {}
      window.loadRanking(select.value).then(d => fill(global.body, d));
    });
    global.box.appendChild(select);
  }
})();
