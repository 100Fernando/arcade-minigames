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
// ============================================
const targetGameCanvasContainer = document.getElementById('targetCanvas');
const targetGameBoard = document.getElementById('gameBoard');
const targetScoreEl = document.getElementById('score');
const targetHighscoreEl = document.getElementById('highscore');
const targetRestartBtn = document.getElementById('restartBtn');
let targetScore = 0;
let targetHighscore = localStorage.getItem('targetGameHighscore') || 0;
let targetGameActive = true;
let targetSpawnInterval;
let targetTimeout;
targetHighscoreEl.textContent = targetHighscore;

function createTarget() {
    if (!targetGameActive) return;
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
    if (!targetGameActive) return;
    createTarget();
}

function startTargetGame() {
    targetScore = 0;
    targetScoreEl.textContent = targetScore;
    targetGameActive = true;
    if (targetSpawnInterval) clearInterval(targetSpawnInterval);
    targets = [];
    spawnNextTarget();
    targetSpawnInterval = setInterval(spawnNextTarget, 1000);
}

function spawnNextTarget() {
    if (!targetGameActive) return;
    targets.length = 0;
    createTarget();
    targetTimeout = setTimeout(function() {
        if (targets.length > 0) {
            for (const target of targets) {
                target.classList.add('target-missed');
            }
            setTimeout(function() {
                targets = [];
            }, 500);
        }
    }, 2000);
}

function createTarget() {
    if (!targetGameActive) return;
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
            targets = [];
        }, 150);
        spawnNextTarget();
    });
    targetGameCanvasContainer.appendChild(target);
    targets.push(target);
}

targetRestartBtn.addEventListener('click', startTargetGame);
startTargetGame();

// ============================================
// GAME 2: SPACE INVADERS
// ============================================

// --- Classes ---

