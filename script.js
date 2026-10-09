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
    let points=0, record=0, timer;
    try {record=Number(localStorage.getItem('targetGameHighscore'))||0;} catch (_) {}
    best.textContent=record;
    function spawn() {
      if (!board.isConnected) return;
      const t=document.createElement('div'); t.className='target';
      t.textContent=['🎯','⭐','💎','🔥','⚡'][Math.floor(rnd(0,5))];
      t.style.left=rnd(0,Math.max(0,board.clientWidth-50))+'px';
      t.style.top=rnd(0,Math.max(0,board.clientHeight-50))+'px';
      t.addEventListener('pointerdown',()=>{
        if (!t.isConnected || t.dataset.hit) return;
        t.dataset.hit='1'; score.textContent=++points;
        if (points>record) {best.textContent=record=points;
          try {localStorage.setItem('targetGameHighscore',String(record));} catch (_) {}}
        t.classList.add('target-correct'); setTimeout(()=>t.remove(),150);
      });
      board.appendChild(t);
      setTimeout(()=>{if(t.isConnected&&!t.dataset.hit){t.classList.add('target-missed');setTimeout(()=>t.remove(),500);}},2000);
    }
    function start() {clearInterval(timer); board.querySelectorAll('.target').forEach(t=>t.remove());
      score.textContent=points=0;spawn();timer=setInterval(spawn,1000);}
    restart.addEventListener('click',start);
    if(!sec||!sec.classList.contains('minimized')) start();
    targetHooks={open:()=>start(), close:()=>{clearInterval(timer);board.querySelectorAll('.target').forEach(t=>t.remove());}};
  })();

  const canvas=$('siCanvas'), overlay=$('siOverlay'), startBtn=$('siStartBtn');
  const restartBtn=$('siRestartBtn'), section=$('siGameSection');
  if (!canvas || !overlay || !startBtn || !restartBtn || !section) return;
  const ctx=canvas.getContext('2d'); if(!ctx) return;
  const W=canvas.width,H=canvas.height, BASE_SPEED=250;
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
  const bossNames=['Sentinela Ômega','Matriarca do Enxame','Núcleo da Frota'];
  const keys={left:false,right:false,shoot:false};
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
  const help=document.createElement('span');help.textContent='← → ou A/D mover · Espaço atirar · R reiniciar';controls.appendChild(help);
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
      enemyTimer:0,enemyDir:1,fireTimer:0,bossTimer:0,warning:0,warningX:0,flash:0,ended:false};
    keys.left=keys.right=keys.shoot=false;
    initLevel();updateHUD();
  }
  function initLevel(){
    g.enemies=[];g.boss=null;g.bullets=[];g.enemyBullets=[];g.powerUps=[];
    g.enemyTimer=0;g.enemyDir=1;g.fireTimer=0;g.bossTimer=0;g.warning=0;
    if(g.level%5===0){
      const tier=Math.floor(g.level/5)-1;
      const hp=Math.round((20+tier*14)*g.mode.hp);
      g.boss={name:bossNames[Math.min(tier,bossNames.length-1)],x:W/2-65,y:48,w:130,h:56,
        hp,maxHp:hp,vx:80+tier*20,phase:0};
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
      const name=bossNames[Math.min(Math.floor(g.level/5)-1,bossNames.length-1)];
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
    g.shot=Math.max(0,g.shot-ms);if(keys.shoot)shoot();
    for(const k of Object.keys(g.timers))g.timers[k]=Math.max(0,g.timers[k]-ms);
    g.invulnerable=Math.max(0,g.invulnerable-ms);g.flash=Math.max(0,g.flash-ms);
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
        if(e.y+e.h>=g.y){end();return;}
      }
    }
    if(g.boss){const b=g.boss;
      b.x+=b.vx*dt;if(b.x<=8||b.x+b.w>=W-8){b.x=clamp(b.x,8,W-8-b.w);b.vx*=-1;}
      g.bossTimer+=ms;
      if(g.warning>0){g.warning-=ms;
        if(g.warning<=0){ // Rajada concentrada: telegráfica e evitável.
          for(let i=-1;i<=1;i++)bullet(g.warningX+i*11,b.y+b.h,i*35,240*g.mode.bullet);
        }
      }
      const cadence=Math.max(600,(1700-tier*150)*g.mode.fire);
      if(g.bossTimer>=cadence){g.bossTimer=0;b.phase++;
        if(b.phase%3===0){g.warningX=clamp(g.x+g.w/2,25,W-25);g.warning=650;}
        else for(let i=-2;i<=2;i++)bullet(b.x+b.w/2,b.y+b.h,i*75,(205+tier*22)*g.mode.bullet);
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
    if(g.boss){const b=g.boss;ctx.fillStyle='#b33369';ctx.fillRect(b.x,b.y,b.w,b.h);
      ctx.fillStyle='#ff6688';ctx.fillRect(b.x+15,b.y+12,b.w-30,17);
      ctx.fillStyle='#101329';ctx.fillRect(b.x+33,b.y+15,14,10);ctx.fillRect(b.x+b.w-47,b.y+15,14,10);
      ctx.fillStyle='#ffcc00';ctx.fillRect(b.x+b.w/2-10,b.y+34,20,12);
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
    if(['ArrowLeft','ArrowRight',' ','a','A','d','D','r','R'].includes(e.key))e.preventDefault();
    if(e.key==='ArrowLeft'||e.key.toLowerCase()==='a')keys.left=true;
    if(e.key==='ArrowRight'||e.key.toLowerCase()==='d')keys.right=true;
    if(e.key===' '){keys.shoot=true;shoot();}
    if(e.key.toLowerCase()==='r')start();
  });
  document.addEventListener('keyup',e=>{
    if(e.key==='ArrowLeft'||e.key.toLowerCase()==='a')keys.left=false;
    if(e.key==='ArrowRight'||e.key.toLowerCase()==='d')keys.right=false;
    if(e.key===' ')keys.shoot=false;
  });
  window.addEventListener('blur',()=>{keys.left=keys.right=keys.shoot=false;});
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
