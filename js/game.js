/**
 * 游戏主逻辑控制 (支持单机与网络对战)
 */
class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = CONFIG.WIDTH;
        this.canvas.height = CONFIG.HEIGHT;

        this.map = new MapSystem();
        this.player = null;
        this.enemies = []; // 单机模式下的AI
        this.remotePlayers = {}; // 网络对战模式下的其他玩家
        this.bullets = [];
        this.powerups = [];
        this.explosions = [];

        this.score = 0;
        this.highScore = parseInt(localStorage.getItem('tankGame_highScore')) || 0;
        this.hp = CONFIG.INITIAL_HP;
        this.state = 'START';
        this.isMultiplayer = false;
        this.socket = null;

        this.keys = {};
        this.initEvents();
        this.updateHUD();
    }

    initEvents() {
        window.addEventListener('keydown', e => this.keys[e.code] = true);
        window.addEventListener('keyup', e => this.keys[e.code] = false);

        document.getElementById('start-btn').onclick = () => this.start(false);
        document.getElementById('multi-btn').onclick = () => this.start(true);
        document.getElementById('resume-btn').onclick = () => this.togglePause();
        document.getElementById('restart-btn').onclick = () => this.start(this.isMultiplayer);

        window.addEventListener('keydown', e => {
            if (e.code === 'Escape') this.togglePause();
            if (e.code === 'Space' && this.state === 'PLAYING') {
                this.handleShoot();
            }
        });
    }

    handleShoot() {
        if (!this.player || !this.player.active) return;
        const b = this.player.shoot();
        if (b) {
            this.bullets.push(b);
            if (this.isMultiplayer && this.socket) {
                this.socket.emit('shoot', {
                    x: b.x,
                    y: b.y,
                    direction: b.direction
                });
            }
        }
    }

    start(multiplayer = false) {
        AudioManager.init();
        this.isMultiplayer = multiplayer;
        this.state = 'PLAYING';
        this.score = 0;
        this.hp = CONFIG.INITIAL_HP;
        
        // 使用固定的安全出生点
        const playerPoints = CONFIG.SPAWN_POINTS.PLAYER;
        const spawnPoint = playerPoints[Math.floor(Math.random() * playerPoints.length)];
        const startX = spawnPoint.x * CONFIG.TILE_SIZE;
        const startY = spawnPoint.y * CONFIG.TILE_SIZE;
        
        this.player = new PlayerTank(startX, startY);
        this.enemies = [];
        this.remotePlayers = {};
        this.bullets = [];
        this.powerups = [];
        this.explosions = [];
        this.map.initDefaultMap();
        
        if (multiplayer) {
            this.initSocket();
        }

        this.hideOverlays();
        this.updateHUD();
        
        if (!this.looping) {
            this.looping = true;
            this.gameLoop();
        }
    }

    initSocket() {
        if (typeof io === 'undefined') {
            alert('无法加载 Socket.io。请确保你是通过 http://localhost:3000 访问游戏，并且已经运行了服务器 (node server.js)。');
            this.state = 'START';
            document.getElementById('start-screen').classList.remove('hidden');
            return;
        }
        if (this.socket) this.socket.disconnect();
        this.socket = io();

        this.socket.on('connect', () => {
            console.log('已连接到服务器');
            this.socket.emit('join', {
                x: this.player.x,
                y: this.player.y,
                direction: this.player.direction,
                hp: this.hp,
                score: this.score,
                color: CONFIG.COLORS.PLAYER
            });
        });

        this.socket.on('currentPlayers', (players) => {
            for (let id in players) {
                if (id !== this.socket.id) {
                    const p = players[id];
                    this.remotePlayers[id] = new RemoteTank(p.x, p.y, p.direction, p.color, id);
                }
            }
        });

        this.socket.on('currentEnemies', (enemiesData) => {
            console.log('[DEBUG] 收到初始化 AI 列表:', enemiesData);
            for (let id in enemiesData) {
                const enemy = enemiesData[id];
                if (!this.enemies.find(e => e.id === id)) {
                    const e = new EnemyTank(enemy.x, enemy.y);
                    e.id = id;
                    this.enemies.push(e);
                }
            }
        });

        this.socket.on('enemySpawned', (enemy) => {
            console.log('[DEBUG] 收到新 AI 生成事件:', enemy);
            const e = new EnemyTank(enemy.x, enemy.y);
            e.id = enemy.id;
            this.enemies.push(e);
        });

        this.socket.on('enemiesMoved', (enemiesData) => {
            // 只有当本地没有收到过移动日志时才打印一次，避免刷屏
            if (!this._hasLoggedMove) {
                console.log('[DEBUG] 收到 AI 移动同步数据');
                this._hasLoggedMove = true;
            }
            this.enemies.forEach(e => {
                if (enemiesData[e.id]) {
                    e.x = enemiesData[e.id].x;
                    e.y = enemiesData[e.id].y;
                    e.direction = enemiesData[e.id].direction;
                }
            });
        });

        this.socket.on('enemyDestroyed', (id) => {
            const index = this.enemies.findIndex(e => e.id === id);
            if (index !== -1) {
                const enemy = this.enemies[index];
                this.createExplosion(enemy.x + 16, enemy.y + 16);
                this.enemies.splice(index, 1);
            }
        });

        this.socket.on('playerJoined', (p) => {
            this.remotePlayers[p.id] = new RemoteTank(p.x, p.y, p.direction, p.color, p.id);
        });

        this.socket.on('playerMoved', (p) => {
            if (this.remotePlayers[p.id]) {
                this.remotePlayers[p.id].updateState(p);
            }
        });

        this.socket.on('enemyShoot', (data) => {
            const b = new Bullet(data.x, data.y, data.direction, 'enemy');
            this.bullets.push(b);
        });

        this.socket.on('playerLeft', (id) => {
            delete this.remotePlayers[id];
        });

        this.socket.on('playerUpdate', (p) => {
            if (this.remotePlayers[p.id]) {
                this.remotePlayers[p.id].hp = p.hp;
                this.remotePlayers[p.id].score = p.score;
            }
        });

        this.socket.on('tileDestroyed', (data) => {
            this.map.grid[data.row][data.col] = CONFIG.TILE_TYPES.EMPTY;
        });

        this.socket.on('scoreUpdate', (score) => {
            this.score = score;
            this.updateHUD();
        });
    }

    togglePause() {
        if (this.isMultiplayer) return; // 网络对战不支持暂停
        if (this.state === 'PLAYING') {
            this.state = 'PAUSED';
            document.getElementById('pause-screen').classList.remove('hidden');
        } else if (this.state === 'PAUSED') {
            this.state = 'PLAYING';
            document.getElementById('pause-screen').classList.add('hidden');
        }
    }

    gameOver() {
        this.state = 'GAMEOVER';
        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('tankGame_highScore', this.highScore);
        }
        document.getElementById('game-over-screen').classList.remove('hidden');
        document.getElementById('final-score').innerText = this.score;
        document.getElementById('high-score-over').innerText = this.highScore;
        AudioManager.playExplosion();
        if (this.socket) this.socket.disconnect();
    }

    hideOverlays() {
        document.querySelectorAll('.overlay').forEach(el => el.classList.add('hidden'));
    }

    updateHUD() {
        document.getElementById('hp-value').innerText = this.hp;
        document.getElementById('score-value').innerText = this.score;
        document.getElementById('high-score-value').innerText = this.highScore;
    }

    gameLoop() {
        if (this.state === 'PLAYING') {
            this.update();
        }
        this.draw();
        requestAnimationFrame(() => this.gameLoop());
    }

    update() {
        const dt = 16;

        // 1. 生成敌人 (仅单机模式，3秒补充逻辑)
        if (!this.isMultiplayer && this.enemies.length < CONFIG.MAX_ENEMIES) {
            if (!this.lastEnemySpawnTime) this.lastEnemySpawnTime = 0;
            const now = Date.now();
            if (now - this.lastEnemySpawnTime > 3000) {
                const enemyPoints = CONFIG.SPAWN_POINTS.ENEMY;
                const spawnPoint = enemyPoints[Math.floor(Math.random() * enemyPoints.length)];
                this.enemies.push(new EnemyTank(spawnPoint.x * CONFIG.TILE_SIZE, spawnPoint.y * CONFIG.TILE_SIZE));
                this.lastEnemySpawnTime = now;
            }
        }

        // 2. 玩家控制
        let moved = false;
        const otherTanks = [...Object.values(this.remotePlayers), ...this.enemies];
        if (this.keys['ArrowUp']) moved = this.player.move(CONFIG.DIRECTIONS.UP, this.map, otherTanks);
        else if (this.keys['ArrowDown']) moved = this.player.move(CONFIG.DIRECTIONS.DOWN, this.map, otherTanks);
        else if (this.keys['ArrowLeft']) moved = this.player.move(CONFIG.DIRECTIONS.LEFT, this.map, otherTanks);
        else if (this.keys['ArrowRight']) moved = this.player.move(CONFIG.DIRECTIONS.RIGHT, this.map, otherTanks);

        if (moved && this.isMultiplayer && this.socket) {
            this.socket.emit('playerMove', {
                x: this.player.x,
                y: this.player.y,
                direction: this.player.direction
            });
        }

        // 3. 更新 AI (仅单机模式处理移动，网络模式由服务端同步)
        if (!this.isMultiplayer) {
            this.enemies.forEach(enemy => {
                const b = enemy.update(dt, this.map, [this.player, ...this.enemies]);
                if (b) this.bullets.push(b);
            });
        }

        // 4. 更新子弹逻辑
        this._updateBullets();

        // 5. 更新道具拾取 (单机模式)
        if (!this.isMultiplayer) {
            this._updatePowerups(dt);
        }

        // 6. 清理特效
        this.explosions.forEach((exp, index) => {
            exp.frame++;
            if (exp.frame > (exp.isSmall ? 10 : 20)) this.explosions.splice(index, 1);
        });
    }

    _updateBullets() {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            bullet.update();

            if (!bullet.active) {
                this.bullets.splice(i, 1);
                continue;
            }

            // 子弹抵消
            for (let j = i - 1; j >= 0; j--) {
                const other = this.bullets[j];
                if (other.active && bullet.owner !== other.owner) {
                    if (this._checkCollision(bullet.getRect(), other.getRect())) {
                        bullet.active = false;
                        other.active = false;
                        this.createExplosion(bullet.x, bullet.y, true);
                        AudioManager.playHit();
                        break;
                    }
                }
            }
            if (!bullet.active) {
                this.bullets.splice(i, 1);
                continue;
            }

            // 与地图碰撞
            const hitInfo = this._bulletMapCollision(bullet);
            if (hitInfo) {
                bullet.active = false;
                this.bullets.splice(i, 1);
                if (hitInfo.type === 'game_over') this.gameOver();
                continue;
            }

            // 与坦克碰撞
            const targets = [this.player, ...Object.values(this.remotePlayers), ...this.enemies];
            for (let tank of targets) {
                // 排除无效目标，以及：
                // 1. 玩家子弹不伤自己
                // 2. 敌人子弹不伤敌人 (防止自相残杀)
                if (!tank.active) continue;
                if (tank === this.player && bullet.owner === 'player') continue;
                if (tank instanceof EnemyTank && bullet.owner === 'enemy') continue;
                
                if (this._checkCollision(bullet.getRect(), tank.getRect())) {
                    bullet.active = false;
                    this.createExplosion(tank.x + 16, tank.y + 16);
                    AudioManager.playExplosion();

                    if (tank === this.player) {
                        this.hp--;
                        this.updateHUD();
                        if (this.isMultiplayer && this.socket) {
                            this.socket.emit('playerHit', { hp: this.hp });
                        }
                        if (this.hp <= 0) this.gameOver();
                    } else if (tank instanceof EnemyTank) {
                        if (this.isMultiplayer) {
                            this.socket.emit('enemyHit', { id: tank.id });
                            // 联机模式下不再由本地计算分数，而是等待服务器广播 scoreUpdate
                        } else {
                            tank.active = false;
                            this.score += 100;
                            this.updateHUD();
                            if (Math.random() < CONFIG.POWERUP_CHANCE) {
                                const types = Object.values(CONFIG.POWERUP_TYPES);
                                this.powerups.push(new Powerup(tank.x, tank.y, types[Math.floor(Math.random() * types.length)]));
                            }
                        }
                    } else if (tank instanceof RemoteTank) {
                        // 远程玩家的血量由他们自己计算并同步
                    }
                    break;
                }
            }

            if (!bullet.active) this.bullets.splice(i, 1);
        }
    }

    _bulletMapCollision(bullet) {
        const col = Math.floor(bullet.x / CONFIG.TILE_SIZE);
        const row = Math.floor(bullet.y / CONFIG.TILE_SIZE);
        const hitType = this.map.hitTest(bullet);
        
        if (hitType === 'hit_destructible' && this.isMultiplayer && this.socket) {
            this.socket.emit('tileDestroyed', { row, col });
        }
        
        return hitType ? { type: hitType, row, col } : null;
    }

    _updatePowerups(dt) {
        for (let i = this.powerups.length - 1; i >= 0; i--) {
            const p = this.powerups[i];
            p.update(dt);
            if (!p.active) {
                this.powerups.splice(i, 1);
                continue;
            }
            if (this.player && this.player.active && this._checkCollision(this.player.getRect(), p.getRect())) {
                this.applyPowerup(p.type);
                this.powerups.splice(i, 1);
            }
        }
        this.enemies = this.enemies.filter(e => e.active);
    }

    applyPowerup(type) {
        switch(type) {
            case CONFIG.POWERUP_TYPES.LIFE: this.hp++; break;
            case CONFIG.POWERUP_TYPES.BOMB: 
                this.enemies.forEach(e => { this.createExplosion(e.x+16, e.y+16); this.score+=100; });
                this.enemies = []; break;
            case CONFIG.POWERUP_TYPES.STAR:
                if (this.player) {
                    this.player.shootInterval = 200;
                    setTimeout(() => { if (this.player) this.player.shootInterval = 500; }, 5000);
                }
                break;
            case CONFIG.POWERUP_TYPES.SHOVEL:
                this.map.reinforceBase(true);
                setTimeout(() => this.map.reinforceBase(false), 10000);
                break;
        }
        this.updateHUD();
    }

    createExplosion(x, y, isSmall = false) {
        this.explosions.push({ x, y, frame: 0, isSmall });
    }

    _checkCollision(r1, r2) {
        return r1.x < r2.x + r2.width && r1.x + r1.width > r2.x &&
               r1.y < r2.y + r2.height && r1.y + r1.height > r2.y;
    }

    draw() {
        this.ctx.fillStyle = CONFIG.COLORS.BG;
        this.ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);

        this.map.draw(this.ctx, 'bottom');
        
        if (this.player && this.player.active) this.player.draw(this.ctx);
        Object.values(this.remotePlayers).forEach(p => p.draw(this.ctx));
        this.enemies.forEach(enemy => enemy.draw(this.ctx));
        this.powerups.forEach(p => p.draw(this.ctx));
        this.bullets.forEach(bullet => bullet.draw(this.ctx));
        
        this.map.draw(this.ctx, 'top');
        this.explosions.forEach(exp => SpriteRenderer.drawExplosion(this.ctx, exp.x, exp.y, exp.frame, exp.isSmall));
    }
}

window.onload = () => { window.game = new Game(); };
