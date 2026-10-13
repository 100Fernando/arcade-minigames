// teste_home: Jogo de Alvos + Space Invaders: Ultima Defesa
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const particles = $('particles');
  if (particles) for (let i = 0; i < 30; i++) {
    const p = document.createElement('div'); p.className = 'particle';
    Object.assign(p.style, {left: rnd(0,100)+'vw', width:'4px', height:'4px',
      animationDuration:rnd(10,30)+'s', animationDelay:-rnd(0,20)+'s'});
    particles.appendChild(p);
  }
  for (let i=0; i<50; i++) {
    const s=document.createElement('div'); s.className='star';
    s.style.left=rnd(0,100)+'vw'; s.style.top=rnd(0,100)+'vh';
    s.style.animationDelay=rnd(0,3)+'s'; document.body.appendChild(s);
  }
  // Nome do player: gate — the page requires a name before the games appear.
  // Once confirmed it is saved in localStorage, so the first game-over can
  // upload it to the database via window.pcName().
  (() => {
    const card=document.querySelector('.card');
    const gate=$('nameGate'), btn=$('confirmNameBtn'), input=$('playerName');
    if(!card||!gate||!btn||!input) return;
    const clean=v=>{const s=String(v||'').replace(/\s+/g,' ').trim();return s?s.slice(0,24):'';};
    let saved=null; try{saved=localStorage.getItem('playerName');}catch(_){}
    const reveal=()=>{ if(card)card.classList.remove('gate-pending'); };
    const hide=()=>{ if(card)card.classList.add('gate-pending'); };
    if(saved!=null&&clean(saved)!==''){
      input.value=saved; reveal(); // returning visitor: games visible, field editable
    } else {
      hide(); // fresh visitor: games hidden until a name is confirmed
    }
    btn.addEventListener('click',()=>{
      const n=clean(input.value); if(!n) return; // empty/whitespace stays pending
      try{localStorage.setItem('playerName',n);}catch(_){}
      window.pcName=()=>n;
      reveal();
    });
    // Keep the stored name in sync if the player edits the field after reveal.
    const commit=()=>{const n=clean(input.value); if(n){try{localStorage.setItem('playerName',n);}catch(_){}}};
    input.addEventListener('input',commit);
    input.addEventListener('change',commit);
    if(!window.pcName) window.pcName=()=>clean(input.value)||'Anônimo';
  })();
  // Google Identity (One Tap) — OPTIONAL. Games never wait for it: no client id
  // configured, or a file:// origin, simply leaves the manual name gate in place.
  (() => {
    const box=document.querySelector('.google-login');
    if(!box) return;
    const clientId=(box.getAttribute('data-client-id')||'').trim();
    if(!clientId) return; // login disabled: manual gate is the only path
    // Same API base ranking.js uses: absolute on Pages, same-origin on localhost.
    const apiBase=()=>{
      if(/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(location.href)) return '';
      const m=document.getElementById('apiBase');
      return (m&&m.content||'').trim();
    };
    if(!/^https?:/.test(location.protocol)) return; // gsi refuses file://
    window.googleCredential=null;
    const s=document.createElement('script');
    s.src='https://accounts.google.com/gsi/client'; s.async=true; s.defer=true;
    // FedCM transport instead of the gsi iframe's cross-frame postMessage. GitHub
    // Pages cannot send a Cross-Origin-Opener-Policy header, so the default
    // button/One-Tap path is blocked ("Cross-Origin-Opener-Policy policy would
    // block the window.postMessage call"). FedCM uses the browser's native
    // credential API, which is not subject to COOP, so sign-in works on Pages.
    s.setAttribute('data-use_fedcm_for_prompt','true');
    s.onerror=()=>console.log('[login] gsi client unavailable — manual name kept');
    document.head.appendChild(s);
    const show=(label)=>{
      box.classList.add('enabled');
      const t=box.querySelector('#googleOneTap');
      if(t)t.textContent=label;
    };
    show('Sign in with Google to save your score');
    const onCredential=(cred)=>{
      const id_token=typeof cred==='string'?cred:(cred&&cred.credential)||'';
      if(!id_token) return;
      fetch(apiBase() + '/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id_token})})
        .then(r=>r.json())
        .then(d=>{
          if(!d||!d.ok) { console.log('[login] rejected by server'); return; }
          window.googleCredential=id_token;
          const nm=String(d.name||'').slice(0,24)||'Anônimo';
          try{localStorage.setItem('playerName',nm);}catch(_){}
          const inp=document.getElementById('playerName');
          if(inp) inp.value=nm;
          window.pcName=()=>nm;
          // Google already gave the identity: keep email+photo client-side too (never
          // rendered on the public board) so the player never re-types anything.
          window.googleUser={uid:d.uid,name:d.name,email:d.email,picture:d.picture};
          try{localStorage.setItem('googleEmail',d.email||'');localStorage.setItem('googlePicture',d.picture||'');}catch(_){}
          // Signed-in UI: greeting + name + photo + logout, and hide the login button.
          if(box){
            box.classList.add('signedin');
            const prof=document.getElementById('googleProfile');
            if(prof){
              prof.classList.add('on');
              const av=document.getElementById('googleAvatar');
              if(av&&d.picture) av.src=d.picture;
              const gr=document.getElementById('googleGreeting');
              if(gr) gr.textContent='Hello, '+nm+'!';
            }
          }
          // Auto-open the gate: the name came from Google, so reveal the games without
          // the "Confirmar & play" click. The card also grows instead of scrolling
          // internally, so the profile card is never clipped at its bottom edge.
          const card=document.querySelector('.card');
          if(card){card.classList.remove('gate-pending');card.classList.add('google-signedin');}
        })
        .catch(()=>console.log('[login] /api/login unreachable — manual name kept'));
    };
    const boot=()=>{
      if(!window.google) return;
      try{
        // GSI requires initialize() BEFORE prompt(); without it Google logs
        // "Missing required parameter: client_id" and One Tap never renders.
        // The callback here is what renderButton invokes with the credential when
        // the button is clicked — without it the button's credential is dropped and
        // login never completes (prompt() only wires the One Tap path).
        window.google.accounts.id.initialize({client_id: clientId, callback: onCredential});
        // The rendered button returns the credential to the page via a cross-frame
        // postMessage, which Chrome's Cross-Origin-Opener-Policy blocks when the
        // embedding page cannot send a permissive COOP header. GitHub Pages is a
        // static host (no custom headers) -> the button is unfixable there, so on
        // Pages we rely on FedCM One Tap alone. On origins that DO control headers
        // (the VPS /arcade/ block sends COOP: same-origin-allow-popups) or localhost,
        // render the clickable button so the player gets an obvious option.
        if(!/github\.io$/i.test(location.hostname)){
          try{
            const btnHost=document.createElement('div');
            btnHost.className='google-btn';
            if(box) box.appendChild(btnHost);
            window.google.accounts.id.renderButton(btnHost, {theme:'filled_rounded', size:'large', text:'continue_with', shape:'rectangular_rounded'});
          }catch(e){console.log('[login] renderButton unavailable — One Tap only');}
        }
        window.google.accounts.id.prompt(onCredential);
      }catch(e){console.log('[login] One Tap unavailable — manual name kept');}
    };
    // Logout: revoke the Google session, clear the captured identity, hide the
    // profile block and bring the login button back so the player can sign in again.
    (()=>{
      const btn=document.getElementById('googleLogoutBtn');
      if(!btn) return;
      btn.addEventListener('click',()=>{
        try{
          if(window.google&&window.google.accounts){
            window.google.accounts.id.disableAutoSelect();
            window.google.accounts.id.revoke(window.googleUser&&window.googleUser.email||'');
          }
        }catch(_){}
        window.googleCredential=null; window.googleUser=null;
        try{localStorage.removeItem('playerName');localStorage.removeItem('googleEmail');localStorage.removeItem('googlePicture');}catch(_){}
        if(box) box.classList.remove('signedin');
        const card=document.querySelector('.card');
        if(card) card.classList.remove('google-signedin');
        const prof=document.getElementById('googleProfile');
        if(prof){prof.classList.remove('on');const av=document.getElementById('googleAvatar');if(av)av.removeAttribute('src');const gr=document.getElementById('googleGreeting');if(gr)gr.textContent='';}
        // Re-arm One Tap + the button for a fresh sign-in.
        if(window.google){try{window.google.accounts.id.prompt(onCredential);}catch(_){}}
      });
    })();
    if(window.google) boot();
    else window.addEventListener('load',boot);
  })();
  // Mantem o outro minigame operacional.
  let targetHooks=null;
  (() => {
    const board=$('gameBoard'), score=$('score'), best=$('highscore'), restart=$('restartBtn'), sec=$('targetGameSection');
    if (!board || !score || !best || !restart) return;
    const sfx = k => { const f=window.tgSfx; if (f) f[k]&&f[k](); };
    let record=0, tg=null;
    try {record=Number(localStorage.getItem('targetGameHighscore'))||0;} catch (_) {}
    best.textContent=record;
    // Difficulty per phase: spawns faster, targets live less, shrink, bombs and movement increase.
    const waveFor=h=>Math.min(12,1+Math.floor(h/8));
    const spawnEvery=w=>Math.max(420,1000-(w-1)*60);
    const lifeFor=w=>Math.max(950,2000-(w-1)*110);
    const sizeFor=w=>Math.max(34,50-(w-1)*2);
    const decoyProb=w=>Math.min(.30,(w-1)*.03);
    const moveProb=w=>Math.min(.45,(w-1)*.05);
    const moveSpeed=w=>Math.min(120,30+(w-1)*8);
    const multFor=c=>Math.min(5,1+Math.floor(c/4));
    const values={'🎯':100,'⭐':150,'💎':200,'🔥':250,'⚡':300};
    const pool=['🎯','🎯','⭐','⭐','💎','🔥','⚡'];
    // Boss + powerups: bosses at waves 4/8/12; powerups drop from hit targets.
    const bossWaves=[4,8,12];
    const isBossWave=w=>bossWaves.indexOf(w)>=0;
    const bossHpFor=w=>Math.round(6+w); // 10/14/18 hits
    const powerTypes=['life','shield','slow','x2'];
    const powerProb=0.12;
    const powerEmoji={life:'❤',shield:'🛡️',slow:'⏳',x2:'✨'};
    // HUD created by script: Lives, Fase, Combo (Score/Recorde already in HTML).
    const hud=document.createElement('div');
    hud.style.cssText='display:flex;justify-content:center;gap:12px;flex-wrap:wrap;margin:10px 0;color:white;font:13px sans-serif';
    hud.innerHTML='<span>Lives: <b id="tgLives">❤❤❤</b></span><span>Fase: <b id="tgWave">1</b></span><span>Combo: <b id="tgCombo">x1</b></span><span id="tgEffects"></span>';
    sec.insertBefore(hud,board);
    const livesEl=$('tgLives'), waveEl=$('tgWave'), comboEl=$('tgCombo'), effectsEl=$('tgEffects');
    const over=document.createElement('div'); over.className='tg-overlay';
    board.appendChild(over);
    const bossBar=document.createElement('div'); bossBar.className='boss-bar';
    bossBar.innerHTML='<div class="boss-name"></div><div class="boss-track"><div class="boss-fill"></div></div>';
    bossBar.style.display='none';
    board.appendChild(bossBar);
    function updateHUD(){ if(!tg)return;
      score.textContent=tg.points; best.textContent=record;
      livesEl.textContent='❤'.repeat(Math.max(0,tg.lives));
      waveEl.textContent=tg.wave; comboEl.textContent='x'+multFor(tg.combo);
      const fx=(tg.shield?'🛡️ ':'')+(tg.slowMs>0?'⏳ ':'')+(tg.x2Ms>0?'✨ ':'');
      effectsEl.textContent=fx;
      if(tg.boss){const b=tg.boss;const bar=board.querySelector('.boss-bar');
        if(bar){bar.style.display='block';bar.querySelector('.boss-name').textContent=b.name+' · '+b.hp+'/'+b.maxHp;
          bar.querySelector('.boss-fill').style.width=clamp(100*b.hp/b.maxHp,0,100)+'%';}}
      else {const bar=board.querySelector('.boss-bar');if(bar)bar.style.display='none';}
    }
    function clearChains(){ if(!tg)return; clearTimeout(tg.spawnTimeout); clearTimeout(tg.moveTimeout); clearTimeout(tg.bossTimeout); tg.spawnTimeout=tg.moveTimeout=tg.bossTimeout=null; }
    function clearTargets(){ board.querySelectorAll('.target').forEach(t=>t.remove()); board.querySelectorAll('.powerup').forEach(t=>t.remove()); }
    function loseLife(){ if(!tg||tg.over)return; if(tg.shield){tg.shield=false; sfx('shield'); updateHUD(); return;} tg.lives--; tg.combo=0; updateHUD(); if(tg.lives<=0)gameOver(); }
    function gameOver(){ if(!tg)return; tg.over=true; clearChains(); clearTargets();
      over.innerHTML='<div><h2 style="color:#ff5566">Fim de jogo</h2><p>Score: '+tg.points+' · Recorde: '+record+'</p><p>Precizi: '+Math.round(100*tg.hits/Math.max(1,tg.clicks))+'% · Fasa: '+tg.wave+'</p></div>';
      over.style.display='flex'; sfx('gameover');
      window.submitScore && window.submitScore('alvos',tg.points); }
    function tickMove(){
      if(!tg||tg.over)return;
      for(const t of board.querySelectorAll('.target')){
        if(!t.dataset.move||t.dataset.hit)continue;
        const size=t.offsetWidth;
        let x=Number(t.dataset.x), y=Number(t.dataset.y);
        let vx=Number(t.dataset.vx), vy=Number(t.dataset.vy);
        x+=vx*.05; y+=vy*.05;
        const maxX=Math.max(0,board.clientWidth-size), maxY=Math.max(0,board.clientHeight-size);
        if(x<0){x=0;vx=-vx;} if(x>maxX){x=maxX;vx=-vx;}
        if(y<0){y=0;vy=-vy;} if(y>maxY){y=maxY;vy=-vy;}
        t.dataset.x=String(x); t.dataset.y=String(y); t.dataset.vx=String(vx); t.dataset.vy=String(vy);
        t.style.left=x+'px'; t.style.top=y+'px';
      }
      if(tg.slowMs>0)tg.slowMs=Math.max(0,tg.slowMs-50);
      if(tg.x2Ms>0)tg.x2Ms=Math.max(0,tg.x2Ms-50);
      board.querySelectorAll('.powerup').forEach(p=>{ if(!p.dataset.exp)p.dataset.exp=String(Number(p.dataset.exp||0)+50); if(Number(p.dataset.exp)>6000)p.remove(); });
      tg.moveTimeout=setTimeout(tickMove,50);
    }
    function scheduleNext(){ if(tg&&!tg.over)tg.spawnTimeout=setTimeout(spawnTarget,spawnEvery(tg.wave)*(tg.slowMs>0?1.6:1)); }
    function spawnBoss(w){
      const names=['Sentinela Alfa','Matriarca Beta','Nucleo Omega'];
      const name=names[bossWaves.indexOf(w)];
      const hp=bossHpFor(w);
      const size=Math.min(110,Math.max(60,board.clientWidth*.22));
      const x=rnd(0,Math.max(0,board.clientWidth-size)), y=rnd(0,Math.max(0,board.clientHeight-size));
      const t=document.createElement('div'); t.className='target target-boss';
      t.textContent='👑';
      t.style.width=t.style.height=size+'px'; t.style.fontSize=Math.round(size*.5)+'px';
      t.style.left=x+'px'; t.style.top=y+'px';
      t.dataset.kind='boss'; t.dataset.hp=String(hp);
      board.appendChild(t);
      tg.boss={name,hp,maxHp:hp}; tg.bossSpawned=true; tg.bossAttackMs=0;
      updateHUD();
      t.addEventListener('pointerdown',()=>{
        if(!t.isConnected||Number(t.dataset.hp)<=0)return;
        tg.clicks++; tg.hits++; tg.combo++;
        const left=Number(t.dataset.hp)-1;
        t.dataset.hp=String(left);
        if(tg.boss)tg.boss.hp=left;
        tg.points+=50*multFor(tg.combo)*(tg.x2Ms>0?2:1);
        if(left<=0){
          tg.boss=null; tg.points+=250*w;
          t.classList.add('target-correct'); sfx('boss');
          setTimeout(()=>t.remove(),300);
        } else { t.classList.add('target-hit'); sfx('hit'); }
        updateHUD();
      });
      // Boss not clicked in time: it relocates, no life lost, but keeps attacking.
      setTimeout(()=>{ if(!t.isConnected||Number(t.dataset.hp)<=0)return;
        const nx=rnd(0,Math.max(0,board.clientWidth-size)), ny=rnd(0,Math.max(0,board.clientHeight-size));
        t.style.left=nx+'px'; t.style.top=ny+'px';
      },lifeFor(w)*2);
    }
    function dropPowerup(src){
      const type=powerTypes[Math.floor(rnd(0,powerTypes.length))];
      const p=document.createElement('div'); p.className='powerup';
      p.textContent=powerEmoji[type];
      const x=Number(src.dataset.x||0), y=Number(src.dataset.y||0);
      p.style.left=x+'px'; p.style.top=y+'px';
      p.style.width=p.style.height='30px'; p.style.fontSize='20px';
      p.dataset.type=type;
      board.appendChild(p);
      p.addEventListener('pointerdown',()=>{
        if(!p.isConnected||!tg||tg.over)return;
        if(type==='life')tg.lives=Math.min(5,tg.lives+1);
        else if(type==='shield')tg.shield=true;
        else if(type==='slow')tg.slowMs=8000;
        else tg.x2Ms=8000;
        sfx('power'); p.remove(); updateHUD();
      });
    }
    function spawnTarget(){
      if(!tg||tg.over||!board.isConnected)return;
      const w=tg.wave;
      if(isBossWave(w)&&!tg.bossSpawned){ spawnBoss(w); scheduleNext(); return; }
      const size=sizeFor(w), bomb=Math.random()<decoyProb(w);
      const t=document.createElement('div'); t.className=bomb?'target target-bomb':'target';
      const emoji=bomb?'💣':pool[Math.floor(rnd(0,Math.min(7,2+w)))];
      t.textContent=emoji;
      const x=rnd(0,Math.max(0,board.clientWidth-size)), y=rnd(0,Math.max(0,board.clientHeight-size));
      t.style.width=t.style.height=size+'px'; t.style.fontSize=Math.round(size*.55)+'px';
      t.style.left=x+'px'; t.style.top=y+'px';
      t.dataset.x=String(x); t.dataset.y=String(y);
      t.dataset.kind=bomb?'bomb':'good'; t.dataset.value=bomb?'0':String(values[emoji]);
      if(!bomb&&Math.random()<moveProb(w)){
        t.dataset.move='1'; const ang=rnd(0,Math.PI*2), sp=moveSpeed(w);
        t.dataset.vx=String(Math.cos(ang)*sp); t.dataset.vy=String(Math.sin(ang)*sp);
      }
      board.appendChild(t);
      t.addEventListener('pointerdown',()=>{
        if(!t.isConnected||t.dataset.hit)return;
        t.dataset.hit='1'; tg.clicks++;
        if(t.dataset.kind==='bomb'){
          t.classList.add('target-wrong'); sfx('decoy');
          setTimeout(()=>t.remove(),250); loseLife();
        } else {
          tg.hits++; tg.combo++;
          tg.points+=Number(t.dataset.value)*multFor(tg.combo)*(tg.x2Ms>0?2:1);
          if(tg.points>record){record=tg.points;
            try{localStorage.setItem('targetGameHighscore',String(record));}catch(_){}}
          t.classList.add('target-correct'); sfx('hit');
          setTimeout(()=>t.remove(),150);
          if(Math.random()<powerProb) dropPowerup(t);
          const nw=waveFor(tg.hits);
          if(nw>tg.wave){tg.wave=nw;tg.bossSpawned=false;sfx('wave');}
          updateHUD();
        }
      });
      setTimeout(()=>{
        if(!t.isConnected||t.dataset.hit)return;
        if(t.dataset.kind==='bomb'){t.remove();return;} // Expired decoy is harmless.
        t.classList.add('target-missed'); sfx('miss');
        setTimeout(()=>t.remove(),500); loseLife();
      },lifeFor(w));
      scheduleNext();
    }
    function newGame(){
      clearChains(); clearTargets(); over.style.display='none';
      tg={points:0,lives:3,wave:1,combo:0,hits:0,clicks:0,over:false,spawnTimeout:null,moveTimeout:null,bossTimeout:null,boss:null,bossSpawned:false,shield:false,slowMs:0,x2Ms:0,bossAttackMs:0};
      updateHUD(); spawnTarget(); tg.moveTimeout=setTimeout(tickMove,50);
    }
    restart.addEventListener('click',newGame);
    if(!sec||!sec.classList.contains('minimized')) newGame();
    targetHooks={open:()=>{ if(tg&&!tg.over){clearChains();spawnTarget();tg.moveTimeout=setTimeout(tickMove,50);} else newGame(); },
      close:()=>{ if(!tg)return; clearChains(); clearTargets(); }};
  })();

  const canvas=$('siCanvas'), overlay=$('siOverlay'), startBtn=$('siStartBtn');
  const restartBtn=$('siRestartBtn'), section=$('siGameSection');
  if (!canvas || !overlay || !startBtn || !restartBtn || !section) return;
  const ctx=canvas.getContext('2d'); if(!ctx) return;
  const W=canvas.width,H=canvas.height, BASE_SPEED=250, Y_MIN=H*0.45;
  const modes={
    facil:{name:'Fácil',lives:5,fire:1.35,bullet:.85,hp:.8,drop:.23},
    normal:{name:'Normal',lives:3,fire:1,bullet:1,hp:1,drop:.15},
    dificil:{name:'Difícil',lives:2,fire:.72,bullet:1.25,hp:1.3,drop:.11}
  };
  const chapters=[
    ['Sinal desconhecido','As colônias ficaram em silêncio. Você é a última nave enviada para investigar.'],
    ['O cerco','A primeira frota caiu, mas seus registros apontam para uma inteligência maior.'],
    ['O enxame','As naves inimigas aprendem seus movimentos. O sinal vem do coração da frota.'],
    ['A origem','A frota-mãe controla a invasão. Destrua o núcleo e liberte as colônias.']
  ];
  const bossDefs=[
    {name:'Sentinela Ômega',w:110,h:50,vx:90,body:'#3f6fd0',trim:'#7fd4ff',kind:0},
    {name:'Matriarca do Enxame',w:160,h:44,vx:70,body:'#8b3fa8',trim:'#f093fb',kind:1},
    {name:'Núcleo da Frota',w:140,h:72,vx:55,body:'#c9a227',trim:'#ffcc00',kind:2}
  ];
  const keys={left:false,right:false,shoot:false,up:false,down:false};
  let g=null, raf=null, last=null, selected='normal';
  let siBest=0;try{siBest=Number(localStorage.getItem('siHighscore'))||0;}catch(_){}
  // Interface criada pelo script: nenhuma mudanca no HTML ou CSS e necessaria.
  const controls=document.createElement('div');
  controls.style.cssText='display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;margin:12px 0;color:#fff;font:14px sans-serif';
  const label=document.createElement('label');label.textContent='Dificuldade: ';
  const select=document.createElement('select');select.setAttribute('aria-label','Dificuldade');
  select.style.cssText='padding:8px;border-radius:8px;background:#24243e;color:#fff;border:1px solid #667eea';
  for(const [key,mode] of Object.entries(modes)) {const o=document.createElement('option');o.value=key;o.textContent=mode.name;select.appendChild(o);}
  select.value=selected;select.addEventListener('change',()=>{selected=select.value;});
  label.appendChild(select);controls.appendChild(label);
  const help=document.createElement('span');help.textContent='← → ou A/D mover · ↑ ↓ ou W-S vertical · Espaço atirar · R reiniciar';controls.appendChild(help);
  section.insertBefore(controls,$('siGameContainer')||section.firstChild);
  const hud=document.createElement('div');hud.id='siScoreDisplay';
  hud.style.cssText='display:flex;justify-content:center;gap:12px;flex-wrap:wrap;margin:10px 0;color:white;font:12px monospace';
  hud.innerHTML='<span>SCORE: <b id="siScore">00000</b></span><span>BEST: <b id="siBest">00000</b></span><span>VIDAS: <b id="siLives">❤❤❤</b></span><span>FASE: <b id="siLevel">1</b></span><span>SPEED: <b id="siSpeed">1.00x</b></span><span id="siPowerUps"></span>';
  section.insertBefore(hud,controls);
  const bossBar=document.createElement('div');bossBar.style.cssText='display:none;max-width:500px;margin:8px auto;color:#fff;font:13px sans-serif;text-align:center';
  bossBar.innerHTML='<div id="siBossName"></div><div style="height:12px;background:#342039;border-radius:9px;overflow:hidden"><div id="siBossFill" style="height:100%;width:100%;background:#ff3366"></div></div>';
  section.insertBefore(bossBar,$('siGameContainer')||controls.nextSibling);
  const story=document.createElement('div');
  story.style.cssText='display:none;position:absolute;inset:0;z-index:20;background:rgba(8,10,30,.94);color:white;padding:25px;box-sizing:border-box;align-items:center;justify-content:center;text-align:center;font:16px/1.5 sans-serif';
  story.innerHTML='<div style="max-width:390px"><h2 id="siStoryTitle" style="color:#00f2fe"></h2><p id="siStoryText"></p><button id="siContinue" type="button" style="padding:12px 24px;background:#667eea;color:white;border:0;border-radius:9px;cursor:pointer">Continuar</button></div>';
  const wrapper=canvas.parentElement;wrapper.style.position='relative';wrapper.appendChild(story);
  const storyTitle=$('siStoryTitle'),storyText=$('siStoryText'),continueBtn=$('siContinue');
  function showStory(title,text,next) {
    if(raf!==null){cancelAnimationFrame(raf);raf=null;} last=null;
    storyTitle.textContent=title;storyText.textContent=text;story.style.display='flex';
    continueBtn.onclick=()=>{story.style.display='none';next();};
  }
  // HUD cache: only touch the DOM when a value actually changes, avoiding
  // per-frame textContent writes and the boss-bar layout reflow on mobile.
  const hudCache={score:-1,best:-1,lives:-1,level:-1,speed:-1,power:'',bossShown:null,bossHp:-1,bossName:''};
  function updateHUD(){if(!g)return;
    if(g.score!==hudCache.score){hudCache.score=g.score;$('siScore').textContent=String(g.score).padStart(5,'0');}
    if(g.score>siBest){siBest=g.score;try{localStorage.setItem('siHighscore',String(siBest));}catch(_){}}
    if(siBest!==hudCache.best){hudCache.best=siBest;$('siBest').textContent=String(siBest).padStart(5,'0');}
    if(g.lives!==hudCache.lives){hudCache.lives=g.lives;$('siLives').textContent='❤'.repeat(Math.max(0,g.lives));}
    if(g.level!==hudCache.level){hudCache.level=g.level;$('siLevel').textContent=g.level;}
    if(g.speed!==hudCache.speed){hudCache.speed=g.speed;$('siSpeed').textContent=g.speed.toFixed(2)+'x';}
    const power=(g.timers.multishot?'🔥 ':'')+(g.timers.shield?'🛡️ ':'')+(g.timers.rapidfire?'⚡⚡':'');
    if(power!==hudCache.power){hudCache.power=power;$('siPowerUps').textContent=power;}
    const bossShown=!!g.boss;
    if(bossShown!==hudCache.bossShown){hudCache.bossShown=bossShown;bossBar.style.display=bossShown?'block':'none';}
    if(g.boss){const hp=Math.ceil(g.boss.hp);
      if(hp!==hudCache.bossHp){hudCache.bossHp=hp;$('siBossName').textContent=g.boss.name+' · '+hp+' PV';
        $('siBossFill').style.width=clamp(100*g.boss.hp/g.boss.maxHp,0,100)+'%';}}
  }
  const hit=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
  function burst(x,y,color){for(let i=0;i<12;i++)g.particles.push({x,y,vx:rnd(-130,130),vy:rnd(-130,130),life:.5,color});
    if(g.particles.length>140)g.particles.splice(0,g.particles.length-140);}
  function bullet(x,y,vx,vy,hostile=true,w=5,h=11){
    (hostile?g.enemyBullets:g.bullets).push({x,y,vx,vy,w,h,active:true});
  }
  function reset(){
    const mode=modes[selected];
    g={mode,level:1,score:0,lives:mode.lives,x:(W-40)/2,y:H-42,w:40,h:20,speed:1,
      enemies:[],boss:null,bullets:[],enemyBullets:[],powerUps:[],particles:[],
      timers:{multishot:0,shield:0,rapidfire:0},invulnerable:0,shot:0,
      enemyTimer:0,enemyDir:1,fireTimer:0,bossTimer:0,warning:0,warningX:0,flash:0,laser:0,laserX:0,ended:false};
    keys.left=keys.right=keys.shoot=false;
    initLevel();updateHUD();
  }
  function initLevel(){
    g.enemies=[];g.boss=null;g.bullets=[];g.enemyBullets=[];g.powerUps=[];
    g.enemyTimer=0;g.enemyDir=1;g.fireTimer=0;g.bossTimer=0;g.warning=0;
    if(g.level%5===0){
      const tier=Math.floor(g.level/5)-1;
      const d=bossDefs[Math.min(tier,bossDefs.length-1)];
      const hp=Math.round((20+tier*14)*g.mode.hp);
      g.boss={name:d.name,x:W/2-d.w/2,y:48,baseY:48,w:d.w,h:d.h,
        hp,maxHp:hp,vx:d.vx,phase:0,t:0,kind:d.kind};
    }else{
      const rows=Math.min(3+Math.floor((g.level-1)/2),6),cols=7;
      for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
        const type=g.level>=3&&row===0?'sniper':g.level>=2&&row===1?'zigzag':
          g.level>=4&&row===rows-1?'armored':'basic';
        const hp=type==='armored'?2:1;
        g.enemies.push({x:50+col*58,y:55+row*43,baseX:50+col*58,w:34,h:25,
          type,hp,t:rnd(0,6)});
      }
    }
    updateHUD();
  }
  function shoot(){if(!g||g.ended||g.shot>0||story.style.display==='flex')return;
    const center=g.x+g.w/2;
    for(const offset of (g.timers.multishot>0?[-12,0,12]:[0]))bullet(center+offset-2,g.y-10,0,-470,false,4,11);
    g.shot=g.timers.rapidfire>0?90:170;
  }
  function power(type){
    if(type==='speed')g.speed=Math.min(1.8,Math.round((g.speed+.15)*100)/100);
    if(type==='multishot')g.timers.multishot=10000;
    if(type==='shield')g.timers.shield=5000;
    if(type==='rapidfire')g.timers.rapidfire=6000;
    if(type==='bomb'){
      if(g.boss)g.boss.hp=Math.max(0,g.boss.hp-4);
      else {const n=Math.floor(g.enemies.length*.3);for(let i=0;i<n;i++){
        const idx=Math.floor(rnd(0,g.enemies.length));const e=g.enemies.splice(idx,1)[0];
        if(e){burst(e.x,e.y,'#ffff00');g.score+=100;}
      }}
      g.flash=130;
    }
    updateHUD();
  }
  function drop(e){if(Math.random()>=g.mode.drop||g.powerUps.length>=3)return;
    const types=['speed','multishot','bomb','shield','rapidfire'];
    g.powerUps.push({x:e.x+e.w/2-10,y:e.y,w:20,h:20,type:types[Math.floor(rnd(0,5))],age:0});
  }
  function nextLevel(){
    const wasBoss=g.level%5===0;
    if(g.level===15 && wasBoss){
      g.ended=true;window.submitScore && window.submitScore('si',g.score);
      showStory('Vitória: sinal restaurado',
        'O núcleo foi destruído. As colônias voltaram a responder. A última defesa salvou a Terra.',
        ()=>{overlay.style.display='flex';const title=$('siTitle');
          if(title)title.textContent='Vitória!';startBtn.style.display='none';restartBtn.style.display='';});
      return;
    }
    g.level++;
    if(wasBoss){g.lives=Math.min(g.mode.lives,g.lives+1);
      const chapter=chapters[Math.min(Math.floor((g.level-1)/5),chapters.length-1)];
      showStory(chapter[0],chapter[1]+' Você recuperou uma vida.',()=>{initLevel();run();});
    }else if(g.level%5===0){
      const name=bossDefs[Math.min(Math.floor(g.level/5)-1,bossDefs.length-1)].name;
      showStory('ALERTA: '+name,'A transmissão inimiga foi localizada. Desvie dos ataques anunciados e destrua o comandante.',()=>{initLevel();run();});
    }else initLevel();
    updateHUD();
  }
  function end(){g.ended=true;keys.left=keys.right=keys.shoot=false;
    overlay.style.display='flex';const title=$('siTitle');if(title)title.textContent='Fim de jogo · fase '+g.level;
    startBtn.style.display='none';restartBtn.style.display='';
    window.submitScore && window.submitScore('si',g.score);
  }
  function damage(){if(g.invulnerable>0||g.timers.shield>0)return;
    g.lives--;g.invulnerable=1200;burst(g.x+g.w/2,g.y,'#00ff88');
    if(g.lives<=0)end();
  }
  function update(ms){if(!g||g.ended)return;
    const dt=ms/1000, tier=Math.floor((g.level-1)/5);
    // Analog stick (mobile): window.siStick.x/y in [-1,1]; keyboard still works.
    const st=window.siStick||null;
    const sx=st?clamp(st.x,-1,1):0, sy=st?clamp(st.y,-1,1):0;
    const mx=(Number(keys.right)-Number(keys.left))+sx;
    const my=(Number(keys.down)-Number(keys.up))+sy;
    g.x=clamp(g.x+mx*BASE_SPEED*g.speed*dt,0,W-g.w);
    g.y=clamp(g.y+my*BASE_SPEED*g.speed*dt,Y_MIN,H-g.h);
    g.shot=Math.max(0,g.shot-ms);if(keys.shoot)shoot();
    for(const k of Object.keys(g.timers))g.timers[k]=Math.max(0,g.timers[k]-ms);
    g.invulnerable=Math.max(0,g.invulnerable-ms);g.flash=Math.max(0,g.flash-ms);
    if(g.laser>0){g.laser-=ms;if(Math.abs((g.x+g.w/2)-g.laserX)<24)damage();}
    for(const e of g.enemies){if(e.type==='zigzag'){
      e.t+=dt*3;e.x=clamp(e.baseX+Math.sin(e.t)*19,0,W-e.w);
    }}
    g.enemyTimer+=ms;
    const moveInterval=Math.max(150,480-g.level*22);
    if(g.enemyTimer>=moveInterval&&g.enemies.length){g.enemyTimer%=moveInterval;
      const edge=g.enemies.some(e=>e.baseX<12||e.baseX+e.w>W-12);
      if(edge)g.enemyDir*=-1;
      for(const e of g.enemies){e.baseX+=g.enemyDir*(7+tier*2);if(edge)e.y+=12;
        if(e.type!=='zigzag')e.x=e.baseX;
        if(hit(e,g)){damage();if(g.ended)return;}
        if(e.y+e.h>=H){end();return;}
      }
    }
    if(g.boss){const b=g.boss;
      b.t+=dt;
      b.x+=b.vx*dt;if(b.x<=8||b.x+b.w>=W-8){b.x=clamp(b.x,8,W-8-b.w);b.vx*=-1;}
      if(b.kind===1)b.y=b.baseY+Math.sin(b.t*1.6)*30;
      if(b.kind===2)b.y=b.baseY+Math.sin(b.t*0.9)*46;
      g.bossTimer+=ms;
      if(g.warning>0){g.warning-=ms;
        if(g.warning<=0){
          if(b.kind===2){g.laser=380;g.laserX=g.warningX;} // Laser full-height: telegráfica e evitável.
          else for(let i=-1;i<=1;i++)bullet(g.warningX+i*11,b.y+b.h,i*35,240*g.mode.bullet);
        }
      }
      const cadence=Math.max(600,(1700-tier*150)*g.mode.fire);
      if(g.bossTimer>=cadence){g.bossTimer=0;b.phase++;
        if(b.phase%3===0){g.warningX=clamp(g.x+g.w/2,25,W-25);g.warning=b.kind===2?850:650;}
        else if(b.kind===0)for(let i=-2;i<=2;i++)bullet(b.x+b.w/2,b.y+b.h,i*75,(205+tier*22)*g.mode.bullet);
        else if(b.kind===1){ // Rain parallel from the wings
          for(const sx of[b.x+14,b.x+b.w-14])for(let i=-1;i<=1;i++)bullet(sx+i*12,b.y+b.h,0,(210+tier*20)*g.mode.bullet);
        }
        else{ // Radial burst in 8 directions
          for(let a=0;a<8;a++){const ang=a*Math.PI/4;
            bullet(b.x+b.w/2,b.y+b.h/2,Math.cos(ang)*160,Math.sin(ang)*140);}
        }
      }
    }else if(g.enemies.length){
      g.fireTimer+=ms;
      const cadence=Math.max(230,(780-g.level*36)*g.mode.fire);
      if(g.fireTimer>=cadence){g.fireTimer=0;
        const e=g.enemies[Math.floor(rnd(0,g.enemies.length))];
        if(e){const speed=(220+tier*20)*g.mode.bullet;
          if(e.type==='sniper'){
            const dx=(g.x+g.w/2)-(e.x+e.w/2),dy=g.y-e.y;
            const length=Math.hypot(dx,dy)||1;
            bullet(e.x+e.w/2,e.y+e.h,dx/length*speed,dy/length*speed);
          }else if(e.type==='armored'){
            for(const vx of [-65,65])bullet(e.x+e.w/2,e.y+e.h,vx,speed);
          }else bullet(e.x+e.w/2,e.y+e.h,0,speed);
        }
      }
    }
    for(const b of g.bullets){b.x+=b.vx*dt;b.y+=b.vy*dt;
      if(b.y<-20){b.active=false;continue;}
      if(g.boss&&hit(b,g.boss)){b.active=false;g.boss.hp--;burst(b.x,b.y,'#ff3366');g.score+=20;}
      else for(const e of g.enemies)if(e.hp>0&&hit(b,e)){
        b.active=false;e.hp--;if(e.hp<=0){g.score+=e.type==='armored'?200:100;
          burst(e.x+e.w/2,e.y+e.h/2,'#ff3366');drop(e);}break;
      }
    }
    g.bullets=g.bullets.filter(b=>b.active);
    g.enemies=g.enemies.filter(e=>e.hp>0);
    for(const b of g.enemyBullets){b.x+=b.vx*dt;b.y+=b.vy*dt;
      if(b.y>H+20||b.x<-20||b.x>W+20){b.active=false;continue;}
      if(hit(b,g)){b.active=false;damage();if(g.ended)break;}
    }
    g.enemyBullets=g.enemyBullets.filter(b=>b.active);
    if(g.ended)return;
    for(const p of g.powerUps){p.age+=ms;p.y+=165*dt;
      if(p.y>H||p.age>20000)p.dead=true;
      else if(hit(p,g)){p.dead=true;power(p.type);burst(p.x,p.y,'#ffff00');}
    }
    g.powerUps=g.powerUps.filter(p=>!p.dead);
    for(const p of g.particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;}
    g.particles=g.particles.filter(p=>p.life>0);
    if((g.boss&&g.boss.hp<=0)||(!g.boss&&!g.enemies.length))nextLevel();
    updateHUD();
  }
  function draw(){ctx.fillStyle='#101329';ctx.fillRect(0,0,W,H);if(!g)return;
    for(let i=0;i<35;i++){ctx.fillStyle='#283452';ctx.fillRect((i*97)%W,(i*137)%H,2,2);}
    if(g.warning>0){ctx.fillStyle='rgba(255,60,70,.18)';ctx.fillRect(g.warningX-22,0,44,H);
      ctx.strokeStyle='#ff5566';ctx.strokeRect(g.warningX-22,0,44,H);}
    if(g.laser>0){ctx.fillStyle='rgba(255,90,100,.4)';ctx.fillRect(g.laserX-10,0,20,H);
      ctx.fillStyle='#ffffff';ctx.fillRect(g.laserX-3,0,6,H);}
    if(g.invulnerable<=0||Math.floor(performance.now()/100)%2===0){
      ctx.fillStyle=g.speed>=1.75?'#ffe35a':g.speed>=1.45?'#e780ff':g.speed>1?'#4facfe':'#00ff88';
      ctx.fillRect(g.x,g.y,g.w,g.h);ctx.beginPath();ctx.moveTo(g.x,g.y);
      ctx.lineTo(g.x+g.w/2,g.y-12);ctx.lineTo(g.x+g.w,g.y);ctx.fill();
    }
    if(g.timers.shield){ctx.strokeStyle='#00ff88';ctx.beginPath();ctx.arc(g.x+g.w/2,g.y+7,30,0,Math.PI*2);ctx.stroke();}
    for(const e of g.enemies){ctx.fillStyle={basic:'#ff3366',zigzag:'#f093fb',sniper:'#ffcc00',armored:'#00bbee'}[e.type];
      ctx.fillRect(e.x+3,e.y,e.w-6,e.h-5);ctx.fillRect(e.x,e.y+9,e.w,8);
      ctx.fillStyle='#101329';ctx.fillRect(e.x+9,e.y+8,4,4);ctx.fillRect(e.x+e.w-13,e.y+8,4,4);
      if(e.hp>1){ctx.fillStyle='#fff';ctx.fillRect(e.x+5,e.y-4,e.w-10,2);}
    }
    if(g.boss){const b=g.boss;
      if(b.kind===0){ // Sentinela Ômega: blue hull, twin eyes, side cannons
        ctx.fillStyle=b.body;ctx.fillRect(b.x,b.y+10,b.w,b.h-10);ctx.fillRect(b.x+18,b.y,b.w-36,12);
        ctx.fillStyle=b.trim;ctx.fillRect(b.x+8,b.y+b.h-12,14,10);ctx.fillRect(b.x+b.w-22,b.y+b.h-12,14,10);
        ctx.fillStyle='#101329';ctx.fillRect(b.x+26,b.y+16,12,10);ctx.fillRect(b.x+b.w-38,b.y+16,12,10);
      }else if(b.kind===1){ // Matriarca: purple body, flapping wings
        ctx.fillStyle=b.body;ctx.fillRect(b.x+22,b.y,b.w-44,b.h);
        ctx.fillStyle=b.trim;ctx.fillRect(b.x,b.y+8+Math.sin(b.t*6)*4,20,b.h-16);ctx.fillRect(b.x+b.w-20,b.y+8-Math.sin(b.t*6)*4,20,b.h-16);
        ctx.fillStyle='#101329';for(let i=0;i<4;i++)ctx.fillRect(b.x+34+i*24,b.y+b.h/2-4,10,8);
      }else{ // Núcleo: yellow hull with pulsing core
        ctx.fillStyle='#8a6a1f';ctx.fillRect(b.x,b.y,b.w,b.h);ctx.fillStyle=b.body;ctx.fillRect(b.x+12,b.y+10,b.w-24,b.h-20);
        const r=10+Math.sin(b.t*5)*4;ctx.fillStyle=b.trim;ctx.beginPath();ctx.arc(b.x+b.w/2,b.y+b.h/2,r,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#101329';ctx.fillRect(b.x+16,b.y+12,12,8);ctx.fillRect(b.x+b.w-28,b.y+12,12,8);
      }
    }
    ctx.fillStyle='#00ff88';for(const b of g.bullets)ctx.fillRect(b.x,b.y,b.w,b.h);
    ctx.fillStyle='#ff5577';for(const b of g.enemyBullets)ctx.fillRect(b.x,b.y,b.w,b.h);
    for(const p of g.powerUps){ctx.fillStyle={speed:'#0088ff',multishot:'#ff8800',bomb:'#ffff00',shield:'#00ff88',rapidfire:'#ffffaa'}[p.type];
      ctx.fillRect(p.x,p.y,p.w,p.h);ctx.fillStyle='#101329';ctx.font='14px sans-serif';
      ctx.textAlign='center';ctx.fillText({speed:'⚡',multishot:'🔥',bomb:'💣',shield:'S',rapidfire:'R'}[p.type],p.x+10,p.y+15);
    }
    for(const p of g.particles){ctx.globalAlpha=clamp(p.life*2,0,1);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,3,3);}ctx.globalAlpha=1;
    if(g.flash){ctx.fillStyle='rgba(255,255,255,'+(g.flash/450)+')';ctx.fillRect(0,0,W,H);}
  }
  function frame(t){if(!g||g.ended||story.style.display==='flex'){raf=null;draw();return;}
    if(last===null)last=t;const ms=clamp(t-last,0,50);last=t;
    update(ms);draw();if(!g.ended&&story.style.display!=='flex')raf=requestAnimationFrame(frame);else raf=null;
  }
  function run(){if(raf!==null)cancelAnimationFrame(raf);last=null;raf=requestAnimationFrame(frame);}
  function start(){if(raf!==null){cancelAnimationFrame(raf);raf=null;}
    story.style.display='none';overlay.style.display='none';reset();
    showStory(chapters[0][0],chapters[0][1]+' Dificuldade: '+g.mode.name+'.',run);
  }
  startBtn.addEventListener('click',start);restartBtn.addEventListener('click',start);
  document.addEventListener('keydown',e=>{if(!g||g.ended||story.style.display==='flex')return;
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','a','A','d','D','w','W','s','S','r','R'].includes(e.key))e.preventDefault();
    if(e.key==='ArrowLeft'||e.key.toLowerCase()==='a')keys.left=true;
    if(e.key==='ArrowRight'||e.key.toLowerCase()==='d')keys.right=true;
    if(e.key==='ArrowUp'||e.key.toLowerCase()==='w')keys.up=true;
    if(e.key==='ArrowDown'||e.key.toLowerCase()==='s')keys.down=true;
    if(e.key===' ')keys.shoot=true;shoot();
    if(e.key.toLowerCase()==='r')start();
  });
  document.addEventListener('keyup',e=>{
    if(e.key==='ArrowLeft'||e.key.toLowerCase()==='a')keys.left=false;
    if(e.key==='ArrowRight'||e.key.toLowerCase()==='d')keys.right=false;
    if(e.key==='ArrowUp'||e.key.toLowerCase()==='w')keys.up=false;
    if(e.key==='ArrowDown'||e.key.toLowerCase()==='s')keys.down=false;
    if(e.key===' ')keys.shoot=false;
  });
  window.addEventListener('blur',()=>{keys.left=keys.right=keys.shoot=false;keys.up=keys.down=false;});
  const card=document.querySelector('.card'),minimize=$('minimizeBtn');
  if(card&&minimize){card.classList.add('visible');minimize.addEventListener('click',()=>{
    card.classList.toggle('visible');card.classList.toggle('minimized');});}
  // Arkanoid: Neon Breaker — Phase 1: core engine (paddle, ball, bricks, lives, score).
  let akHooks=null;
  (() => {
    const akCanvas=$('akCanvas'), akOverlay=$('akOverlay'), akStart=$('akStartBtn');
    const akRestart=$('akRestartBtn'), akSec=$('arkanoidGameSection');
    if(!akCanvas||!akOverlay||!akStart||!akRestart||!akSec) return;
    const ctx=akCanvas.getContext('2d'); if(!ctx) return;
    const AW=akCanvas.width, AH=akCanvas.height;
    const PAD_Y=AH-30, PAD_H=12, PAD_W0=80, PAD_SPEED=430, MAX_TILT=Math.PI/3;
    const sfx=k=>{const f=window.akSfx;if(f&&f[k])f[k]();};
    const keysAk={left:false,right:false};
    let ak=null, raf=null, last=null;
    let akBest=0;try{akBest=Number(localStorage.getItem('akHighscore'))||0;}catch(_){}
    const brickColor=br=>br.type==='armored'?'#8899aa':br.type==='explosive'?'#ff8800':br.type==='tough'?['#8b3fa8','#f093fb','#00f2fe'][clamp(br.maxHp-br.hp,0,2)]:['#ff3366','#ffcc00','#00f2fe','#f093fb','#00ff88'][clamp((br.value-10)/5,0,4)];
    // HUD created by script: Lives, Fase, Combo, Score/Recorde (like Alvos/SI).
    const akHud=document.createElement('div');
    akHud.id='akScoreDisplay';
    akHud.style.cssText='display:flex;justify-content:center;gap:14px;flex-wrap:wrap;margin:10px 0;color:white;font:12px monospace';
    akHud.innerHTML='<span>SCORE: <b id="akScore">0</b></span><span>BEST: <b id="akBest">'+akBest+'</b></span><span>VIDAS: <b id="akLives">❤❤❤</b></span><span>FASE: <b id="akPhase">1</b></span><span>COMBO: <b id="akCombo">x1</b></span>';
    akSec.insertBefore(akHud,akSec.querySelector('.ak-game-container')||akSec.firstChild);
    const akBossBar=document.createElement('div');
    akBossBar.style.cssText='display:none;max-width:500px;margin:8px auto;color:#fff;font:13px sans-serif;text-align:center';
    akBossBar.innerHTML='<div id="akBossName"></div><div style="height:12px;background:#342039;border-radius:9px;overflow:hidden"><div id="akBossFill" style="height:100%;width:100%;background:#ff3366"></div></div>';
    akSec.insertBefore(akBossBar,akSec.querySelector('.ak-game-container')||akHud.nextSibling);
    function updateHUD(){if(!ak)return;
      $('akScore').textContent=String(ak.points);
      if(ak.points>akBest){akBest=ak.points;try{localStorage.setItem('akHighscore',String(akBest));}catch(_){}}
      $('akBest').textContent=String(akBest);
      $('akLives').textContent='❤'.repeat(Math.max(0,ak.lives));
      $('akPhase').textContent=ak.phase;
      $('akCombo').textContent='x'+(1+ak.combo);
      akBossBar.style.display=ak.boss?'block':'none';
      if(ak.boss){$('akBossName').textContent=ak.boss.name+' · '+Math.ceil(ak.boss.hp)+' PV';
        $('akBossFill').style.width=clamp(100*ak.boss.hp/ak.boss.maxHp,0,100)+'%';}
    }
    const COLS=10, BW=46, BH=22, GAP=4, X0=2, Y0=60;
    const cellX=c=>X0+c*(BW+GAP), cellY=r=>Y0+r*(BH+GAP);
    // Distinct silhouettes per phase (cycle after 12). Returns [row,col] cells.
    function layoutFor(p){
      const cells=[];
      const add=(r,c)=>{if(r>=0&&r<6&&c>=0&&c<COLS)cells.push([r,c]);};
      const idx=((p-1)%12)+1;
      switch(idx){
        case 1: for(let r=0;r<2;r++)for(let c=0;c<COLS;c++)add(r,c); break;
        case 2: for(let r=0;r<5;r++)for(let c=r;c<COLS-r;c++)add(r,c); break; // pyramid
        case 3: for(let c=0;c<COLS;c++){const r=Math.floor(Math.abs(c-4.5)/2);add(r,c);add(r+1,c);} break; // dome
        case 4: for(let r=0;r<5;r++)for(let c=0;c<COLS;c++)if(c<3||c>6)add(r,c); break; // tunnel
        case 5: for(let r=0;r<5;r++)for(let c=0;c<COLS;c++)if((r+c)%2===0)add(r,c); break; // checker
        case 6: for(let r=0;r<5;r++)for(let c=0;c<COLS;c++)if(r===0||r===4||c===0||c===COLS-1)add(r,c); break; // fortress
        case 7: for(let r=0;r<5;r++)for(let c=0;c<COLS;c++){const d=Math.min(c,COLS-1-c,r,4-r);if(d%2===0)add(r,c);} break; // spiral-ish
        case 8: {const pat=['0110001100','1111111111','1011111101','0011001100'];for(let r=0;r<pat.length;r++)for(let c=0;c<COLS;c++)if(pat[r][c]==='1')add(r+1,c);} break; // invader
        case 9: for(let r=0;r<5;r++)for(let c=0;c<COLS;c++)if(Math.abs(c-4.5)+Math.abs(r-2)<=4.5)add(r,c); break; // diamond
        case 10: for(let r=0;r<5;r++){add(r,1);add(r,2);add(r,7);add(r,8);} break; // twin towers
        case 11: for(let c=0;c<COLS;c++)add(c%5,c); break; // zigzag
        default: for(let r=0;r<4;r++)for(let c=0;c<COLS;c++)add(r,c); break; // wall
      }
      return cells;
    }
    // Brick type by phase (tough/armored/moving/explosive appear progressively).
    function brickTypeFor(r,c,p){
      if(p>=6 && (r===0||r===5)) return 'armored';
      if(p>=7 && (r+c)%7===0) return 'explosive';
      if(p>=5 && c%3===0) return 'moving';
      if(p>=3 && (r+c)%4===0) return 'tough';
      return 'normal';
    }
    function buildBricks(){
      ak.bricks=[];
      const cells=layoutFor(ak.phase);
      for(const [r,c] of cells){
        const type=brickTypeFor(r,c,ak.phase);
        const hp=type==='armored'?4:type==='tough'?2:1;
        const moving=type==='moving';
        ak.bricks.push({x:cellX(c),y:cellY(r),w:BW,h:BH,hp,maxHp:hp,type,value:10+(5-r)*5,
          vx:moving?(c%2?40:-40):0});
      }
    }
    function speedFor(p){return Math.min(620,300+p*24);}
    const akBossDefs=[
      {name:'Guardian Neon',w:120,h:46,body:'#00f2fe',trim:'#7fd4ff',vx:90,kind:0},
      {name:'Warden Grid',w:150,h:52,body:'#f093fb',trim:'#8b3fa8',vx:70,kind:1},
      {name:'Core Breaker',w:140,h:64,body:'#c9a227',trim:'#ffcc00',vx:55,kind:2}
    ];
    function maybeSpawnBoss(){
      if(ak.phase%4===0){
        const tier=Math.min(Math.floor(ak.phase/4)-1, akBossDefs.length-1);
        const d=akBossDefs[tier];
        const hp=Math.round(30+tier*20);
        ak.boss={name:d.name,x:AW/2-d.w/2,y:40,baseY:40,w:d.w,h:d.h,hp,maxHp:hp,vx:d.vx,kind:d.kind,t:0,tier,body:d.body,trim:d.trim};
        ak.bossBullets=[];ak.bossTimer=0;ak.warning=0;ak.warningX=0;ak.laser=0;ak.laserX=0;
      } else ak.boss=null;
    }
    function bossAttack(){
      const b=ak.boss; if(!b)return;
      if(b.kind===0){for(let i=-1;i<=1;i++)ak.bossBullets.push({x:b.x+b.w/2,y:b.y+b.h,vx:i*70,vy:240,r:6});}
      else if(b.kind===1){for(const c of[0,COLS-1])ak.bricks.push({x:cellX(c),y:cellY(0),w:BW,h:BH,hp:1,maxHp:1,type:'moving',value:10,vx:c?40:-40});}
      else{ak.warningX=clamp(ak.paddle.x+ak.paddle.w/2,25,AW-25);ak.warning=800;}
    }
    function reset(){
      ak={paddle:{x:(AW-PAD_W0)/2,w:PAD_W0},balls:[],bricks:[],particles:[],
        lives:3,points:0,phase:1,combo:0,over:false,speed:speedFor(1),
        boss:null,bossBullets:[],bossTimer:0,warning:0,warningX:0,laser:0,laserX:0};
      ak.balls=[{x:ak.paddle.x+ak.paddle.w/2,y:PAD_Y-7,r:7,stuck:true}];
      keysAk.left=keysAk.right=false;
      buildBricks();maybeSpawnBoss();updateHUD();
    }
    function launch(){if(!ak||ak.over)return;
      for(const b of ak.balls)if(b.stuck){
        b.stuck=false;
        const ang=rnd(-.22,.22);
        b.vx=Math.sin(ang)*ak.speed;b.vy=-Math.cos(ang)*ak.speed;
        sfx('bounce');
      }
    }
    function burstAk(x,y,color){for(let i=0;i<10;i++)ak.particles.push({x,y,vx:rnd(-140,140),vy:rnd(-140,140),life:.5,color});}
    function circleRect(b,r){
      const cx=clamp(b.x,r.x,r.x+r.w),cy=clamp(b.y,r.y,r.y+r.h);
      const dx=b.x-cx,dy=b.y-cy;return dx*dx+dy*dy<=b.r*b.r;
    }
    function hitBrick(br,b){
      if(br.type==='armored'){ // ball bounces off armored; only laser breaks it
        const cx=clamp(b.x,br.x,br.x+br.w),cy=clamp(b.y,br.y,br.y+br.h);
        const dx=b.x-cx,dy=b.y-cy;
        if(Math.abs(dx)>Math.abs(dy)){b.vx=dx>0?Math.abs(b.vx):-Math.abs(b.vx);b.x=dx>0?br.x+br.w+b.r:br.x-br.r;}
        else{b.vy=dy>0?Math.abs(b.vy):-Math.abs(b.vy);b.y=dy>0?br.y+br.h+b.r:br.y-br.r;}
        sfx('tough');return;
      }
      br.hp--;
      if(br.hp<=0){
        ak.combo=Math.min(ak.combo+1,9);
        ak.points+=br.value*(1+ak.combo);
        burstAk(b.x,b.y,brickColor(br));
        sfx(br.type==='explosive'?'brick':'brick');
        if(br.type==='explosive')explodeBrick(br);
      }else sfx('tough');
      const cx=clamp(b.x,br.x,br.x+br.w),cy=clamp(b.y,br.y,br.y+br.h);
      const dx=b.x-cx,dy=b.y-cy;
      if(Math.abs(dx)>Math.abs(dy)){b.vx=dx>0?Math.abs(b.vx):-Math.abs(b.vx);b.x=dx>0?br.x+br.w+b.r:br.x-br.r;}
      else{b.vy=dy>0?Math.abs(b.vy):-Math.abs(b.vy);b.y=dy>0?br.y+br.h+b.r:br.y-br.r;}
    }
    // Explosive brick clears its 1-cell neighbourhood (AoE).
    function explodeBrick(br){
      const cx=br.x+br.w/2, cy=br.y+br.h/2;
      burstAk(cx,cy,'#ff8800');
      for(const o of ak.bricks)if(o!==br&&o.hp>0&&Math.abs((o.x+o.w/2)-cx)<BW+GAP+2&&Math.abs((o.y+o.h/2)-cy)<BH+GAP+2){
        o.hp--;ak.points+=o.value;
        if(o.hp<=0){burstAk(o.x+o.w/2,o.y+o.h/2,brickColor(o));if(o.type==='explosive')explodeBrick(o);}
      }
    }
    function nextPhase(){
      ak.phase++;
      ak.speed=speedFor(ak.phase);
      buildBricks();maybeSpawnBoss();
      ak.balls=[{x:ak.paddle.x+ak.paddle.w/2,y:PAD_Y-7,r:7,stuck:true}];
      sfx('wave');updateHUD();
    }
    function loseLife(){
      ak.lives--;ak.combo=0;sfx('loseLife');
      if(ak.lives<=0){gameOver();return;}
      ak.balls=[{x:ak.paddle.x+ak.paddle.w/2,y:PAD_Y-7,r:7,stuck:true}];
    }
    function gameOver(){
      ak.over=true;keysAk.left=keysAk.right=false;
      akOverlay.style.display='flex';
      const title=$('akTitle');if(title)title.textContent='Fim de jogo · fase '+ak.phase;
      akStart.style.display='none';akRestart.style.display='';
      window.submitScore && window.submitScore('arkanoid',ak.points);
      sfx('gameOver');
    }
    function update(ms){if(!ak||ak.over)return;
      const dt=ms/1000;
      ak.paddle.x=clamp(ak.paddle.x+(Number(keysAk.right)-Number(keysAk.left))*PAD_SPEED*dt,0,AW-ak.paddle.w);
      const pcx=ak.paddle.x+ak.paddle.w/2;
      for(const b of ak.balls){
        if(b.stuck){b.x=pcx;b.y=PAD_Y-b.r;continue;}
        const dist=Math.hypot(b.vx,b.vy)*dt;
        const steps=Math.max(1,Math.ceil(dist/8));
        for(let i=0;i<steps;i++){
          b.x+=b.vx*dt/steps;b.y+=b.vy*dt/steps;
          if(b.x<b.r){b.x=b.r;b.vx=Math.abs(b.vx);sfx('bounce');}
          else if(b.x>AW-b.r){b.x=AW-b.r;b.vx=-Math.abs(b.vx);sfx('bounce');}
          if(b.y<b.r){b.y=b.r;b.vy=Math.abs(b.vy);sfx('bounce');}
          if(b.vy>0&&b.y+b.r>=PAD_Y&&b.y-b.r<=PAD_Y+PAD_H&&b.x>=ak.paddle.x-6&&b.x<=ak.paddle.x+ak.paddle.w+6){
            const off=clamp((b.x-pcx)/(ak.paddle.w/2),-1,1);
            const ang=off*MAX_TILT,sp=ak.speed;
            b.vx=Math.sin(ang)*sp;b.vy=-Math.cos(ang)*sp;
            b.y=PAD_Y-b.r-0.5;
            ak.combo=0;sfx('bounce');
          }
          for(const br of ak.bricks)if(br.hp>0&&circleRect(b,br)){hitBrick(br,b);break;}
          if(ak.boss&&ak.boss.hp>0&&circleRect(b,ak.boss)){ak.boss.hp--;sfx('bossHit');burstAk(b.x,b.y,ak.boss.body);b.vy=-Math.abs(b.vy);b.y=ak.boss.y+ak.boss.h+b.r;break;}
          if(b.y>AH+20){b.dead=true;break;}
        }
      }
      // Moving bricks drift once per frame and bounce off the side walls.
      for(const br of ak.bricks)if(br.hp>0&&br.vx){br.x+=br.vx*dt;if(br.x<2||br.x+br.w>AW-2)br.vx*=-1;}
      if(ak.boss){const b=ak.boss;
        b.t+=dt;
        b.x+=b.vx*dt;if(b.x<8||b.x+b.w>AW-8){b.x=clamp(b.x,8,AW-8-b.w);b.vx*=-1;}
        if(b.kind===1)b.y=b.baseY+Math.sin(b.t*1.6)*28;
        if(b.kind===2)b.y=b.baseY+Math.sin(b.t*0.9)*40;
        if(ak.warning>0){ak.warning-=ms;if(ak.warning<=0){ak.laser=380;ak.laserX=ak.warningX;}}
        if(ak.laser>0){ak.laser-=ms;if(Math.abs((ak.paddle.x+ak.paddle.w/2)-ak.laserX)<24)loseLife();}
        for(const pb of ak.bossBullets){pb.x+=pb.vx*dt;pb.y+=pb.vy*dt;
          if(pb.y>AH+20||pb.x<-20||pb.x>AW+20){pb.dead=true;continue;}
          if(pb.y+pb.r>=PAD_Y&&pb.y-pb.r<=PAD_Y+PAD_H&&pb.x>=ak.paddle.x&&pb.x<=ak.paddle.x+ak.paddle.w){pb.dead=true;sfx('loseLife');loseLife();}
        }
        ak.bossBullets=ak.bossBullets.filter(pb=>!pb.dead);
      }
      ak.balls=ak.balls.filter(b=>!b.dead);
      if(!ak.balls.length){loseLife();if(ak.over)return;}
      for(const p of ak.particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;}
      ak.particles=ak.particles.filter(p=>p.life>0);
      if(ak.boss){if(ak.boss.hp<=0){ak.points+=500*(ak.boss.tier+1);sfx('bossDown');nextPhase();return;}
        if(ak.bossTimer==null)ak.bossTimer=0;
        ak.bossTimer+=ms;
        const cadence=Math.max(700,1600-ak.boss.tier*150);
        if(ak.bossTimer>=cadence){ak.bossTimer=0;bossAttack();}
      }
      if(!ak.boss&&!ak.bricks.some(br=>br.hp>0)){nextPhase();return;}
      updateHUD();
    }
    function draw(){if(!ctx)return;
      ctx.fillStyle='#101329';ctx.fillRect(0,0,AW,AH);
      for(let i=0;i<35;i++){ctx.fillStyle='#283452';ctx.fillRect((i*97)%AW,(i*137)%AH,2,2);}
      if(!ak)return;
      for(const br of ak.bricks)if(br.hp>0){
        ctx.fillStyle=brickColor(br);ctx.fillRect(br.x,br.y,br.w,br.h);
        ctx.fillStyle='rgba(255,255,255,.28)';ctx.fillRect(br.x+2,br.y+2,br.w-4,3);
        if(br.type==='armored'){ctx.fillStyle='#dde';ctx.fillRect(br.x+6,br.y+6,br.w-12,br.h-12);}
        if(br.type==='explosive'){ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(br.x+br.w/2,br.y+br.h/2,5,0,Math.PI*2);ctx.fill();}
      }
      if(ak.warning>0){ctx.fillStyle='rgba(255,60,70,.18)';ctx.fillRect(ak.warningX-22,0,44,AH);
        ctx.strokeStyle='#ff5566';ctx.strokeRect(ak.warningX-22,0,44,AH);}
      if(ak.laser>0){ctx.fillStyle='rgba(255,90,100,.4)';ctx.fillRect(ak.laserX-10,0,20,AH);
        ctx.fillStyle='#ffffff';ctx.fillRect(ak.laserX-3,0,6,AH);}
      if(ak.boss){const b=ak.boss;
        ctx.fillStyle=b.body;ctx.fillRect(b.x,b.y+10,b.w,b.h-10);ctx.fillRect(b.x+18,b.y,b.w-36,12);
        ctx.fillStyle=b.trim;ctx.fillRect(b.x+8,b.y+b.h-12,14,10);ctx.fillRect(b.x+b.w-22,b.y+b.h-12,14,10);
        ctx.fillStyle='#101329';ctx.fillRect(b.x+26,b.y+16,12,10);ctx.fillRect(b.x+b.w-38,b.y+16,12,10);
      }
      ctx.fillStyle='#ff5577';for(const pb of ak.bossBullets){ctx.beginPath();ctx.arc(pb.x,pb.y,pb.r,0,Math.PI*2);ctx.fill();}
      ctx.shadowColor='#00f2fe';ctx.shadowBlur=14;
      const grd=ctx.createLinearGradient(ak.paddle.x,0,ak.paddle.x+ak.paddle.w,0);
      grd.addColorStop(0,'#00f2fe');grd.addColorStop(1,'#f093fb');
      ctx.fillStyle=grd;
      ctx.fillRect(ak.paddle.x,PAD_Y,ak.paddle.w,PAD_H);
      ctx.shadowBlur=0;
      ctx.fillStyle='#ffffff';ctx.shadowColor='#ffe35a';ctx.shadowBlur=12;
      for(const b of ak.balls){ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();}
      ctx.shadowBlur=0;
      for(const p of ak.particles){ctx.globalAlpha=clamp(p.life*2,0,1);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,3,3);}
      ctx.globalAlpha=1;
    }
    function frame(t){if(!ak||ak.over){raf=null;draw();return;}
      if(last===null)last=t;const ms=clamp(t-last,0,50);last=t;
      update(ms);draw();
      if(!ak.over)raf=requestAnimationFrame(frame);else raf=null;
    }
    function run(){if(raf!==null)cancelAnimationFrame(raf);last=null;raf=requestAnimationFrame(frame);}
    function start(){if(raf!==null){cancelAnimationFrame(raf);raf=null;}
      akOverlay.style.display='none';reset();run();
    }
    akHooks={open:()=>{if(ak&&!ak.over&&raf===null)run();else draw();},
      close:()=>{if(raf!==null){cancelAnimationFrame(raf);raf=null;}last=null;}};
    akStart.addEventListener('click',start);akRestart.addEventListener('click',start);
    document.addEventListener('keydown',e=>{
      if(!ak||ak.over)return;
      if(['ArrowLeft','ArrowRight','a','A','d','D',' ','r','R'].includes(e.key))e.preventDefault();
      if(e.key==='ArrowLeft'||e.key.toLowerCase()==='a')keysAk.left=true;
      if(e.key==='ArrowRight'||e.key.toLowerCase()==='d')keysAk.right=true;
      if(e.key===' ')launch();
      if(e.key.toLowerCase()==='r')start();
    });
    document.addEventListener('keyup',e=>{
      if(e.key==='ArrowLeft'||e.key.toLowerCase()==='a')keysAk.left=false;
      if(e.key==='ArrowRight'||e.key.toLowerCase()==='d')keysAk.right=false;
    });
    window.addEventListener('blur',()=>{keysAk.left=keysAk.right=false;});
    if(!akSec.classList.contains('minimized'))draw();
  })();
  const hooks={targetGameSection:targetHooks, siGameSection:{
    open:()=>{if(g&&!g.ended&&raf===null)run();else draw();},
    close:()=>{if(raf!==null){cancelAnimationFrame(raf);raf=null;}last=null;}
  }, arkanoidGameSection:akHooks};
  for(const [iconId,sectionId] of [['targetGameIcon','targetGameSection'],['spaceInvadersIcon','siGameSection'],['arkanoidIcon','arkanoidGameSection']]){
    const icon=$(iconId),area=$(sectionId),hook=hooks[sectionId];
    if(!icon||!area)continue;
    let handled=null;
    const toggle=stamp=>{
      if(stamp===handled)return;handled=stamp;
      const wasCollapsed=area.classList.contains('minimized');
      area.classList.toggle('minimized');
      if(card){const anyOpen=!$('targetGameSection').classList.contains('minimized')||!$('siGameSection').classList.contains('minimized')||!$('arkanoidGameSection').classList.contains('minimized');card.classList.toggle('game-open',anyOpen);}
      if(!hook)return;
      if(wasCollapsed)hook.open();else hook.close();
    };
    icon.addEventListener('click',e=>toggle(e.timeStamp));
    area.addEventListener('click',e=>{if(area.classList.contains('minimized'))toggle(e.timeStamp);});
  }
  if(!section.classList.contains('minimized'))draw();
})();
