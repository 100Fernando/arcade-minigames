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
})();
