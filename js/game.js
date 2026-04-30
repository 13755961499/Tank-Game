/**
 * 游戏主逻辑控制 (集成子弹抵消与道具系统)
 */
class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = CONFIG.WIDTH;
        this.canvas.height = CONFIG.HEIGHT;

        this.map = new MapSystem();
        this.player = null;
        this.enemies = [];
        this.bullets = [];
        this.powerups = [];
        this.explosions = [];

        this.score = 0;
        this.hp = CONFIG.INITIAL_HP;
        this.state = 'START';

        this.keys = {};
        this.initEvents();
        this.updateHUD();
    }

    initEvents() {
        window.addEventListener('keydown', e => this.keys[e.code] = true);
        window.addEventListener('keyup', e => this.keys[e.code] = false);

        document.getElementById('start-btn').onclick = () => this.start();
        document.getElementById('resume-btn').onclick = () => this.togglePause();
        document.getElementById('restart-btn').onclick = () => this.start();

        window.addEventListener('keydown', e => {
            if (e.code === 'Escape') this.togglePause();
            if (e.code === 'Space' && this.state === 'PLAYING') {
                const b = this.player.shoot();
                if (b) this.bullets.push(b);
            }
        });
    }

    start() {
        AudioManager.init();
        this.state = 'PLAYING';
        this.score = 0;
        this.hp = CONFIG.INITIAL_HP;
        this.player = new PlayerTank(CONFIG.TILE_SIZE * 10, CONFIG.TILE_SIZE * (CONFIG.MAP_ROWS - 2));
        this.enemies = [];
        this.bullets = [];
        this.powerups = [];
        this.explosions = [];
        this.map.initDefaultMap();
        
        this.hideOverlays();
        this.updateHUD();
        
        if (!this.looping) {
            this.looping = true;
            this.gameLoop();
        }
    }

    togglePause() {
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
        document.getElementById('game-over-screen').classList.remove('hidden');
        document.getElementById('final-score').innerText = this.score;
        AudioManager.playExplosion();
    }

    hideOverlays() {
        document.querySelectorAll('.overlay').forEach(el => el.classList.add('hidden'));
    }

    updateHUD() {
        document.getElementById('hp-value').innerText = this.hp;
        document.getElementById('score-value').innerText = this.score;
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

        // 生成敌人
        if (this.enemies.length < CONFIG.MAX_ENEMIES && Math.random() < CONFIG.ENEMY_SPAWN_RATE) {
            const spawnCols = [1, 13, 24];
            const col = spawnCols[Math.floor(Math.random() * spawnCols.length)];
            this.enemies.push(new EnemyTank(col * CONFIG.TILE_SIZE, 1 * CONFIG.TILE_SIZE));
        }

        // 玩家控制
        if (this.keys['ArrowUp']) this.player.move(CONFIG.DIRECTIONS.UP, this.map, this.enemies);
        else if (this.keys['ArrowDown']) this.player.move(CONFIG.DIRECTIONS.DOWN, this.map, this.enemies);
        else if (this.keys['ArrowLeft']) this.player.move(CONFIG.DIRECTIONS.LEFT, this.map, this.enemies);
        else if (this.keys['ArrowRight']) this.player.move(CONFIG.DIRECTIONS.RIGHT, this.map, this.enemies);

        // 更新敌人 AI
        this.enemies.forEach(enemy => {
            const b = enemy.update(dt, this.map, [this.player, ...this.enemies]);
            if (b) this.bullets.push(b);
        });

        // 更新子弹逻辑
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            bullet.update();

            if (!bullet.active) {
                this.bullets.splice(i, 1);
                continue;
            }

            // 1. 子弹与子弹抵消检测
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

            // 2. 子弹与地图碰撞
            const hitType = this.map.hitTest(bullet);
            if (hitType) {
                bullet.active = false;
                this.bullets.splice(i, 1);
                if (hitType === 'game_over') this.gameOver();
                continue;
            }

            // 3. 子弹与坦克碰撞
            const targets = [this.player, ...this.enemies];
            for (let tank of targets) {
                if (!tank.active) continue;
                if (bullet.owner === 'player' && tank instanceof EnemyTank) {
                    if (this._checkCollision(bullet.getRect(), tank.getRect())) {
                        tank.active = false;
                        bullet.active = false;
                        this.score += 100;
                        this.createExplosion(tank.x + 16, tank.y + 16);
                        AudioManager.playExplosion();
                        this.updateHUD();
                        
                        // 击败敌人掉落道具
                        if (Math.random() < CONFIG.POWERUP_CHANCE) {
                            const types = Object.values(CONFIG.POWERUP_TYPES);
                            const type = types[Math.floor(Math.random() * types.length)];
                            this.powerups.push(new Powerup(tank.x, tank.y, type));
                        }
                        break;
                    }
                } else if (bullet.owner === 'enemy' && tank instanceof PlayerTank) {
                    if (this._checkCollision(bullet.getRect(), tank.getRect())) {
                        this.hp--;
                        bullet.active = false;
                        this.createExplosion(tank.x + 16, tank.y + 16);
                        AudioManager.playExplosion();
                        this.updateHUD();
                        if (this.hp <= 0) this.gameOver();
                        break;
                    }
                }
            }
            
            if (!bullet.active) {
                this.bullets.splice(i, 1);
            }
        }

        // 更新道具拾取
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

        // 清理死掉的敌人
        this.enemies = this.enemies.filter(e => e.active);
        this.explosions.forEach((exp, index) => {
            exp.frame++;
            if (exp.frame > (exp.isSmall ? 10 : 20)) this.explosions.splice(index, 1);
        });
    }

    applyPowerup(type) {
        switch(type) {
            case CONFIG.POWERUP_TYPES.LIFE:
                this.hp++;
                this.updateHUD();
                break;
            case CONFIG.POWERUP_TYPES.BOMB:
                this.enemies.forEach(e => {
                    this.createExplosion(e.x + 16, e.y + 16);
                    this.score += 100;
                });
                this.enemies = [];
                this.updateHUD();
                AudioManager.playExplosion();
                break;
            case CONFIG.POWERUP_TYPES.STAR:
                if (this.player) {
                    this.player.shootInterval = 200; // 加速射击
                    setTimeout(() => { if (this.player) this.player.shootInterval = 500; }, 5000);
                }
                break;
            case CONFIG.POWERUP_TYPES.SHOVEL:
                this.map.reinforceBase(true);
                setTimeout(() => this.map.reinforceBase(false), 10000);
                break;
        }
    }

    createExplosion(x, y, isSmall = false) {
        this.explosions.push({ x, y, frame: 0, isSmall });
    }

    _checkCollision(r1, r2) {
        return r1.x < r2.x + r2.width &&
               r1.x + r1.width > r2.x &&
               r1.y < r2.y + r2.height &&
               r1.y + r1.height > r2.y;
    }

    draw() {
        this.ctx.fillStyle = CONFIG.COLORS.BG;
        this.ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);

        this.map.draw(this.ctx);
        if (this.player && this.player.active) this.player.draw(this.ctx);
        this.enemies.forEach(enemy => enemy.draw(this.ctx));
        this.powerups.forEach(p => p.draw(this.ctx));
        this.bullets.forEach(bullet => bullet.draw(this.ctx));
        this.explosions.forEach(exp => SpriteRenderer.drawExplosion(this.ctx, exp.x, exp.y, exp.frame, exp.isSmall));
    }
}

window.onload = () => { window.game = new Game(); };
