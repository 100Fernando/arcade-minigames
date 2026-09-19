// Verificar se o script está carregado
console.log('script.js carregado!');
console.log('document.readyState:', document.readyState);
const particlesContainer = document.getElementById('particles');
const particleCount = 30;
for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div');
    particle.classList.add('particle');
    const size = Math.random() * 6 + 2;
    const duration = Math.random() * 20 + 10;
    const left = Math.random() * 100;
    const delay = Math.random() * 20;
    particle.style.width = size + 'px';
    particle.style.height = size + 'px';
    particle.style.left = left + 'vw';
    particle.style.animationDuration = duration + 's';
    particle.style.animationDelay = '-' + delay + 's';
    particle.style.opacity = Math.random() * 0.5 + 0.2;
    particlesContainer.appendChild(particle);
}

// Criar estrelas
for (let i = 0; i < 50; i++) {
    const star = document.createElement('div');
    star.classList.add('star');
    star.style.left = Math.random() * 100 + 'vw';
    star.style.top = Math.random() * 100 + 'vh';
    star.style.animationDelay = Math.random() * 3 + 's';
    document.body.appendChild(star);
}

// ============================================
// GAME 1: TARGET GAME
// (P3-1: Verificação de existência de elementos DOM)
// (P3-2: IIFE para isolar erros)
// ============================================
(function() {
    try {
        const targetGameCanvasContainer = document.getElementById('targetGameCanvasContainer');
        const targetGameBoard = document.getElementById('gameBoard');
        const targetScoreEl = document.getElementById('score');
        const targetHighscoreEl = document.getElementById('highscore');
        const targetRestartBtn = document.getElementById('restartBtn');

        // P3-1: Verificar se todos os elementos essenciais existem
        if (!targetGameBoard || !targetScoreEl || !targetHighscoreEl || !targetRestartBtn) {
            console.warn('[Target Game] Elementos DOM faltantes:', {
                targetGameBoard: !!targetGameBoard,
                targetScoreEl: !!targetScoreEl,
                targetHighscoreEl: !!targetHighscoreEl,
                targetRestartBtn: !!targetRestartBtn
            });
            return; // Não inicia se elementos essenciais faltarem
        }

        let targets = [];
        let targetScore = 0;
        let targetHighscore = localStorage.getItem('targetGameHighscore') || 0;
        let targetGameActive = true;
        let targetSpawnInterval;
        let targetTimeout;
        targetHighscoreEl.textContent = targetHighscore;

        function createTarget() {
            if (!targetGameActive || !targetGameBoard) return;
            const target = document.createElement('div');
            target.classList.add('target');
            const icons = ['🎯', '⭐', '💎', '🔥', '⚡', '🌟'];
            target.textContent = icons[Math.floor(Math.random() * icons.length)];
            const boardRect = targetGameBoard.getBoundingClientRect();
            const size = 50;
            const maxX = boardRect.width - size;
            const maxY = boardRect.height - size;
            target.style.left = Math.random() * maxX + 'px';
            target.style.top = Math.random() * maxY + 'px';
            target.addEventListener('mousedown', function() {
                if (!targetGameActive) return;
                targetScore++;
                targetScoreEl.textContent = targetScore;
                if (targetScore > targetHighscore) {
                    targetHighscore = targetScore;
                    targetHighscoreEl.textContent = targetHighscore;
                    localStorage.setItem('targetGameHighscore', targetHighscore);
                }
                target.classList.add('target-correct');
                target.style.transform = 'scale(1.5)';
                setTimeout(function() {
                    target.remove();
                }, 150);
                spawnNextTarget();
            });
            targetGameBoard.appendChild(target);
            targetTimeout = setTimeout(function() {
                if (target.parentNode) {
                    target.classList.add('target-missed');
                    setTimeout(function() {
                        target.remove();
                    }, 500);
                }
            }, 2000);
        }

        function spawnNextTarget() {
            if (!targetGameActive || !targetGameBoard) return;
            targets.length = 0;
            createTarget();
        }

        function startTargetGame() {
            if (!targetGameBoard) return;
            targetScore = 0;
            targetScoreEl.textContent = targetScore;
            targetGameActive = true;
            if (targetSpawnInterval) clearInterval(targetSpawnInterval);
            targets.length = 0;
            spawnNextTarget();
            targetSpawnInterval = setInterval(spawnNextTarget, 1000);
        }

        targetRestartBtn.addEventListener('click', startTargetGame);
        startTargetGame();
    } catch(e) {
        console.error('[Target Game] Erro crítico:', e);
    }
})();