class Player {
    constructor(canvas) {
        this.canvas = canvas;
        this.width = 40;
        this.height = 20;
        this.x = canvas.width / 2 - this.width / 2;
        this.y = canvas.height - 40;
        this.speed = 5;
        this.bullets = [];
        this.canShoot = true;
        this.shootCooldown = 0;
        this.maxCooldown = 10;
        this.alive = true;
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
            this.bullets.push(new Bullet(this.x, this.y, 'player'));
            this.shootCooldown = this.maxCooldown;
            this.canShoot = false;
        }
    }

    update() {
        if (this.shootCooldown > 0) this.shootCooldown--;
    }

    draw(ctx) {
        ctx.fillStyle = '#00ff88';
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
    constructor(x, y, owner, width = 4, height = 10) {
        this.x = x;
        this.y = y;
        this.owner = owner;
        this.width = width;
        this.height = height;
        this.speed = owner === 'player' ? 8 : -6;
        this.active = true;
    }

    update() {
        this.y += this.speed;
        if (this.y < 0 || this.y > 600) {
            this.active = false;
        }
    }

    draw(ctx) {
        if (this.owner === 'player') {
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

// --- Game Engine ---

const siCanvas = document.getElementById('siCanvas');
const siCtx = siCanvas.getContext('2d');
const siOverlay = document.getElementById('siOverlay');
const siTitle = document.getElementById('siTitle');
const siScoreDisplay = document.getElementById('siScoreDisplay');
const siStartBtn = document.getElementById('siStartBtn');
const siRestartBtn = document.getElementById('siRestartBtn');

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
        this.player = new Player(canvas);
        this.enemies = [];
        this.enemyBullets = [];
        this.particles = [];
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
        this.setupInput();
    }

    setupInput() {
        document.addEventListener('keydown', (e) => {
            if (this.gameOver || this.paused) return;
            if (e.key === 'ArrowLeft' || e.key === 'a') {
                this.player.move('left');
            } else if (e.key === 'ArrowRight' || e.key === 'd') {
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
        this.enemyMoveInterval = 1500 - (this.level - 1) * 100;
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
        this.enemyBullets = this.enemyBullets.filter(b => b.active);
        this.player.bullets = this.player.bullets.filter(b => b.active);
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
                    this.checkWinCondition();
                    break;
                }
            }
        }
        for (const bullet of this.enemyBullets) {
            if (this.rectIntersect(bullet, this.player)) {
                bullet.active = false;
                this.player.alive = false;
                this.createExplosion(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, '#00ff88');
                this.lives--;
                if (this.lives <= 0) {
                    this.gameOver = true;
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
                this.player.alive = false;
                this.lives--;
                this.createExplosion(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, '#00ff88');
                if (this.lives <= 0) this.gameOver = true;
            }
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

    draw() {
        this.ctx.fillStyle = '#1a1a2e';
        this.ctx.fillRect(0, 0, this.width, this.height);
        this.player.draw(this.ctx);
        this.enemies.forEach(enemy => enemy.draw(this.ctx));
        this.player.bullets.forEach(bullet => bullet.draw(this.ctx));
        this.enemyBullets.forEach(bullet => bullet.draw(this.ctx));
        this.particles.forEach(particle => particle.draw(this.ctx));
    }
}

function siGameLoop(timestamp) {
    if (!siGameStarted || siPaused) return;
    const deltaTime = timestamp - siLastTime;
    siLastTime = timestamp;
    siGame.update(deltaTime);
    siGame.draw();
    requestAnimationFrame(siGameLoop);
}

function startSpaceInvaders() {
    if (!siGame) {
        siGame = new SpaceInvaders(siCanvas);
    }
    siPaused = false;
    siGameStarted = true;
    siOverlay.style.display = 'none';
    requestAnimationFrame(siGameLoop);
}

function restartSpaceInvaders() {
    siGame.gameOver = false;
    siGame.score = 0;
    siGame.lives = 3;
    siGame.level = 1;
    siGame.initLevel();
    siPaused = false;
    siOverlay.style.display = 'none';
    requestAnimationFrame(siGameLoop);
}

// ============================================
// CARD UI MANAGEMENT
// ============================================

const targetGameSection = document.getElementById('targetGameSection');
const spaceInvadersSection = document.getElementById('spaceInvadersSection');
const targetGameIcon = document.getElementById('targetGameIcon');
const spaceInvadersIcon = document.getElementById('spaceInvadersIcon');

let targetGameSectionMinimized = false;
let spaceInvadersSectionMinimized = false;

function updateTargetGameUI() {
    if (targetGameSectionMinimized) {
        targetGameSection.classList.add('minimized');
    } else {
        targetGameSection.classList.remove('minimized');
    }
}

function updateSpaceInvadersUI() {
    if (spaceInvadersSectionMinimized) {
        spaceInvadersSection.classList.add('minimized');
    } else {
        spaceInvadersSection.classList.remove('minimized');
    }
}

// Minimizar card inteiro
let cardHasVisible = true; // Card inicia expandido

minimizeBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    cardHasVisible = !cardHasVisible;
    updateCardUI();
});

// Minimizar seção de jogo - Target Game
targetGameIcon.addEventListener('click', function(e) {
    e.stopPropagation();
    targetGameSectionMinimized = !targetGameSectionMinimized;
    updateTargetGameUI();
});

// Minimizar seção de jogo - Space Invaders
spaceInvadersIcon.addEventListener('click', function(e) {
    e.stopPropagation();
    spaceInvadersSectionMinimized = !spaceInvadersSectionMinimized;
    updateSpaceInvadersUI();
});

// Gerenciar estados do card
const card = document.querySelector('.card');

function updateCardUI() {
    if (cardHasVisible) {
        card.classList.add('visible');
        card.classList.remove('minimized');
    } else {
        card.classList.remove('visible');
        card.classList.add('minimized');
    }
}

// Inicializar UI
updateCardUI();
