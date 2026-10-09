// Space Invaders - trilha original procedural e controles mobile.
// Carregue depois de script.js e audio.js.
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const section = $('siGameSection');
  const canvas = $('siCanvas');
  const start = $('siStartBtn');
  const restart = $('siRestartBtn');
  if (!section || !canvas || !start || !restart) return;

  // Responsividade sem alterar styles.css; os botoes nao cobrem o canvas.
  const css = document.createElement('style');
  css.textContent = `
    #siGameSection.minimized > *:not(.game-header) { display:none !important; }
    #siGameSection.minimized #siMobileControls { display:none !important; }
    #siCanvas { display:block; width:100%; max-width:500px; height:auto; aspect-ratio:5/6; touch-action:none; }
    #siGameSection, #siGameContainer, #siGameSection .si-game-canvas-wrapper { min-width:0; max-width:100%; }
    #siGameSection .si-game-canvas-wrapper { position:relative; }
    #siGameSection .overlay { z-index:11; }
    #siMobileControls { display:none; width:min(100%,500px); margin:14px auto 8px; gap:12px; justify-content:space-between; align-items:center; user-select:none; -webkit-user-select:none; touch-action:none; }
    #siMobileControls button { flex:1; min-width:0; min-height:68px; border:1px solid #7486ff; border-radius:16px; color:white; background:#2a2e64; font-size:27px; font-weight:700; touch-action:none; -webkit-tap-highlight-color:transparent; }
    #siMobileControls button:last-child { flex:1.25; background:#75407c; }
    #siMobileControls button:active, #siMobileControls button.pressed { background:#5669c8; transform:scale(.97); }
    @media (max-width:768px) {
      .card { width:calc(100vw - 16px); max-width:100%; padding:20px 10px; margin:8px; box-sizing:border-box; }
      .game-section { max-width:100%; }
      #siGameSection .si-game-container { width:100%; }
      #siMobileControls { display:flex; }
      #siScoreDisplay { font-size:11px !important; gap:7px !important; }
      #siGameSection .overlay-content { max-width:94%; }
    }
    @media (pointer:coarse) { #siMobileControls { display:flex; } }
  `;
  document.head.appendChild(css);
  const mobile = document.createElement('div');
  mobile.id = 'siMobileControls';
  const gameContainer = $('siGameContainer');
  const buttonSpecs = [
    ['←', 'ArrowLeft', 'Mover para a esquerda'],
    ['→', 'ArrowRight', 'Mover para a direita'],
    ['🔥', ' ', 'Atirar']
  ];
  const held = new Map();
  function send(key, type) {
    document.dispatchEvent(new KeyboardEvent(type, {
      key, code:key === ' ' ? 'Space' : key, bubbles:true, cancelable:true
    }));
  }
  function release(button, key, pointerId) {
    if (held.get(key) !== pointerId) return;
    held.delete(key);
    button.classList.remove('pressed');
    send(key, 'keyup');
  }
  for (const [text, key, description] of buttonSpecs) {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = text;
    button.setAttribute('aria-label', description);
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      if (held.has(key)) return;
      held.set(key, event.pointerId);
      button.classList.add('pressed');
      if (button.setPointerCapture) button.setPointerCapture(event.pointerId);
      send(key, 'keydown');
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      button.addEventListener(type, event => {
        event.preventDefault(); release(button, key, event.pointerId);
      });
    }
    mobile.appendChild(button);
  }
  (gameContainer || section).insertAdjacentElement('afterend', mobile);
  function releaseAll() {
    for (const [key] of held) send(key, 'keyup');
    held.clear();
    mobile.querySelectorAll('button').forEach(b => b.classList.remove('pressed'));
  }
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });

  // Musica-tema autoral gerada no navegador, sem MP3 nem download externo.
  const AudioClass = window.AudioContext || window.webkitAudioContext;
  let audio = null, bus = null, nextTime = 0, step = 0;
  let musicEnabled = true, volume = 0.45;
  try {
    musicEnabled = localStorage.getItem('siMusicEnabled') !== 'false';
    const saved = localStorage.getItem('siSoundVolume');
    if (saved !== null) volume = Math.max(0, Math.min(1, Number(saved) || 0));
  } catch (_) {}
  const musicButton = document.createElement('button');
  musicButton.type = 'button';
  musicButton.style.cssText = 'padding:7px 12px;border:1px solid #667eea;border-radius:8px;background:#24243e;color:#fff;cursor:pointer';
  musicButton.setAttribute('aria-label', 'Ativar ou desativar a musica tema');
  function showMusicButton() {
    musicButton.textContent = musicEnabled ? '🎵 Música ligada' : '🎵 Música desligada';
    musicButton.setAttribute('aria-pressed', String(musicEnabled));
  }
  showMusicButton();
  const audioPanel = section.querySelector('button[aria-label="Ativar ou desativar o som do jogo"]')?.parentElement;
  if (audioPanel) audioPanel.appendChild(musicButton);
  else { const panel = document.createElement('div'); panel.style.cssText='text-align:center;margin:8px'; panel.appendChild(musicButton); section.insertBefore(panel, gameContainer || null); }

  function effectsEnabled() {
    const effectsButton = section.querySelector('button[aria-label="Ativar ou desativar o som do jogo"]');
    return !effectsButton || effectsButton.getAttribute('aria-pressed') !== 'false';
  }
  function active() {
    return musicEnabled && effectsEnabled() && !document.hidden &&
      !$('siGameSection')?.classList.contains('minimized') &&
      $('siOverlay')?.style.display === 'none';
  }
  function initAudio() {
    if (!AudioClass || !musicEnabled) return;
    try {
      if (!audio) {
        audio = new AudioClass();
        bus = audio.createGain();
        bus.gain.value = 0;
        bus.connect(audio.destination);
      }
      if (audio.state === 'suspended') audio.resume().catch(() => {});
    } catch (_) { audio = null; bus = null; }
  }
  function syncGain() {
    if (!audio || !bus) return;
    const target = active() ? volume * 0.34 : 0;
    bus.gain.setTargetAtTime(target, audio.currentTime, 0.035);
    if (!active()) nextTime = 0;
  }
  function note(freq, when, length, wave, amplitude) {
    if (!audio || !bus || !freq) return;
    const osc = audio.createOscillator(), env = audio.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, when);
    env.gain.setValueAtTime(0.0001, when);
    env.gain.exponentialRampToValueAtTime(amplitude, when + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, when + length);
    osc.connect(env); env.connect(bus);
    osc.start(when); osc.stop(when + length + 0.02);
    osc.onended = () => { osc.disconnect(); env.disconnect(); };
  }
  // Tema: progressao Am - F - C - G, com melodia, arpejo e pulso grave.
  const chords = [
    [220.00, 261.63, 329.63],
    [174.61, 220.00, 261.63],
    [261.63, 329.63, 392.00],
    [196.00, 246.94, 293.66]
  ];
  const melody = [
    440,0,523.25,0,659.25,523.25,440,0,
    392,0,440,0,523.25,440,392,0,
    392,0,523.25,0,659.25,783.99,659.25,0,
    587.33,0,493.88,0,392,493.88,440,0
  ];
  const beat = 60 / 112 / 2; // colcheias
  function schedule() {
    syncGain();
    if (!active() || !audio || audio.state !== 'running') return;
    if (!nextTime || nextTime < audio.currentTime - beat) nextTime = audio.currentTime + 0.04;
    const level = Number($('siLevel')?.textContent || 1);
    const boss = level > 0 && level % 5 === 0 && $('siBossName')?.parentElement?.style.display !== 'none';
    while (nextTime < audio.currentTime + 0.18) {
      const pos = step % 32, chord = chords[Math.floor(pos / 8)];
      if (pos % 8 === 0) {
        note(chord[0] / 2, nextTime, beat * 2.9, 'triangle', 0.14);
        note(chord[1], nextTime, beat * 3.4, 'sine', 0.035);
        note(chord[2], nextTime, beat * 3.4, 'sine', 0.035);
      }
      note(chord[pos % 3] * 2, nextTime, beat * 0.60, 'triangle', boss ? 0.048 : 0.032);
      if (melody[pos]) note(melody[pos], nextTime, beat * 0.82, 'sine', boss ? 0.095 : 0.075);
      if (boss && pos % 2 === 0) note(82.41, nextTime, beat * 0.25, 'sawtooth', 0.045);
      nextTime += beat; step++;
    }
  }
  const unlock = () => { initAudio(); syncGain(); };
  start.addEventListener('click', unlock);
  restart.addEventListener('click', unlock);
  $('siContinue')?.addEventListener('click', unlock);
  musicButton.addEventListener('click', () => {
    musicEnabled = !musicEnabled;
    try { localStorage.setItem('siMusicEnabled', String(musicEnabled)); } catch (_) {}
    showMusicButton();
    if (musicEnabled) initAudio();
    syncGain();
  });
  const volumeSlider = section.querySelector('input[aria-label="Volume do jogo"]');
  volumeSlider?.addEventListener('input', () => {
    volume = Math.max(0, Math.min(1, Number(volumeSlider.value) / 100)); syncGain();
  });
  const effectsButton = section.querySelector('button[aria-label="Ativar ou desativar o som do jogo"]');
  effectsButton?.addEventListener('click', () => setTimeout(syncGain, 0));
  document.addEventListener('visibilitychange', syncGain);
  setInterval(schedule, 75);
})();
