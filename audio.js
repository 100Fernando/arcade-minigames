// Audio procedural para Space Invaders: Ultima Defesa.
// Carregue este arquivo DEPOIS de script.js.
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const section = $('siGameSection');
  const start = $('siStartBtn');
  const restart = $('siRestartBtn');
  if (!section || !start || !restart) return;

  const AudioClass = window.AudioContext || window.webkitAudioContext;
  let context = null;
  let master = null;
  let enabled = true;
  let volume = 0.45;
  let lastShot = 0;
  let lastImpact = 0;
  let lastBossHit = 0;
  let lastMusic = 0;
  let musicStep = 0;
  try {
    enabled = localStorage.getItem('siSoundEnabled') !== 'false';
    const saved = Number(localStorage.getItem('siSoundVolume'));
    if (Number.isFinite(saved) && saved >= 0 && saved <= 1 && localStorage.getItem('siSoundVolume') !== null) volume = saved;
  } catch (_) { /* Armazenamento opcional. */ }

  function init() {
    if (!AudioClass || !enabled) return false;
    try {
      if (!context) {
        context = new AudioClass();
        master = context.createGain();
        master.gain.value = volume;
        master.connect(context.destination);
      }
      if (context.state === 'suspended') context.resume().catch(() => {});
      return true;
    } catch (_) { return false; }
  }
  function persist() {
    try {
      localStorage.setItem('siSoundEnabled', String(enabled));
      localStorage.setItem('siSoundVolume', String(volume));
    } catch (_) {}
  }
  function tone(freq, duration, options = {}) {
    if (!enabled || !init() || context.state === 'closed') return;
    try {
      const when = context.currentTime + (options.delay || 0);
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = options.wave || 'square';
      osc.frequency.setValueAtTime(Math.max(20, freq), when);
      if (options.end) osc.frequency.exponentialRampToValueAtTime(Math.max(20, options.end), when + duration);
      const peak = Math.min(0.25, options.gain || 0.07);
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(peak, when + Math.min(0.012, duration / 3));
      gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start(when);
      osc.stop(when + duration + 0.01);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    } catch (_) { /* O jogo continua funcionando sem audio. */ }
  }
  const effects = {
    start() { tone(440, .12, {end: 660, wave: 'triangle'}); tone(660, .17, {delay: .13, end: 880, wave: 'triangle'}); },
    shoot() { tone(780, .075, {end: 260, gain: .045}); },
    impact() { tone(180, .10, {end: 65, wave: 'sawtooth', gain: .06}); },
    bossHit() { tone(100, .13, {end: 55, wave: 'triangle', gain: .065}); },
    hurt() { tone(380, .24, {end: 75, wave: 'sawtooth', gain: .12}); },
    power() { [520, 660, 820].forEach((n, i) => tone(n, .13, {delay: i * .09, wave: 'sine', gain: .075})); },
    alert() { tone(330, .16, {end: 220, gain: .09}); tone(330, .16, {delay: .22, end: 220, gain: .09}); },
    chapter() { [330, 440, 550].forEach((n, i) => tone(n, .22, {delay: i * .14, wave: 'triangle', gain: .055})); },
    gameover() { [440, 330, 220, 110].forEach((n, i) => tone(n, .26, {delay: i * .2, wave: 'triangle', gain: .075})); },
    victory() { [392, 523, 659, 784].forEach((n, i) => tone(n, .28, {delay: i * .16, wave: 'triangle', gain: .075})); }
  };

  // Sound effects for Jogo de Alvos: script.js calls window.tgSfx lazily (it loads before this file).
  window.tgSfx = {
    hit: () => tone(880, .06, {wave: 'triangle', gain: .05}),
    decoy: () => tone(200, .18, {end: 60, wave: 'sawtooth', gain: .10}),
    miss: () => tone(320, .20, {end: 90, wave: 'sawtooth', gain: .09}),
    wave: () => [520, 660, 780].forEach((n, i) => tone(n, .12, {delay: i * .08, wave: 'sine', gain: .06})),
    gameover: () => effects.gameover(),
    shield: () => tone(660, .14, {end: 990, wave: 'sine', gain: .07}),
    power: () => [660, 880].forEach((n, i) => tone(n, .09, {delay: i * .07, wave: 'triangle', gain: .06})),
    boss: () => [220, 180, 140].forEach((n, i) => tone(n, .22, {delay: i * .18, wave: 'triangle', gain: .09}))
  };

  // Controles de audio integrados a area do jogo.
  const panel = document.createElement('div');
  panel.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;margin:10px 0;color:#fff;font:13px sans-serif';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.style.cssText = 'padding:7px 12px;border:1px solid #667eea;border-radius:8px;background:#24243e;color:#fff;cursor:pointer';
  toggle.setAttribute('aria-label', 'Ativar ou desativar o som do jogo');
  const rangeLabel = document.createElement('label');
  rangeLabel.textContent = 'Volume ';
  const range = document.createElement('input');
  range.type = 'range'; range.min = '0'; range.max = '100'; range.value = String(Math.round(volume * 100));
  range.setAttribute('aria-label', 'Volume do jogo');
  range.style.cssText = 'vertical-align:middle;width:100px';
  rangeLabel.appendChild(range);
  panel.append(toggle, rangeLabel);
  const gameContainer = $('siGameContainer');
  section.insertBefore(panel, gameContainer || null);
  function renderToggle() { toggle.textContent = enabled ? '🔊 Som ligado' : '🔇 Som desligado'; toggle.setAttribute('aria-pressed', String(enabled)); }
  renderToggle();
  toggle.addEventListener('click', () => {
    enabled = !enabled; persist(); renderToggle();
    if (master && context) master.gain.setTargetAtTime(enabled ? volume : 0, context.currentTime, 0.01);
    if (enabled) { init(); effects.power(); }
  });
  range.addEventListener('input', () => {
    volume = Number(range.value) / 100;
    if (master && context) master.gain.setTargetAtTime(enabled ? volume : 0, context.currentTime, 0.02);
    persist();
  });

  const overlay = $('siOverlay');
  const story = $('siStoryTitle');
  // O script do jogo cria a historia dinamicamente, antes de audio.js ser carregado.
  const storyScreen = story ? story.parentElement.parentElement : null;
  const siSection = $('siGameSection');
  const collapsed = () => siSection && siSection.classList.contains('minimized');
  const running = () => !collapsed() && overlay && overlay.style.display === 'none' &&
    (!storyScreen || storyScreen.style.display !== 'flex');

  // A interacao com Start/Continuar desbloqueia AudioContext segundo as regras dos navegadores.
  start.addEventListener('click', () => { if (enabled) { init(); effects.start(); } });
  restart.addEventListener('click', () => { if (enabled) { init(); effects.start(); } });
  const continueBtn = $('siContinue');
  if (continueBtn) continueBtn.addEventListener('click', () => { if (enabled) { init(); effects.chapter(); } });

  // A tecla espaco so toca quando o jogo aceita entrada; limitador evita ruido excessivo.
  document.addEventListener('keydown', event => {
    if (event.code !== 'Space' && event.key !== ' ') return;
    if (!running()) return;
    const now = performance.now();
    if (now - lastShot < 140) return;
    lastShot = now;
    effects.shoot();
  });
  // Ao segurar espaco, o jogo dispara automaticamente. Reproduzimos o mesmo ritmo aproximado.
  let held = false;
  document.addEventListener('keydown', event => { if (event.code === 'Space' || event.key === ' ') held = true; });
  document.addEventListener('keyup', event => { if (event.code === 'Space' || event.key === ' ') held = false; });
  window.addEventListener('blur', () => { held = false; });
  setInterval(() => {
    if (!held || !running()) return;
    const now = performance.now();
    if (now - lastShot >= 165) { lastShot = now; effects.shoot(); }
  }, 50);

  function observe(id, onChange) {
    const element = $(id);
    if (!element || typeof MutationObserver === 'undefined') return;
    let previous = element.textContent;
    const observer = new MutationObserver(() => {
      const value = element.textContent;
      if (value === previous) return;
      const before = previous;
      previous = value;
      onChange(value, before);
    });
    observer.observe(element, {subtree: true, childList: true, characterData: true});
  }
  observe('siScore', (value, before) => {
    if (!running() || Number(value) <= Number(before)) return;
    const now = performance.now();
    if (now - lastImpact > 75) { lastImpact = now; effects.impact(); }
  });
  observe('siLives', (value, before) => {
    if (value.length < before.length && running()) effects.hurt();
  });
  observe('siSpeed', (value, before) => {
    if (parseFloat(value) > parseFloat(before) && running()) effects.power();
  });
  observe('siPowerUps', (value, before) => {
    if (value.length > before.length && running()) effects.power();
  });
  observe('siBossName', (value, before) => {
    if (!running() || !before || !value) return;
    const prev = Number((before.match(/(\d+)\s*PV/) || [])[1]);
    const next = Number((value.match(/(\d+)\s*PV/) || [])[1]);
    const now = performance.now();
    if (next < prev && now - lastBossHit > 90) { lastBossHit = now; effects.bossHit(); }
  });
  observe('siStoryTitle', value => {
    if (value.startsWith('ALERTA:')) effects.alert();
    else if (value.startsWith('Vitória:')) effects.victory();
    else if (value) effects.chapter();
  });
  observe('siTitle', value => {
    if (value.startsWith('Fim de jogo')) effects.gameover();
    if (value === 'Vitória!') effects.victory();
  });

  // Trilha ambiente sintetizada, discreta e apenas enquanto a partida esta ativa.
  const bass = [110, 110, 130.81, 98, 110, 146.83, 130.81, 98];
  setInterval(() => {
    if (!enabled || !running() || !context || context.state !== 'running') return;
    const now = performance.now();
    if (now - lastMusic < 380) return;
    lastMusic = now;
    tone(bass[musicStep % bass.length], .26, {wave:'sine',gain:.018});
    if (musicStep % 4 === 0) tone(55, .09, {wave:'triangle',gain:.025});
    musicStep++;
  }, 390);

  // Trilha ambiente para Jogo de Alvos: brighter, playful pentatonic arpeggio
  // (marimba-like) with a soft bass pulse — deliberately different from the
  // Space Invaders minor-key sine bass. Loops only while the alvos game is open
  // and not game-over, and respects the same sound toggle/volume as the rest.
  const tgSection = $('targetGameSection');
  const tgBoard = $('gameBoard');
  const tgOverlay = tgBoard ? tgBoard.querySelector('.tg-overlay') : null;
  const tgRunning = () => tgSection && !tgSection.classList.contains('minimized') &&
    tgOverlay && tgOverlay.style.display !== 'flex';
  const tgMelody = [523.25, 659.25, 783.99, 659.25, 587.33, 783.99, 880.00, 659.25]; // C5 E5 G5 E5 D5 G5 A5 E5
  const tgBass = [130.81, 0, 196.00, 0, 130.81, 0, 196.00, 0]; // C3 · G3 · C3 · G3
  let tgMusicStep = 0, lastTgMusic = 0;
  setInterval(() => {
    if (!enabled || !tgRunning()) return;
    if (!context || context.state !== 'running') { if (!init()) return; }
    const now = performance.now();
    if (now - lastTgMusic < 300) return;
    lastTgMusic = now;
    tone(tgMelody[tgMusicStep % tgMelody.length], .22, {wave:'triangle', gain:.022});
    const b = tgBass[tgMusicStep % tgBass.length];
    if (b) tone(b, .30, {wave:'sine', gain:.020});
    if (tgMusicStep % 8 === 4) tone(1046.50, .12, {wave:'sine', gain:.014}); // sparkle accent
    tgMusicStep++;
  }, 310);

  // ===== Arkanoid: Neon Breaker — bridge + phase-varying soundtrack =====
  // script.js loads first, so it reads window.akSfx lazily on every call.
  window.akSfx = {
    bounce: () => tone(520, .055, {end: 380, wave: 'triangle', gain: .05}),
    brick: () => { tone(880, .07, {end: 1180, wave: 'triangle', gain: .055}); tone(1320, .05, {delay: .045, wave: 'sine', gain: .03}); },
    tough: () => tone(240, .09, {end: 170, wave: 'square', gain: .05}),
    laser: () => tone(1500, .06, {end: 420, wave: 'sawtooth', gain: .05}),
    shield: () => tone(660, .14, {end: 990, wave: 'sine', gain: .07}),
    power: () => [660, 880, 1100].forEach((n, i) => tone(n, .09, {delay: i * .07, wave: 'triangle', gain: .06})),
    wave: () => [520, 660, 780, 1040].forEach((n, i) => tone(n, .13, {delay: i * .09, wave: 'sine', gain: .06})),
    bossHit: () => tone(150, .12, {end: 90, wave: 'square', gain: .07}),
    bossDown: () => [880, 660, 990, 1320].forEach((n, i) => tone(n, .2, {delay: i * .13, wave: 'triangle', gain: .08})),
    loseLife: () => [420, 300, 190].forEach((n, i) => tone(n, .18, {delay: i * .11, wave: 'sawtooth', gain: .09})),
    gameOver: () => effects.gameover(),
    victory: () => effects.victory()
  };

  const akSec = $('arkanoidGameSection');
  const akOverlay = $('akOverlay');
  const akPhaseEl = $('akPhase');
  const akRunning = () => akSec && !akSec.classList.contains('minimized') &&
    akOverlay && akOverlay.style.display === 'none';

  const akStart = $('akStartBtn'), akRestart = $('akRestartBtn');
  if (akStart) akStart.addEventListener('click', () => { if (enabled) { init(); window.akSfx.wave(); } });
  if (akRestart) akRestart.addEventListener('click', () => { if (enabled) { init(); window.akSfx.wave(); } });

  // Soundtrack: pentatonic arpeggio that transposes and speeds up every phase;
  // every third phase is a "boss" phase with a darker, minor-key motif.
  const akMajor = [0, 2, 4, 7, 9, 7, 4, 2];
  const akMinor = [0, 3, 5, 8, 10, 8, 5, 3];
  let akMusicStep = 0, lastAkMusic = 0;
  setInterval(() => {
    if (!enabled || !akRunning()) return;
    if (!context || context.state !== 'running') { if (!init()) return; }
    const phase = akPhaseEl ? (parseInt(akPhaseEl.textContent, 10) || 1) : 1;
    const boss = phase % 3 === 0;
    const period = Math.max(155, 300 - phase * 11);
    const now = performance.now();
    if (now - lastAkMusic < period) return;
    lastAkMusic = now;
    const scale = boss ? akMinor : akMajor;
    const root = (boss ? 132 : 196) * Math.pow(1.0595, (phase - 1) % 6);
    const deg = scale[akMusicStep % scale.length];
    const freq = root * Math.pow(2, deg / 12);
    tone(freq, .19, {wave: 'triangle', gain: boss ? .016 : .021});
    if (akMusicStep % 4 === 0) tone(root * .5, .26, {wave: 'sine', gain: .019});
    if (akMusicStep % 8 === 6) tone(freq * 2, .10, {wave: 'sine', gain: .013});
    if (boss && akMusicStep % 8 === 2) tone(root * .35, .22, {wave: 'sawtooth', gain: .016});
    akMusicStep++;
  }, 150);
})();
