# 🎮 Space Invaders - Plano de Melhorias

## Visão Geral

Este documento descreve as etapas de implementação das melhorias no jogo Space Invaders, incluindo sistema de power-ups e melhorias no sistema de níveis.

---

## 🎯 Power-ups

### Especificações Gerais

| Power-up | Tipo | Duração | Acumulativo? |
|----------|------|---------|--------------|
| ⚡ Speed Boost | Permanente | ∞ | ✅ Sim |
| 🔥 Multi-Shot | Temporário | 10s | ❌ Não |
| 💣 Bomb | Instantâneo | - | ❌ Não |
| 🛡️ Shield | Temporário | 5s | ❌ Não |
| ⚡ Rapid Fire | Temporário | 6s | ❌ Não |

### Drop System

- **Chance de drop:** 15% quando inimigo morre
- **Máximo de power-ups na tela:** 3
- **Tempo de existência:** 20s (depois some)
- **Visual:** Caixa brilhante com ícone do power-up

---

## 📐 Etapa 1: Classe Base PowerUp

**Arquivo:** `script.js` — Nova classe antes de `SpaceInvaders`

### O que criar:

```javascript
class PowerUp {
    constructor(type, x, y) {
        this.type = type;        // 'speed' | 'multishot' | 'bomb' | 'shield' | 'rapidfire'
        this.x = x;
        this.y = y;
        this.width = 20;
        this.height = 20;
        this.active = true;
        this.timer = 0;          // Para temporários
        this.maxTimer = 20000;   // 20s até sumir
        this.blinkTimer = 0;     // Para efeito visual
    }

    draw(ctx) {
        // Desenhar caixa brilhante com ícone
        // Efeito de pulsação
    }

    update() {
        // Timer de expiração
        // Efeito visual de blink quando prestes a expirar
    }

    getIcon() {
        // Retornar emoji/símbolo baseado no tipo
    }

    getColor() {
        // Retornar cor baseada no tipo
    }
}
```

### Mudanças em `SpaceInvaders`:

```javascript
// Adicionar propriedades:
this.powerUps = [];
this.activePowerUps = {
    speed: 1,           // Multiplicador permanente
    multishot: false,
    shield: false,
    rapidfire: false
};
```

### Mudanças em `update()`:

```javascript
// Atualizar power-ups na tela
this.powerUps.forEach(p => p.update());
this.powerUps = this.powerUps.filter(p => p.active);
```

### Mudanças em `draw()`:

```javascript
// Desenhar power-ups
this.powerUps.forEach(p => p.draw(this.ctx));
```

### Mudanças em `checkCollisions()`:

```javascript
// Verificar colisão player com power-up
for (const powerUp of this.powerUps) {
    if (this.rectIntersect(powerUp, this.player)) {
        this.applyPowerUp(powerUp);
        powerUp.active = false;
    }
}
```

### Nova função em `SpaceInvaders`:

```javascript
applyPowerUp(powerUp) {
    switch(powerUp.type) {
        case 'speed':
            this.player.speed *= 2;
            this.activePowerUps.speed *= 2;
            break;
        case 'multishot':
            this.activePowerUps.multishot = true;
            setTimeout(() => { this.activePowerUps.multishot = false; }, 10000);
            break;
        // ... outros cases
    }
}
```

### Drop System em `checkCollisions()`:

```javascript
// Quando inimigo morre, 15% chance de dropar power-up
if (Math.random() < 0.15 && this.powerUps.length < 3) {
    const types = ['speed', 'multishot', 'bomb', 'shield', 'rapidfire'];
    const type = types[Math.floor(Math.random() * types.length)];
    this.powerUps.push(new PowerUp(type, enemy.x, enemy.y));
}
```

**Status:** ⬜ Pendente

---

## ⚡ Etapa 2: Speed Boost (Permanente + Acumulativo)

### Comportamento:

- Cada power-up coletado **dobra** a velocidade atual
- Efeito é **permanente** (não expira)
- Mostra indicador visual no HUD

### Mudanças na classe `Player`:

```javascript
// A velocidade já é this.speed = 5
// O power-up multiplica: this.speed *= 2
```

### HUD - Novo elemento visual:

```html
<div class="hud-speed">SPEED: <span id="siSpeed">1x</span></div>
```

### Visual na nave:

- Cor muda conforme multiplicador:
  - 1x: verde (#00ff88)
  - 2x: azul (#0088ff)
  - 4x: roxo (#ff00ff)
  - 8x+: dourado (#ffff00)

### Mudança no HUD (etapa 1 já prepara):

```javascript
// Em updateHUD(), adicionar:
siSpeedEl.textContent = this.activePowerUps.speed + 'x';
```

**Status:** ⬜ Pendente (depende de Etapa 1)

---

## 🔥 Etapa 3: Multi-Shot

### Comportamento:

- Dispara 2 ou 3 tiros paralelos
- Duração: 10 segundos
- Tiros são espaçados horizontalmente

### Mudanças em `Player.shoot()`:

```javascript
shoot() {
    if (this.shootCooldown <= 0 && this.canShoot) {
        const shotCount = this.activePowerUps.multishot ? 
            (Math.random() > 0.5 ? 3 : 2) : 1;
        
        if (shotCount === 1) {
            this.bullets.push(new Bullet(this.x, this.y, 'player'));
        } else if (shotCount === 2) {
            this.bullets.push(new Bullet(this.x - 8, this.y, 'player'));
            this.bullets.push(new Bullet(this.x + 8, this.y, 'player'));
        } else {
            this.bullets.push(new Bullet(this.x - 12, this.y, 'player'));
            this.bullets.push(new Bullet(this.x, this.y, 'player'));
            this.bullets.push(new Bullet(this.x + 12, this.y, 'player'));
        }
        
        this.shootCooldown = this.maxCooldown;
        this.canShoot = false;
    }
}
```

### Visual:

- Quando ativo, nave mostra 2 ou 3 canhões pequenos nos lados
- Cor dos tiros: laranja ao invés de verde

**Status:** ⬜ Pendente (depende de Etapa 1)

---

## 💣 Etapa 4: Bomb

### Comportamento:

- Efeito **instantâneo** (não temporário)
- Mata 30% dos inimigos na tela (aleatório)
- Efeito visual de explosão em toda a tela

### Implementação:

```javascript
applyPowerUp(powerUp) {
    if (powerUp.type === 'bomb') {
        // Matar 30% dos inimigos aleatoriamente
        const toKill = Math.floor(this.enemies.length * 0.3);
        const indices = this.enemies.map((_, i) => i);
        // Embaralhar
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        // Matar
        for (let i = 0; i < toKill; i++) {
            const idx = indices[i];
            if (this.enemies[idx]) {
                this.enemies[idx].alive = false;
                this.createExplosion(
                    this.enemies[idx].x + this.enemies[idx].width / 2,
                    this.enemies[idx].y + this.enemies[idx].height / 2,
                    '#ffff00'
                );
            }
        }
        this.enemies = this.enemies.filter(e => e.alive);
        this.score += toKill * 100;
        
        // Efeito visual de tela inteira
        this.screenFlash = 10; // Frames de flash branco
    }
}
```

### Visual:

- Flash branco na tela por 10 frames
- Partículas amarelas nos inimigos destruídos
- Som de explosão (se tiver)

**Status:** ⬜ Pendente (depende de Etapa 1)

---

## 🛡️ Etapa 5: Shield

### Comportamento:

- Invencibilidade por 5 segundos
- Bullets inimigos não causam dano
- Visual: escudo verde ao redor da nave

### Mudanças em `Player`:

```javascript
// Adicionar propriedade:
this.invulnerable = false;
```

### Mudanças em `checkCollisions()`:

```javascript
// Verificar se player é invulnerável antes de aplicar dano
for (const bullet of this.enemyBullets) {
    if (this.rectIntersect(bullet, this.player)) {
        bullet.active = false;
        if (!this.player.invulnerable) {
            this.player.alive = false;
            this.lives--;
            if (this.lives <= 0) {
                this.gameOver = true;
            }
        }
    }
}
```

### Visual:

- Círculo verde semitransparente ao redor da nave
- Raio: 40px
- Pisca quando perto da expiração (< 2s)

```javascript
draw(ctx) {
    if (this.invulnerable) {
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x + this.width/2, this.y + this.height/2, 40, 0, Math.PI * 2);
        ctx.stroke();
    }
}
```

**Status:** ⬜ Pendente (depende de Etapa 1)

---

## ⚡ Etapa 6: Rapid Fire

### Comportamento:

- Cooldown de tiro reduz pela metade (10 → 5 frames)
- Duração: 6 segundos
- Visual: nave pisca rapidamente

### Mudanças em `Player`:

```javascript
// Em shoot():
shoot() {
    if (this.shootCooldown <= 0 && this.canShoot) {
        // ...
        this.shootCooldown = this.maxCooldown;
        if (this.activePowerUps.rapidfire) {
            this.shootCooldown = Math.floor(this.maxCooldown / 2);
        }
        // ...
    }
}
```

### Visual:

- Nave alterna entre cor normal e amarelo
- Frequência: 3x por segundo

**Status:** ⬜ Pendente (depende de Etapa 1)

---

## 🎚️ Etapa 7: Melhorias no Sistema de Níveis

### Escala de Dificuldade (nova):

| Level | Intervalo (ms) | Linhas | Inimigos Totais |
|-------|-----------------|--------|-----------------|
| 1 | 1500 | 4 | 32 |
| 2 | 1400 | 5 | 40 |
| 3 | 1200 | 6 | 48 |
| 4 | 1000 | 7 | 56 |
| 5+ | 800 mínimo | 8 | 64 |

### Código modificado em `initLevel()`:

```javascript
this.enemyMoveInterval = Math.max(800, 1500 - (this.level - 1) * 200);
this.enemyRows = Math.min(this.enemyRows + 1, 8);
```

### Feedback Visual de Level Up:

```javascript
// Nova propriedade:
this.levelUpTimer = 0;
this.levelUpText = '';

// Em checkWinCondition() ou onde o level sobe:
this.level++;
this.levelUpTimer = 120; // 2 segundos a 60fps
this.levelUpText = 'LEVEL ' + this.level + '!';

// Em draw():
if (this.levelUpTimer > 0) {
    this.levelUpTimer--;
    // Desenhar texto de level up no centro da tela
    ctx.fillStyle = '#ffff00';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(this.levelUpText, this.width / 2, this.height / 2);
    this.levelUpText = 'LEVEL ' + this.level + '!';
}
```

### Bônus por Level:

```javascript
// Ao subir de nível, dar 1 power-up aleatório gratuito
if (this.levelUpTimer > 0) {
    const types = ['speed', 'multishot', 'bomb', 'shield', 'rapidfire'];
    const type = types[Math.floor(Math.random() * types.length)];
    // Aplicar diretamente sem drop
    this.applyPowerUp(new PowerUp(type, this.width/2, this.height/2));
}
```

**Status:** ⬜ Pendente

---

## 🎨 Etapa 8: Visual e Feedback

### HUD Atualizado:

```
SCORE: 00000  LIVES: ❤❤❤  LEVEL: 1  SPEED: 2x
```

### Barra de Power-ups Ativos:

```
[⚡2x] [🔥8s] [🛡️3s]
```

### Efeitos de Partículas:

- Ao coletar power-up: explosão de partículas da cor do power-up
- Ao destruir inimigo com bomb: partículas amarelas em todos os inimigos destruídos

### Cores dos Power-ups:

| Tipo | Cor | Ícone |
|------|-----|-------|
| Speed | Azul | ⚡ |
| Multi-Shot | Laranja | 🔥 |
| Bomb | Amarelo | 💣 |
| Shield | Verde | 🛡️ |
| Rapid Fire | Amarelo claro | ⚡⚡ |

**Status:** ⬜ Pendente

---

## 📊 Ordem de Implementação Recomendada

```
1. Classe Base PowerUp      ← FUNDAÇÃO
   ↓
2. Speed Boost              ← PERMANENTE
   ↓
3. Multi-Shot               ← TEMPORÁRIO
   ↓
4. Bomb                     ← INSTANTÂNEO
   ↓
5. Shield                   ← TEMPORÁRIO
   ↓
6. Rapid Fire              ← TEMPORÁRIO
   ↓
7. Melhorias de Nível       ← POLIMENTO
   ↓
8. Visual/Feedback          ← POLIMENTO
```

---

## ✅ Checkpoint

- [x] Etapa 1: Classe Base PowerUp
- [x] Etapa 2: Speed Boost
- [x] Etapa 3: Multi-Shot
- [x] Etapa 4: Bomb
- [x] Etapa 5: Shield
- [x] Etapa 6: Rapid Fire
- [x] Etapa 7: Melhorias no Sistema de Níveis
- [x] Etapa 8: Visual e Feedback

---

**Última atualização:** 2026-06-15
**Autor:** Claude Code