// ============================================
// GAME 2: SPACE INVADERS
// (P3-1: Verificação de existência de elementos DOM)
// (P3-2: IIFE para isolar erros)
// (P3-3: HUD update a cada frame)
// ============================================
(function() {
    try {
        // --- Classes ---

        class Player {
            constructor(canvas, game) {
                this.canvas = canvas;
                this.game = game;
                this.width = 40;
                this.height = 20;
                this.x = canvas.width / 2 - this.width / 2;
                this.y = canvas.height - 40;
                this.speed = 5;
                this.baseSpeed = 5; // Velocidade base para reset
                this.speedMultiplier = 1; // Multiplicador de speed
                this.bullets = [];
                this.canShoot = true;
                this.shootCooldown = 0;
                this.maxCooldown = 10;
                this.alive = true;
                this.invulnerable = false; // For shield power-up
                this.rapidfireFlashTimer = 0; // For rapid fire visual effect
            }

            move(direction) {
                if (direction === 'left' && this.x > 0) {
                    this.x -= this.speed;
                } else if (direction === 'right' && this.x < this.canvas.width - this.width) {
                    this.x += this.speed;
                }
            }

            shoot() {
                if (this.shootCooldown <= 0 && this.canShoot) {
                    // Check for multi-shot power-up
                    const shotCount = this.game && this.game.activePowerUps && this.game.activePowerUps.multishot ?
                        (Math.random() > 0.5 ? 3 : 2) : 1;

                    // Check for rapidfire power-up to reduce cooldown
                    const cooldown = this.game && this.game.activePowerUps && this.game.activePowerUps.rapidfire ?
                        Math.floor(this.maxCooldown / 2) : this.maxCooldown;

                    if (shotCount === 1) {
                        this.bullets.push(new Bullet(this.x, this.y, 'player'));
                    } else if (shotCount === 2) {
                        this.bullets.push(new Bullet(this.x - 8, this.y, 'player', 4, 10, '#ff8800'));
                        this.bullets.push(new Bullet(this.x + 8, this.y, 'player', 4, 10, '#ff8800'));
                    } else {
                        this.bullets.push(new Bullet(this.x - 12, this.y, 'player', 4, 10, '#ff8800'));
                        this.bullets.push(new Bullet(this.x, this.y, 'player', 4, 10, '#ff8800'));
                        this.bullets.push(new Bullet(this.x + 12, this.y, 'player', 4, 10, '#ff8800'));
                    }

                    this.shootCooldown = cooldown;
                    this.canShoot = false;
                }
            }

            update() {
                if (this.shootCooldown > 0) {
                    this.shootCooldown--;
                } else {
                    this.canShoot = true;
                }
            }

            getColor() {
                // Cor muda conforme multiplicador de speed
                if (this.speedMultiplier >= 8) return '#ffff00'; // Dourado
                if (this.speedMultiplier >= 4) return '#ff00ff'; // Roxo
                if (this.speedMultiplier >= 2) return '#0088ff'; // Azul
                return '#00ff88'; // Verde (base)
            }

            draw(ctx) {
                // Rapid Fire visual effect: ship alternates between normal color and yellow
                if (this.game && this.game.activePowerUps && this.game.activePowerUps.rapidfire) {
                    this.rapidfireFlashTimer += 1;
                    // Alternate every 10 frames (3 times per second at 60fps)
                    if (Math.floor(this.rapidfireFlashTimer / 10) % 2 === 0) {
                        // Normal color
                        const color = this.getColor();
                        ctx.fillStyle = color;
                        ctx.fillRect(this.x, this.y, this.width, this.height);
                        ctx.beginPath();
                        ctx.moveTo(this.x, this.y);
                        ctx.lineTo(this.x + this.width / 2, this.y - 10);
                        ctx.lineTo(this.x + this.width, this.y);
                        ctx.fill();
                        ctx.fillStyle = '#000';
                        ctx.fillRect(this.x + 5, this.y + 8, 3, 3);
                        ctx.fillRect(this.x + this.width - 8, this.y + 8, 3, 3);
                    } else {
                        // Yellow color
                        ctx.fillStyle = '#ffff00';
                        ctx.fillRect(this.x, this.y, this.width, this.height);
                        ctx.beginPath();
                        ctx.moveTo(this.x, this.y);
                        ctx.lineTo(this.x + this.width / 2, this.y - 10);
                        ctx.lineTo(this.x + this.width, this.y);
                        ctx.fill();
                        ctx.fillStyle = '#000';
                        ctx.fillRect(this.x + 5, this.y + 8, 3, 3);
                        ctx.fillRect(this.x + this.width - 8, this.y + 8, 3, 3);
                    }
                    return; // Skip normal drawing at the end
                }

                const color = this.getColor();
                ctx.fillStyle = color;
                ctx.fillRect(this.x, this.y, this.width, this.height);
                ctx.beginPath();
                ctx.moveTo(this.x, this.y);
                ctx.lineTo(this.x + this.width / 2, this.y - 10);
                ctx.lineTo(this.x + this.width, this.y);
                ctx.fill();
                ctx.fillStyle = '#000';
                ctx.fillRect(this.x + 5, this.y + 8, 3, 3);
                ctx.fillRect(this.x + this.width - 8, this.y + 8, 3, 3);
            }
        }

        class Enemy {
            constructor(canvas, x, y, type) {
                this.canvas = canvas;
                this.type = type;
                this.width = type === 0 ? 40 : (type === 1 ? 48 : 40);
                this.height = type === 0 ? 24 : (type === 1 ? 28 : 26);
                this.x = x;
                this.y = y;
                this.speed = type === 0 ? 1 : (type === 1 ? 1.5 : 1.2);
                this.bullets = [];
                this.shootCooldown = Math.random() * 200 + 100;
                this.maxCooldown = 300;
                this.alive = true;
                this.frame = 0;
                this.animTimer = 0;
            }

            draw(ctx) {
                if (!this.alive) return;
                const centerX = this.x + this.width / 2;
                const centerY = this.y + this.height / 2;
                ctx.fillStyle = '#ff3366';

                if (this.type === 0) {
                    this.drawAlien0(ctx, centerX, centerY);
                } else if (this.type === 1) {
                    this.drawCrab(ctx, centerX, centerY);
                } else {
                    this.drawOctopus(ctx, centerX, centerY);
                }
            }

            drawAlien0(ctx, centerX, centerY) {
                const eyeSize = 3;
                const headSize = 16;
                ctx.fillRect(centerX - headSize, centerY - headSize, headSize * 2, headSize);
                ctx.fillRect(centerX - headSize, centerY, headSize * 2, headSize);
                ctx.fillRect(centerX - 6, centerY - 6, eyeSize, eyeSize);
                ctx.fillRect(centerX + 1, centerY - 6, eyeSize, eyeSize);
                ctx.fillRect(centerX - 4, centerY + 9, 8, 2);
                const armOffset = Math.sin(this.animTimer) * 4;
                ctx.fillRect(centerX - 12, centerY - 10 + armOffset, 4, 8);
                ctx.fillRect(centerX + 8, centerY - 10 - armOffset, 4, 8);
                this.frame = (this.frame + 1) % 8;
                this.animTimer += 0.15;
            }

            drawCrab(ctx, centerX, centerY) {
                const size = 16;
                ctx.fillRect(centerX - size, centerY - size, size * 2, size);
                ctx.fillRect(centerX - size - 2, centerY + 4, 2, 12);
                ctx.fillRect(centerX - size + 2, centerY + 4, 2, 8);
                ctx.fillRect(centerX + size - 2, centerY + 4, 2, 12);
                ctx.fillRect(centerX + size - 2, centerY + 2, 2, 8);
                ctx.fillStyle = '#fff';
                ctx.fillRect(centerX - 6, centerY - 8, 3, 3);
                ctx.fillRect(centerX + 1, centerY - 8, 3, 3);
            }

            drawOctopus(ctx, centerX, centerY) {
                const size = 14;
                ctx.fillRect(centerX - size, centerY - size + 2, size * 2, size);
                for (let i = -2; i <= 2; i++) {
                    ctx.fillRect(centerX + i * 6, centerY - 8, 3, 8);
                }
                ctx.fillStyle = '#fff';
                ctx.fillRect(centerX - 5, centerY - 8, 3, 3);
                ctx.fillRect(centerX + 2, centerY - 8, 3, 3);
            }

            update() {
                this.shootCooldown--;
                if (this.shootCooldown <= 0) {
                    this.shootCooldown = this.maxCooldown;
                    this.bullets.push(new Bullet(this.x, this.y, 'enemy', this.width, this.height));
                }
            }
        }

        class Bullet {
            constructor(x, y, owner, width = 4, height = 10, color = null) {
                this.x = x;
                this.y = y;
                this.owner = owner;
                this.width = width;
                this.height = height;
                this.speed = owner === 'player' ? -8 : 6;
                this.active = true;
                this.color = color;
            }

            update() {
                this.y += this.speed;
                if (this.y < 0 || this.y > 600) {
                    this.active = false;
                }
            }

            draw(ctx) {
                if (this.color) {
                    ctx.fillStyle = this.color;
                } else if (this.owner === 'player') {
                    ctx.fillStyle = '#00ff88';
                } else {
                    ctx.fillStyle = '#ff3366';
                }
                ctx.fillRect(this.x, this.y, this.width, this.height);
            }
        }

        class Particle {
            constructor(x, y, color) {
                this.x = x;
                this.y = y;
                this.color = color;
                this.size = Math.random() * 3 + 1;
                this.vx = (Math.random() - 0.5) * 6;
                this.vy = (Math.random() - 0.5) * 6;
                this.life = 1;
                this.decay = Math.random() * 0.03 + 0.02;
            }

            update() {
                this.x += this.vx;
                this.y += this.vy;
                this.life -= this.decay;
            }

            draw(ctx) {
                ctx.globalAlpha = this.life;
                ctx.fillStyle = this.color;
                ctx.fillRect(this.x, this.y, this.size, this.size);
                ctx.globalAlpha = 1;
            }
        }

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
                this.vy = Math.random() * 2 + 2; // Velocidade vertical: 2-4 px/frame (rápido!)
                this.oscillationFreq = Math.random() * 0.03 + 0.01; // Frequência de oscilação
                this.oscillationAmp = Math.random() * 1.5 + 0.5;    // Amplitude: 0.5-2px
                this.size = 0;           // Para efeito de entrada (0 a 1)
                this.pulseOffset = Math.random() * Math.PI * 2;    // Offset para pulso
            }

            draw(ctx) {
                // Efeito de entrada (scale de 0 a 1 nos primeiros 10 frames)
                if (this.timer < 10) {
                    this.size = this.timer / 10;
                } else {
                    this.size = 1;
                }

                const color = this.getColor();
                const icon = this.getIcon();

                // Nos últimos 5s, piscar a cada 500ms
                const timeLeft = this.maxTimer - this.timer;
                if (timeLeft < 5000) {
                    // Piscar: renderizar apenas em metades ímpares do ciclo de 500ms
                    if (Math.floor(this.timer / 500) % 2 === 0) {
                        return; // Não desenhar neste frame
                    }
                }

                // Efeito de pulso
                const pulse = Math.sin(this.timer * 0.01 + this.pulseOffset) * 0.1 + 0.9;
                const sizeWithPulse = this.size * pulse;

                // Desenhar caixa brilhante
                ctx.save();
                ctx.shadowColor = color;
                ctx.shadowBlur = 10;
                ctx.fillStyle = color;
                ctx.fillRect(
                    this.x + (this.width - this.width * sizeWithPulse) / 2,
                    this.y + (this.height - this.height * sizeWithPulse) / 2,
                    this.width * sizeWithPulse,
                    this.height * sizeWithPulse
                );

                // Desenhar ícone
                ctx.shadowBlur = 0;
                ctx.fillStyle = '#000';
                ctx.font = '12px serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(icon, this.x + this.width / 2, this.y + this.height / 2);
                ctx.restore();
            }

            update(deltaTime) {
                this.timer += deltaTime;
                this.blinkTimer += deltaTime;

                // Movimento para baixo (rápido!)
                this.y += this.vy;

                // Oscilação leve horizontal para efeito "flutuante"
                this.x += Math.sin(this.timer * this.oscillationFreq) * this.oscillationAmp;

                // Expira após 20s OU quando sai da tela
                if (this.timer > this.maxTimer || this.y > 600) {
                    this.active = false;
                }
            }

            getIcon() {
                const icons = {
                    speed: '⚡',
                    multishot: '🔥',
                    bomb: '💣',
                    shield: '🛡️',
                    rapidfire: '⚡⚡'
                };
                return icons[this.type] || '⭐';
            }

            getColor() {
                const colors = {
                    speed: '#0088ff',       // Azul
                    multishot: '#ff8800',   // Laranja
                    bomb: '#ffff00',         // Amarelo
                    shield: '#00ff88',       // Verde
                    rapidfire: '#ffffaa'     // Amarelo claro
                };
                return colors[this.type] || '#ffffff';
            }
        }

        // --- Game Engine ---
        // P3-1: Verificar existência de elementos DOM
        const siCanvas = document.getElementById('siCanvas');
        const siOverlay = document.getElementById('siOverlay');
        const siTitle = document.getElementById('siTitle');
        const siStartBtn = document.getElementById('siStartBtn');
        const siRestartBtn = document.getElementById('siRestartBtn');
        const siGameSection = document.getElementById('siGameSection');
        const siGameContainer = document.getElementById('siGameContainer');

        // Verificar se todos os elementos essenciais existem
        if (!siCanvas || !siOverlay || !siStartBtn || !siRestartBtn || !siGameSection || !siGameContainer) {
            console.warn('[Space Invaders] Elementos DOM faltantes:', {
                siCanvas: !!siCanvas,
                siOverlay: !!siOverlay,
                siTitle: !!siTitle,
                siStartBtn: !!siStartBtn,
                siRestartBtn: !!siRestartBtn,
                siGameSection: !!siGameSection,
                siGameContainer: !!siGameContainer
            });
            return; // Não inicia se elementos essenciais faltarem
        }

        const siCtx = siCanvas.getContext('2d');

        let siGame = null;
        let siGameStarted = false;
        let siPaused = true;
        let siLastTime = 0;

        class SpaceInvaders {
            constructor(canvas) {
                this.canvas = canvas;
                this.ctx = canvas.getContext('2d');
                this.width = canvas.width;
                this.height = canvas.height;
                this.player = new Player(canvas, this);
                this.enemies = [];
                this.enemyBullets = [];
                this.particles = [];
                this.powerUps = [];
                this.activePowerUps = {
                    speed: 1,           // Multiplicador permanente
                    multishot: false,
                    shield: false,
                    rapidfire: false
                };
                this.powerUpTimers = {
                    multishot: 0,
                    shield: 0,
                    rapidfire: 0
                };
                this.score = 0;
                this.lives = 3;
                this.level = 1;
                this.gameOver = false;
                this.paused = true;
                this.enemiesToSpawn = 0;
                this.enemyRows = 4;
                this.enemyCols = 8;
                this.lastTime = 0;
                this.spawnTimer = 0;
                this.enemyMoveTimer = 0;
                this.enemyMoveInterval = 1000;
                this.enemyMoveDirection = 1;
                // Level up feedback
                this.levelUpTimer = 0;
                this.levelUpText = '';
                this.setupInput();
                this.initLevel();
            }

            setupInput() {
                document.addEventListener('keydown', (e) => {
                    if (this.gameOver || this.paused) return;
                    if (e.key === 'ArrowLeft' || e.key === 'a') {
                        e.preventDefault();
                        this.player.move('left');
                    } else if (e.key === 'ArrowRight' || e.key === 'd') {
                        e.preventDefault();
                        this.player.move('right');
                    } else if (e.key === ' ') {
                        e.preventDefault();
                        this.player.shoot();
                    } else if (e.key.toLowerCase() === 'r') {
                        this.restart();
                    }
                });
            }

            initLevel() {
                this.enemies = [];
                this.enemyBullets = [];
                this.particles = [];
                this.player.bullets = [];
                const spacing = 50;
                const startX = (this.width - (this.enemyCols - 1) * spacing) / 2;
                const startY = 50;
                for (let row = 0; row < this.enemyRows; row++) {
                    for (let col = 0; col < this.enemyCols; col++) {
                        const type = row === 0 ? 0 : (row === 1 ? 0 : (row === 2 ? 1 : 2));
                        this.enemies.push(new Enemy(this.canvas, startX + col * spacing, startY + row * 40, type));
                    }
                }
                this.enemiesToSpawn = this.enemies.length;
                // Enhanced difficulty scaling from plano-powerups.md
                this.enemyMoveInterval = Math.max(800, 1500 - (this.level - 1) * 200);
                this.enemyRows = Math.min(this.enemyRows + 1, 8);
                this.enemyMoveTimer = 0;
                this.enemyMoveDirection = 1;
            }

            update(deltaTime) {
                if (this.paused || this.gameOver) return;
                this.spawnTimer += deltaTime;
                if (this.spawnTimer > 1000 && this.enemiesToSpawn > 0) {
                    this.spawnTimer = 0;
                }
                this.enemyMoveTimer += deltaTime;
                if (this.enemyMoveTimer >= this.enemyMoveInterval) {
                    this.moveEnemies();
                    this.enemyMoveTimer = 0;
                }
                this.player.update();
                this.enemies.forEach(enemy => enemy.update());
                this.enemyBullets.forEach(bullet => bullet.update());
                this.particles.forEach(particle => particle.update());
                this.particles = this.particles.filter(p => p.life > 0);
                // Atualizar power-ups na tela
                this.powerUps.forEach(p => p.update(deltaTime));
                this.powerUps = this.powerUps.filter(p => p.active);
                this.enemyBullets = this.enemyBullets.filter(b => b.active);
                this.player.bullets.forEach(bullet => bullet.update());
                this.player.bullets = this.player.bullets.filter(b => b.active);

                // Atualizar timers dos power-ups temporários
                if (this.powerUpTimers.multishot > 0) {
                    this.powerUpTimers.multishot += deltaTime;
                    if (this.powerUpTimers.multishot >= 10000) { // 10 segundos
                        this.activePowerUps.multishot = false;
                        this.powerUpTimers.multishot = 0;
                    }
                }
                if (this.powerUpTimers.shield > 0) {
                    this.powerUpTimers.shield += deltaTime;
                    if (this.powerUpTimers.shield >= 5000) { // 5 segundos
                        this.activePowerUps.shield = false;
                        this.player.invulnerable = false;
                        this.powerUpTimers.shield = 0;
                    }
                }
                if (this.powerUpTimers.rapidfire > 0) {
                    this.powerUpTimers.rapidfire += deltaTime;
                    if (this.powerUpTimers.rapidfire >= 6000) { // 6 segundos
                        this.activePowerUps.rapidfire = false;
                        this.powerUpTimers.rapidfire = 0;
                    }
                }

                this.checkCollisions();
            }

            moveEnemies() {
                let hitEdge = false;
                for (const enemy of this.enemies) {
                    if (enemy.x <= 0 || enemy.x + enemy.width >= this.width) {
                        hitEdge = true;
                        break;
                    }
                }
                if (hitEdge) {
                    this.enemyMoveDirection *= -1;
                    this.enemies.forEach(enemy => {
                        enemy.y += 25;
                        enemy.x += this.enemyMoveDirection * 10;
                    });
                } else {
                    this.enemies.forEach(enemy => {
                        enemy.x += this.enemyMoveDirection * enemy.speed * 4;
                    });
                }
                for (const enemy of this.enemies) {
                    if (enemy.y + enemy.height >= this.player.y) {
                        this.gameOver = true;
                    }
                }
                if (this.enemiesToSpawn === 0 && this.enemies.length === 0) {
                    this.level++;
                    this.enemyRows++;
                    this.initLevel();
                }
            }

            checkCollisions() {
                for (const bullet of this.player.bullets) {
                    for (const enemy of this.enemies) {
                        if (this.rectIntersect(bullet, enemy)) {
                            bullet.active = false;
                            enemy.alive = false;
                            this.createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#ff3366');
                            this.score += 100;
                            // Quando inimigo morre, 15% chance de dropar power-up
                            if (Math.random() < 0.15 && this.powerUps.length < 3) {
                                const types = ['speed', 'multishot', 'bomb', 'shield', 'rapidfire'];
                                const type = types[Math.floor(Math.random() * types.length)];
                                this.powerUps.push(new PowerUp(type, enemy.x, enemy.y));
                            }
                            this.checkWinCondition();
                            break;
                        }
                    }
                }
                for (const bullet of this.enemyBullets) {
                    if (this.rectIntersect(bullet, this.player)) {
                        bullet.active = false;
                        if (!this.player.invulnerable) {
                            this.player.alive = false;
                            this.createExplosion(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, '#00ff88');
                            this.lives--;
                            if (this.lives <= 0) {
                                this.gameOver = true;
                            }
                        }
                    }
                }
                for (const enemyBullet of this.enemyBullets) {
                    for (const playerBullet of this.player.bullets) {
                        if (this.rectIntersect(enemyBullet, playerBullet)) {
                            enemyBullet.active = false;
                            playerBullet.active = false;
                        }
                    }
                }
                for (const enemyBullet of this.enemyBullets) {
                    if (this.rectIntersect(enemyBullet, this.player)) {
                        enemyBullet.active = false;
                        if (!this.player.invulnerable) {
                            this.player.alive = false;
                            this.createExplosion(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, '#00ff88');
                            this.lives--;
                            if (this.lives <= 0) this.gameOver = true;
                        }
                    }
                }
                // Verificar colisão player com power-up
                for (const powerUp of this.powerUps) {
                    if (this.rectIntersect(powerUp, this.player)) {
                        this.applyPowerUp(powerUp);
                        powerUp.active = false;
                    }
                }
            }

            applyPowerUp(powerUp) {
                // Criar efeito de partículas ao coletar power-up
                const powerUpColors = {
                    speed: '#0088ff',
                    multishot: '#ff8800',
                    bomb: '#ffff00',
                    shield: '#00ff88',
                    rapidfire: '#ffffaa'
                };
                const color = powerUpColors[powerUp.type] || '#ffffff';
                for (let i = 0; i < 15; i++) {
                    this.particles.push(new Particle(
                        powerUp.x + powerUp.width / 2,
                        powerUp.y + powerUp.height / 2,
                        color
                    ));
                }

                switch(powerUp.type) {
                    case 'speed':
                        // Speed Boost - permanente e acumulativo
                        this.player.speedMultiplier *= 2;
                        this.player.speed = this.player.baseSpeed * this.player.speedMultiplier;
                        this.activePowerUps.speed *= 2;
                        break;
                    case 'multishot':
                        // Multi-Shot - 10 segundos
                        this.activePowerUps.multishot = true;
                        this.powerUpTimers.multishot = 0;
                        break;
                    case 'bomb':
                        // Bomb - efeito instantâneo, mata 30% dos inimigos
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
                        // Efeito visual de tela inteira (flash branco)
                        this.screenFlash = 10; // Frames de flash branco
                        break;
                    case 'shield':
                        // Shield - 5 segundos de invencibilidade
                        this.player.invulnerable = true;
                        this.activePowerUps.shield = true;
                        this.powerUpTimers.shield = 0;
                        break;
                    case 'rapidfire':
                        // Rapid Fire - 6 segundos de cooldown reduzido
                        this.activePowerUps.rapidfire = true;
                        this.powerUpTimers.rapidfire = 0;
                        break;
                }
            }

            rectIntersect(r1, r2) {
                return r1.x < r2.x + r2.width && r1.x + r1.width > r2.x && r1.y < r2.y + r2.height && r1.y + r1.height > r2.y;
            }

            createExplosion(x, y, color) {
                for (let i = 0; i < 12; i++) {
                    this.particles.push(new Particle(x, y, color));
                }
            }

            checkWinCondition() {
                // Verificar se todos os inimigos foram destruídos
                const allEnemiesDead = this.enemies.every(e => !e.alive);
                if (allEnemiesDead) {
                    // Avançar para o próximo nível
                    this.level++;

                    // Visual feedback de level up
                    this.levelUpTimer = 120; // 2 segundos a 60fps
                    this.levelUpText = 'LEVEL ' + this.level + '!';

                    // Bônus por Level: dar 1 power-up aleatório gratuito
                    const types = ['speed', 'multishot', 'bomb', 'shield', 'rapidfire'];
                    const type = types[Math.floor(Math.random() * types.length)];
                    // Aplicar diretamente sem drop
                    this.applyPowerUp(new PowerUp(type, this.width/2, this.height/2));

                    this.initLevel();
                } else {
                    // Remover inimigos mortos
                    this.enemies = this.enemies.filter(e => e.alive);
                }
            }

            draw() {
                // Screen flash for bomb effect
                if (this.screenFlash > 0) {
                    this.ctx.fillStyle = `rgba(255, 255, 255, ${this.screenFlash * 0.1})`;
                    this.ctx.fillRect(0, 0, this.width, this.height);
                    this.screenFlash--;
                }

                // Level up feedback text
                if (this.levelUpTimer > 0) {
                    this.levelUpTimer--;
                    // Desenhar texto de level up no centro da tela
                    this.ctx.fillStyle = '#ffff00';
                    this.ctx.font = 'bold 24px monospace';
                    this.ctx.textAlign = 'center';
                    this.ctx.fillText(this.levelUpText, this.width / 2, this.height / 2);
                }

                this.ctx.fillStyle = '#1a1a2e';
                this.ctx.fillRect(0, 0, this.width, this.height);
                this.player.draw(this.ctx);
                this.enemies.forEach(enemy => enemy.draw(this.ctx));
                this.player.bullets.forEach(bullet => bullet.draw(this.ctx));
                this.enemyBullets.forEach(bullet => bullet.draw(this.ctx));
                this.particles.forEach(particle => particle.draw(this.ctx));
                // Desenhar power-ups
                this.powerUps.forEach(p => p.draw(this.ctx));
            }
        }

        function siGameLoop(timestamp) {
            if (!siGameStarted || siPaused) return;
            const deltaTime = timestamp - siLastTime;
            siLastTime = timestamp;
            siGame.update(deltaTime);
            siGame.draw();
            // P3-3: Atualizar HUD a cada frame
            if (typeof window.updateHUD === 'function') {
                window.updateHUD(siGame.score, siGame.lives, siGame.level, siGame.activePowerUps.speed, siGame.activePowerUps);
            }
            requestAnimationFrame(siGameLoop);
        }

        function startSpaceInvaders() {
            if (!siGame) {
                siGame = new SpaceInvaders(siCanvas);
            }
            siPaused = false;
            siGame.paused = false;
            siGameStarted = true;
            siLastTime = 0; // Reset last time to prevent huge deltaTime on first frame
            siOverlay.style.display = 'none';
            siGameContainer.style.display = 'flex';
            siGameContainer.style.flexDirection = 'column';
            siGameContainer.style.alignItems = 'center';
            requestAnimationFrame(siGameLoop);
        }

        function restartSpaceInvaders() {
            siGame.gameOver = false;
            siGame.score = 0;
            siGame.lives = 3;
            siGame.level = 1;
            siGame.powerUps = [];
            siGame.activePowerUps = {
                speed: 1,
                multishot: false,
                shield: false,
                rapidfire: false
            };
            // Resetar velocidade do player
            siGame.player.speedMultiplier = 1;
            siGame.player.baseSpeed = 5;
            siGame.player.speed = 5;
            siGame.initLevel();
            siPaused = false;
            siGame.paused = false;
            siLastTime = 0; // Reset last time to prevent huge deltaTime on first frame
            siOverlay.style.display = 'none';
            siGameContainer.style.display = 'flex';
            siGameContainer.style.flexDirection = 'column';
            siGameContainer.style.alignItems = 'center';
            requestAnimationFrame(siGameLoop);
        }

        // P3-1: Event listeners dentro da IIFE (elementos já verificados acima)
        siStartBtn.addEventListener('click', startSpaceInvaders);
        siRestartBtn.addEventListener('click', restartSpaceInvaders);
    } catch(e) {
        console.error('[Space Invaders] Erro crítico:', e);
    }
})();

