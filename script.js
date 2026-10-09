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
    // HUD created by script: Lives, Fase, Combo (Score/Recorde already in HTML).
    const hud=document.createElement('div');
    hud.style.cssText='display:flex;justify-content:center;gap:12px;flex-wrap:wrap;margin:10px 0;color:white;font:13px sans-serif';
    hud.innerHTML='<span>Lives: <b id="tgLives">❤❤❤</b></span><span>Fase: <b id="tgWave">1</b></span><span>Combo: <b id="tgCombo">x1</b></span>';
    sec.insertBefore(hud,board);
    const livesEl=$('tgLives'), waveEl=$('tgWave'), comboEl=$('tgCombo');
    const over=document.createElement('div'); over.className='tg-overlay';
    board.appendChild(over);
    function updateHUD(){ if(!tg)return;
      score.textContent=tg.points; best.textContent=record;
      livesEl.textContent='❤'.repeat(Math.max(0,tg.lives));
      waveEl.textContent=tg.wave; comboEl.textContent='x'+multFor(tg.combo);
    }
    function clearChains(){ if(!tg)return; clearTimeout(tg.spawnTimeout); clearTimeout(tg.moveTimeout); tg.spawnTimeout=tg.moveTimeout=null; }
    function clearTargets(){ board.querySelectorAll('.target').forEach(t=>t.remove()); }
    function loseLife(){ if(!tg||tg.over)return; tg.lives--; tg.combo=0; updateHUD(); if(tg.lives<=0)gameOver(); }
    function gameOver(){ if(!tg)return; tg.over=true; clearChains(); clearTargets();
      over.innerHTML='<div><h2 style="color:#ff5566">Fim de jogo</h2><p>Score: '+tg.points+' · Recorde: '+record+'</p><p>Precizi: '+Math.round(100*tg.hits/Math.max(1,tg.clicks))+'% · Fasa: '+tg.wave+'</p></div>';
      over.style.display='flex'; sfx('gameover'); }
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
      tg.moveTimeout=setTimeout(tickMove,50);
    }
    function scheduleNext(){ if(tg&&!tg.over)tg.spawnTimeout=setTimeout(spawnTarget,spawnEvery(tg.wave)); }
    function spawnTarget(){
      if(!tg||tg.over||!board.isConnected)return;
      const w=tg.wave, size=sizeFor(w), bomb=Math.random()<decoyProb(w);
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
          tg.points+=Number(t.dataset.value)*multFor(tg.combo);
          if(tg.points>record){record=tg.points;
            try{localStorage.setItem('targetGameHighscore',String(record));}catch(_){}}
          t.classList.add('target-correct'); sfx('hit');
          setTimeout(()=>t.remove(),150);
          const nw=waveFor(tg.hits);
          if(nw>tg.wave){tg.wave=nw;sfx('wave');}
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
      tg={points:0,lives:3,wave:1,combo:0,hits:0,clicks:0,over:false,spawnTimeout:null,moveTimeout:null};
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
  hud.innerHTML='<span>SCORE: <b id="siScore">00000</b></span><span>VIDAS: <b id="siLives">❤❤❤</b></span><span>FASE: <b id="siLevel">1</b></span><span>SPEED: <b id="siSpeed">1.00x</b></span><span id="siPowerUps"></span>';
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
  function updateHUD(){if(!g)return;
    $('siScore').textContent=String(g.score).padStart(5,'0');
    $('siLives').textContent='❤'.repeat(Math.max(0,g.lives));
    $('siLevel').textContent=g.level;$('siSpeed').textContent=g.speed.toFixed(2)+'x';
    $('siPowerUps').textContent=(g.timers.multishot?'🔥 ':'')+(g.timers.shield?'🛡️ ':'')+(g.timers.rapidfire?'⚡⚡':'');
    bossBar.style.display=g.boss?'block':'none';
    if(g.boss){$('siBossName').textContent=g.boss.name+' · '+Math.ceil(g.boss.hp)+' PV';
      $('siBossFill').style.width=clamp(100*g.boss.hp/g.boss.maxHp,0,100)+'%';}
  }
  const hit=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
  function burst(x,y,color){for(let i=0;i<12;i++)g.particles.push({x,y,vx:rnd(-130,130),vy:rnd(-130,130),life:.5,color});}
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
      g.ended=true;showStory('Vitória: sinal restaurado',
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
  }
  function damage(){if(g.invulnerable>0||g.timers.shield>0)return;
    g.lives--;g.invulnerable=1200;burst(g.x+g.w/2,g.y,'#00ff88');
    if(g.lives<=0)end();
  }
  function update(ms){if(!g||g.ended)return;
    const dt=ms/1000, tier=Math.floor((g.level-1)/5);
    g.x=clamp(g.x+(Number(keys.right)-Number(keys.left))*BASE_SPEED*g.speed*dt,0,W-g.w);
    g.y=clamp(g.y+(Number(keys.down)-Number(keys.up))*BASE_SPEED*g.speed*dt,Y_MIN,H-g.h);
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
    if(e.key===' '){keys.shoot=true;shoot();}
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
  const hooks={targetGameSection:targetHooks, siGameSection:{
    open:()=>{if(g&&!g.ended&&raf===null)run();else draw();},
    close:()=>{if(raf!==null){cancelAnimationFrame(raf);raf=null;}last=null;}
  }};
  for(const [iconId,sectionId] of [['targetGameIcon','targetGameSection'],['spaceInvadersIcon','siGameSection']]){
    const icon=$(iconId),area=$(sectionId),hook=hooks[sectionId];
    if(!icon||!area)continue;
    let handled=null;
    const toggle=stamp=>{
      if(stamp===handled)return;handled=stamp;
      const wasCollapsed=area.classList.contains('minimized');
      area.classList.toggle('minimized');
      if(!hook)return;
      if(wasCollapsed)hook.open();else hook.close();
    };
    icon.addEventListener('click',e=>toggle(e.timeStamp));
    area.addEventListener('click',e=>{if(area.classList.contains('minimized'))toggle(e.timeStamp);});
  }
  if(!section.classList.contains('minimized'))draw();
})();