// ============================================
// CARD UI MANAGEMENT
// (P3-1: Verificação de existência de elementos DOM)
// (P3-2: IIFE para isolar erros)
// ============================================
(function() {
    try {
        const targetGameSection = document.getElementById('targetGameSection');
        const spaceInvadersSection = document.getElementById('siGameSection');
        const targetGameIcon = document.getElementById('targetGameIcon');
        const spaceInvadersIcon = document.getElementById('spaceInvadersIcon');
        const minimizeBtn = document.getElementById('minimizeBtn');
        const card = document.querySelector('.card');

        // P3-1: Verificar se todos os elementos essenciais existem
        if (!minimizeBtn || !card) {
            console.warn('[Card UI] Elementos DOM faltantes:', {
                minimizeBtn: !!minimizeBtn,
                card: !!card
            });
            return;
        }

        let targetGameSectionMinimized = false;
        let spaceInvadersSectionMinimized = false;
        let cardHasVisible = true; // Card inicia expandido

        function updateTargetGameUI() {
            if (!targetGameSection) return;
            if (targetGameSectionMinimized) {
                targetGameSection.classList.add('minimized');
            } else {
                targetGameSection.classList.remove('minimized');
            }
        }

        function updateSpaceInvadersUI() {
            if (!spaceInvadersSection) return;
            if (spaceInvadersSectionMinimized) {
                spaceInvadersSection.classList.add('minimized');
                if (typeof siScoreDisplay !== 'undefined' && siScoreDisplay) {
                    siScoreDisplay.style.display = 'none';
                }
            } else {
                spaceInvadersSection.classList.remove('minimized');
                if (typeof siScoreDisplay !== 'undefined' && siScoreDisplay) {
                    siScoreDisplay.style.display = 'flex';
                }
            }
        }

        // Minimizar card inteiro
        minimizeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            cardHasVisible = !cardHasVisible;
            updateCardUI();
        });

        // Minimizar seção de jogo - Target Game
        if (targetGameIcon) {
            targetGameIcon.addEventListener('click', function(e) {
                e.stopPropagation();
                targetGameSectionMinimized = !targetGameSectionMinimized;
                updateTargetGameUI();
            });
        }

        // Minimizar seção de jogo - Space Invaders
        if (spaceInvadersIcon) {
            spaceInvadersIcon.addEventListener('click', function(e) {
                e.stopPropagation();
                spaceInvadersSectionMinimized = !spaceInvadersSectionMinimized;
                updateSpaceInvadersUI();
            });
        }

        // Gerenciar estados do card
        function updateCardUI() {
            if (cardHasVisible) {
                card.classList.add('visible');
                card.classList.remove('minimized');
            } else {
                // Só minimiza se não tiver overlay aberto
                const siOverlay = document.getElementById('siOverlay');
                if (!siOverlay || siOverlay.style.display === 'none') {
                    card.classList.remove('visible');
                    card.classList.add('minimized');
                }
            }
        }
    } catch(e) {
        console.error('[Card UI] Erro crítico:', e);
    }
})();

// ============================================
// HUD SPACE INVADERS
// (P3-1: Verificação de existência de elementos DOM)
// (P3-2: IIFE para isolar erros)
// (P3-3: updateHUD() chamado a cada frame)
// ============================================
(function() {
    try {
        const siGameSection = document.getElementById('siGameSection');
        if (!siGameSection) {
            console.warn('[HUD] siGameSection não encontrado');
            return;
        }

        let siScoreDisplay = null;
        let siScoreEl = null;
        let siLivesEl = null;
        let siLevelEl = null;
        let siSpeedEl = null;
        let siPowerUpsEl = null;

        function createSiHUD() {
            if (!siScoreDisplay) {
                siScoreDisplay = document.createElement('div');
                siScoreDisplay.id = 'siScoreDisplay';
                siScoreDisplay.className = '';
                siScoreDisplay.style.display = 'flex';
                siScoreDisplay.style.justifyContent = 'center';
                siScoreDisplay.style.gap = '20px';
                siScoreDisplay.style.marginBottom = '15px';
                siScoreDisplay.style.pointerEvents = 'none';
                siScoreDisplay.style.fontFamily = 'Press Start 2P, monospace';
                siScoreDisplay.style.fontSize = '12px';
                siScoreDisplay.innerHTML = `
                    <div class="hud-score">SCORE: <span id="siScore">00000</span></div>
                    <div class="hud-lives">LIVES: <span id="siLives">❤❤❤</span></div>
                    <div class="hud-level">LEVEL: <span id="siLevel">1</span></div>
                    <div class="hud-speed">SPEED: <span id="siSpeed">1x</span></div>
                    <div class="hud-powerups" id="siPowerUps"></div>
                `;
                siGameSection.insertBefore(siScoreDisplay, siGameSection.firstChild);

                // P3-3: Obter referências APÓS criar os elementos no DOM
                siScoreEl = document.getElementById('siScore');
                siLivesEl = document.getElementById('siLives');
                siLevelEl = document.getElementById('siLevel');
                siSpeedEl = document.getElementById('siSpeed');
                siPowerUpsEl = document.getElementById('siPowerUps');

                if (!siScoreEl || !siLivesEl || !siLevelEl || !siSpeedEl || !siPowerUpsEl) {
                    console.warn('[HUD] Elementos do HUD não foram criados corretamente');
                }
            }
        }

        // P3-3: updateHUD() — atualiza o HUD a cada frame
        function updateHUD(score, lives, level, speed, powerUps) {
            if (!siScoreEl || !siLivesEl || !siLevelEl || !siSpeedEl || !siPowerUpsEl) return;
            siScoreEl.textContent = String(score).padStart(5, '0');
            siLivesEl.textContent = '❤'.repeat(Math.max(0, lives));
            siLevelEl.textContent = level;
            siSpeedEl.textContent = speed + 'x';

            // Atualizar indicadores de power-ups ativos
            let powerUpsHTML = '';
            if (powerUps) {
                if (powerUps.speed > 1) {
                    powerUpsHTML += `<span class="powerup-item">⚡${powerUps.speed}x</span>`;
                }
                if (powerUps.multishot) {
                    // Note: We don't have easy access to timers here, so show as active
                    powerUpsHTML += `<span class="powerup-item">🔥ATIVO</span>`;
                }
                if (powerUps.shield) {
                    powerUpsHTML += `<span class="powerup-item">🛡️ATIVO</span>`;
                }
                if (powerUps.rapidfire) {
                    powerUpsHTML += `<span class="powerup-item">⚡⚡ATIVO</span>`;
                }
            }
            siPowerUpsEl.innerHTML = powerUpsHTML;
        }

        // Expor createSiHUD e updateHUD globalmente para o jogo usar
        window.createSiHUD = createSiHUD;
        window.updateHUD = updateHUD;

        // Criar o HUD inicialmente
        createSiHUD();
        // Atualizar com valores iniciais
        updateHUD(0, 3, 1, 1, { speed: 1, multishot: false, shield: false, rapidfire: false });
    } catch(e) {
        console.error('[HUD] Erro crítico:', e);
    }
})();
