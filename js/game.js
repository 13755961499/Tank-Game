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
        this.bossHudEl = document.getElementById('boss-hp-hud');
        this.bossHpValueEl = document.getElementById('boss-hp-value');
        this.exp = 0;
        this.level = 1;
        this.singleExpPerLevel = 2000;
        this.pendingInitialLaser = false;
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
            if (b.isLaser) {
                this.fireLaser(this.player, b, true);
            } else {
                this.bullets.push(b);
            }
            if (this.isMultiplayer && this.socket) {
                this.socket.emit('shoot', {
                    x: b.x,
                    y: b.y,
                    direction: b.direction,
                    isLaser: b.isLaser // 同步激光状态
                });
            }
        }
    }

    /**
     * 发射激光逻辑
     */
    fireLaser(source, bullet, reportToServer = false) {
        const x = bullet.x;
        const y = bullet.y;
        const dir = bullet.direction;
        const damage = bullet.damage || 3;

        // 创建激光视觉特效
        this.explosions.push({
            x, y, 
            dir, 
            type: 'laser', 
            frame: 0, 
            life: 15 
        });

        // 激光射线检测逻辑
        const targets = [this.player, ...Object.values(this.remotePlayers), ...this.enemies];
        
        // 根据方向计算射线的矩形区域（穿透整个屏幕）
        let laserRect = null;
        const s = CONFIG.TILE_SIZE;
        if (dir === CONFIG.DIRECTIONS.UP) laserRect = { x: x - 2, y: 0, width: 4, height: y };
        else if (dir === CONFIG.DIRECTIONS.DOWN) laserRect = { x: x - 2, y: y, width: 4, height: CONFIG.HEIGHT - y };
        else if (dir === CONFIG.DIRECTIONS.LEFT) laserRect = { x: 0, y: y - 2, width: x, height: 4 };
        else if (dir === CONFIG.DIRECTIONS.RIGHT) laserRect = { x: x, y: y - 2, width: CONFIG.WIDTH - x, height: 4 };

        if (!laserRect) return; // 安全检查

        // 1. 穿透打击坦克
        targets.forEach(tank => {
            if (!tank.active || tank === source) return;
            if (this._checkCollision(laserRect, tank.getRect())) {
                this.createExplosion(tank.x + 16, tank.y + 16);
                
                // 统一伤害逻辑
                if (tank === this.player) {
                    if (!this.player.isShielded) {
                        this.hp -= damage;
                        this.updateHUD();
                        if (this.isMultiplayer && this.socket) this.socket.emit('playerHit', { hp: this.hp });
                        if (this.hp <= 0) this.gameOver();
                    }
                } else {
                    // 处理普通坦克(EnemyTank)和远程玩家(RemoteTank)
                    if (this.isMultiplayer && this.socket) {
                        // 联机模式：只允许激光拥有者上报敌方伤害，避免多端重复扣血
                        if (reportToServer) this.socket.emit('enemyHit', { id: tank.id, damage });
                    } else {
                        // 单机模式：本地扣血
                        tank.hp -= damage;
                        if (tank.hp <= 0) {
                            tank.active = false;
                            if (tank.isBoss) {
                                this.gameOver(true, true); // 击杀 BOSS 直接胜利
                            }
                            // 单机模式得分逻辑
                            if (tank instanceof EnemyTank) {
                                const gained = (tank.isElite ? 500 : 100) + (tank.isBoss ? 5000 : 0);
                                this.score += gained;
                                this.increaseExp(gained);
                                this.updateHUD();
                                // 精英怪和 BOSS 必掉道具
                                if (tank.isElite || tank.isBoss || Math.random() < CONFIG.POWERUP_CHANCE) {
                                    const types = Object.values(CONFIG.POWERUP_TYPES);
                                    this.powerups.push(new Powerup(tank.x, tank.y, types[Math.floor(Math.random() * types.length)]));
                                }
                            }
                        }
                    }
                }
            }
        });

        // 2. 穿透打击地图 (激光可以瞬间开出一条路)
        const colStart = Math.floor(laserRect.x / s);
        const colEnd = Math.ceil((laserRect.x + laserRect.width) / s);
        const rowStart = Math.floor(laserRect.y / s);
        const rowEnd = Math.ceil((laserRect.y + laserRect.height) / s);

        for (let r = rowStart; r < rowEnd; r++) {
            for (let c = colStart; c < colEnd; c++) {
                if (this.map.grid[r] && this.map.grid[r][c]) {
                    const type = this.map.grid[r][c];
                    // 核心修复：激光仅破坏砖墙，不再破坏铁墙（但会穿透过去）
                    if (type === CONFIG.TILE_TYPES.BRICK) {
                        this.map.grid[r][c] = CONFIG.TILE_TYPES.EMPTY;
                        if (this.isMultiplayer && this.socket) {
                            if (reportToServer) this.socket.emit('tileDestroyed', { row: r, col: c, bulletType: 'normal' });
                        }
                    } else if (type === CONFIG.TILE_TYPES.BASE) {
                        this.gameOver();
                        if (this.isMultiplayer && this.socket) {
                            if (reportToServer) this.socket.emit('tileDestroyed', { row: r, col: c, bulletType: 'normal' });
                        }
                    }
                }
            }
        }
        
        AudioManager.playExplosion(); // 激光音效暂时借用爆炸声
    }

    start(multiplayer = false) {
        AudioManager.init();
        const wasGameOver = this.state === 'GAMEOVER'; // 在修改状态前捕获旧状态
        this.isMultiplayer = multiplayer;
        
        this.resetLocalGameState();
        
        if (multiplayer) {
            this.initSocket();
            // 如果是从游戏结束状态重新开始，通知服务器重置
            if (wasGameOver && this.socket) {
                // 确保在连接成功后发送重置指令
                if (this.socket.connected) {
                    this.socket.emit('resetGame');
                } else {
                    this.socket.once('connect', () => {
                        this.socket.emit('resetGame');
                    });
                }
            }
        }

        this.hideOverlays();
        this.updateHUD();
        
        if (!this.looping) {
            this.looping = true;
            this.gameLoop();
        }
    }

    /**
     * 重置本地游戏状态（不涉及 Socket 连接）
     */
    resetLocalGameState() {
        this.state = 'PLAYING';
        this.score = 0;
        this.hp = CONFIG.INITIAL_HP;
        this.exp = 0;
        this.level = 1;
        this.lastEliteSpawnTime = 0; // 单机模式精英怪计时
        this.eliteSpawnInterval = 30000; // 30秒一次
        
        // 使用固定的安全出生点
        const playerPoints = CONFIG.SPAWN_POINTS.PLAYER;
        const spawnPoint = playerPoints[Math.floor(Math.random() * playerPoints.length)];
        const startX = spawnPoint.x * CONFIG.TILE_SIZE;
        const startY = spawnPoint.y * CONFIG.TILE_SIZE;
        
        this.player = new PlayerTank(startX, startY);
        this.enemies = [];
        // 核心修复：重新开始时不应清空远程玩家列表，因为队友并未离开
        // this.remotePlayers = {}; 
        this.bullets = [];
        this.powerups = [];
        this.explosions = [];
        this.map.initDefaultMap();
        
        // 重置远程玩家的状态（如血量和存活状态）
        for (let id in this.remotePlayers) {
            this.remotePlayers[id].hp = CONFIG.INITIAL_HP;
            this.remotePlayers[id].active = true;
        }

        // 单机模式开局立即生成一只精英坦克
        if (!this.isMultiplayer) {
            this.spawnSingleElite();
            
            // 为测试添加：开局在玩家前方生成一个激光道具 (仅单机模式在这里生成)
            const laserX = startX;
            const laserY = startY - CONFIG.TILE_SIZE * 2;
            const testLaser = new Powerup(laserX, laserY, CONFIG.POWERUP_TYPES.LASER);
            testLaser.id = 'test_laser_' + Date.now();
            this.powerups.push(testLaser);
        }

        if (this.isMultiplayer && this.pendingInitialLaser) {
            this.applyPowerup(CONFIG.POWERUP_TYPES.LASER);
            this.pendingInitialLaser = false;
        }
    }

    /**
     * 单机模式生成精英坦克
     */
    spawnSingleElite() {
        const eliteCount = this.enemies.filter(e => e.isElite).length;
        if (eliteCount >= 2) return; // 最多两只

        const enemyPoints = CONFIG.SPAWN_POINTS.ENEMY;
        const spawnPoint = enemyPoints[Math.floor(Math.random() * enemyPoints.length)];
        const elite = new EnemyTank(spawnPoint.x * CONFIG.TILE_SIZE, spawnPoint.y * CONFIG.TILE_SIZE);
        elite.hp = 3;
        elite.color = CONFIG.COLORS.ELITE;
        elite.isElite = true;
        this.enemies.push(elite);
        this.lastEliteSpawnTime = Date.now();
    }

    /**
     * 单机模式生成 BOSS 坦克
     */
    spawnBoss() {
        if (this.enemies.some(e => e.isBoss)) return; // 场上只能有一个 BOSS

        const enemyPoints = CONFIG.SPAWN_POINTS.ENEMY;
        const spawnPoint = enemyPoints[Math.floor(Math.random() * enemyPoints.length)];
        const boss = new EnemyTank(spawnPoint.x * CONFIG.TILE_SIZE, spawnPoint.y * CONFIG.TILE_SIZE);
        boss.hp = 30; // 恢复正式血量
        boss.maxHp = boss.hp;
        boss.color = CONFIG.COLORS.BOSS;
        boss.isBoss = true;
        this.enemies.push(boss);
        console.log('%c BOSS 出现了！', 'color: red; font-size: 20px; font-weight: bold;');
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
                    if (enemy.type === 'elite') {
                        e.hp = enemy.hp;
                        e.color = CONFIG.COLORS.ELITE;
                        e.isElite = true;
                    } else if (enemy.type === 'boss') {
                        e.hp = enemy.hp;
                        e.maxHp = enemy.hp;
                        e.color = CONFIG.COLORS.BOSS;
                        e.isBoss = true;
                    }
                    this.enemies.push(e);
                }
            }
        });

        this.socket.on('assignedPosition', (pos) => {
            console.log(`[DEBUG] 收到服务器分配的位置: (${pos.x}, ${pos.y})`);
            if (this.player) {
                this.player.x = pos.x;
                this.player.y = pos.y;
            }
        });

        this.socket.on('enemySpawned', (enemy) => {
            console.log(`[DEBUG] 收到新 AI 生成: ${enemy.id}, 类型: ${enemy.type}`);
            const e = new EnemyTank(enemy.x, enemy.y);
            e.id = enemy.id;
            if (enemy.type === 'elite') {
                e.hp = enemy.hp;
                e.color = CONFIG.COLORS.ELITE;
                e.isElite = true;
                console.log(`[DEBUG] 已将 ${enemy.id} 标记为精英坦克`);
            } else if (enemy.type === 'boss') {
                e.hp = enemy.hp;
                e.maxHp = enemy.hp;
                e.color = CONFIG.COLORS.BOSS;
                e.isBoss = true;
                console.log(`[DEBUG] 已将 ${enemy.id} 标记为 BOSS 坦克`);
            }
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

        this.socket.on('mapUpdate', (data) => {
            this.map.grid = JSON.parse(JSON.stringify(data));
        });

        this.socket.on('enemyShoot', (data) => {
            if (data.isLaser) {
                // 如果是激光，查找发射源
                const source = data.playerId ? this.remotePlayers[data.playerId] : null;
                const b = new Bullet(data.x, data.y, data.direction, 'enemy');
                b.isLaser = true;
                b.damage = 3;
                this.fireLaser(source, b, false);
            } else {
                const b = new Bullet(data.x, data.y, data.direction, data.type || 'enemy');
                if (data.isElite) b.isElite = true; // 标记精英子弹
                if (data.isBoss) {
                    b.isBoss = true;
                    b.damage = data.damage || 2;
                }
                this.bullets.push(b);
            }
        });

        this.socket.on('currentPowerups', (powerupsData) => {
            this.powerups = [];
            for (let id in powerupsData) {
                const p = powerupsData[id];
                if (this.isMultiplayer && this.socket && p.type === CONFIG.POWERUP_TYPES.LASER && id === `pw_init_laser_${this.socket.id}`) {
                    this.pendingInitialLaser = true;
                    if (this.player && this.state !== 'GAMEOVER') {
                        this.applyPowerup(p.type);
                        this.pendingInitialLaser = false;
                    }
                    this.socket.emit('powerupPicked', id);
                    continue;
                }
                const newP = new Powerup(p.x, p.y, p.type);
                newP.id = id;
                this.powerups.push(newP);
            }
        });

        this.socket.on('powerupSpawned', (p) => {
            if (this.isMultiplayer && this.socket && p.type === CONFIG.POWERUP_TYPES.LASER && p.id === `pw_init_laser_${this.socket.id}`) {
                this.pendingInitialLaser = true;
                if (this.player && this.state !== 'GAMEOVER') {
                    this.applyPowerup(p.type);
                    this.pendingInitialLaser = false;
                }
                this.socket.emit('powerupPicked', p.id);
                return;
            }
            const newP = new Powerup(p.x, p.y, p.type);
            newP.id = p.id;
            this.powerups.push(newP);
            AudioManager.playPowerupSpawn(); // 假设有这个音效
        });

        this.socket.on('powerupDestroyed', (id) => {
            this.powerups = this.powerups.filter(p => p.id !== id);
        });

        this.socket.on('allEnemiesDestroyed', () => {
            this.enemies.forEach(e => this.createExplosion(e.x + 16, e.y + 16));
            this.enemies = [];
            AudioManager.playExplosion();
        });

        this.socket.on('baseReinforce', (active) => {
            console.log(`[DEBUG] 收到基地加固同步: ${active}`);
            this.map.reinforceBase(active);
        });

        this.socket.on('playerBuff', (data) => {
            console.log(`[DEBUG] 收到全队增益同步: ${data.type} = ${data.active}`);
            if (data.type === 'star') {
                if (this.player) {
                    this.player.shootInterval = data.active ? 200 : 500;
                }
            }
        });

        this.socket.on('refreshTanksFullHP', (data) => {
            if (!data) return;
            if (Number.isFinite(data.hp)) {
                this.hp = data.hp;
                this.updateHUD();
            }
            if (this.player) this.player.active = true;
        });

        this.socket.on('playerLeft', (id) => {
            delete this.remotePlayers[id];
        });

        this.socket.on('playerUpdate', (p) => {
            if (this.remotePlayers[p.id]) {
                this.remotePlayers[p.id].updateState(p);
            }
        });

        this.socket.on('tileDestroyed', (data) => {
            this.map.grid[data.row][data.col] = CONFIG.TILE_TYPES.EMPTY;
        });

        this.socket.on('gameStateUpdate', (payload) => {
            const state = typeof payload === 'string' ? payload : payload.state;
            const isWin = typeof payload === 'string' ? false : !!payload.isWin;
            console.log(`[DEBUG] 收到游戏状态更新: ${state}`);
            if (state === 'WAITING') {
                this.state = 'WAITING';
                this.showWaitingScreen(true);
            } else if (state === 'PLAYING') {
                // 核心修复：如果从 GAMEOVER 切换到 PLAYING，全员重置本地状态
                if (this.isMultiplayer && this.state === 'GAMEOVER') {
                    console.log('[DEBUG] 检测到游戏重新开始，重置本地状态');
                    this.resetLocalGameState();
                    this.hideOverlays();
                }
                this.state = 'PLAYING';
                this.showWaitingScreen(false);
            } else if (state === 'GAMEOVER') {
                // 如果是联机模式，收到 GAMEOVER 且不是胜利时，强制将本地血量设为 0
                if (this.isMultiplayer && !isWin) {
                    this.hp = 0;
                    if (this.player) this.player.active = false;
                    this.updateHUD();
                }
                // 确保触发 UI 弹出
                this.gameOver(true, isWin); 
            }
        });

        this.socket.on('scoreUpdate', (score) => {
            this.score = score;
            this.updateHUD();
            if (this.state === 'GAMEOVER') {
                const finalScoreEl = document.getElementById('final-score');
                if (finalScoreEl) finalScoreEl.innerText = this.score;
                if (this.score > this.highScore) {
                    this.highScore = this.score;
                    localStorage.setItem('tankGame_highScore', this.highScore);
                    const highScoreOverEl = document.getElementById('high-score-over');
                    if (highScoreOverEl) highScoreOverEl.innerText = this.highScore;
                }
            }
        });

        this.socket.on('expUpdate', (data) => {
            if (!data) return;
            if (Number.isFinite(data.exp)) this.exp = data.exp;
            if (Number.isFinite(data.level)) this.level = data.level;
        });

        this.socket.on('playerExp', (data) => {
            if (!data || !data.playerId) return;
            if (data.playerId === this.socket.id) {
                if (Number.isFinite(data.exp)) this.exp = data.exp;
                if (Number.isFinite(data.level)) this.level = data.level;
            }
        });

        this.socket.on('levelUp', (data) => {
            if (!data) return;
            if (data.playerId === this.socket.id) {
                if (Number.isFinite(data.newLevel)) this.level = data.newLevel;
                if (Number.isFinite(data.triggerExp)) this.exp = data.triggerExp;
            }
        });

        this.socket.on('enemyUpdate', (data) => {
            const enemy = this.enemies.find(e => e.id === data.id);
            if (enemy) {
                enemy.hp = data.hp;
            }
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

    gameOver(force = false, isWin = false) {
        if (this.state === 'GAMEOVER' && !force) return; 
        this.state = 'GAMEOVER';
        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('tankGame_highScore', this.highScore);
        }
        
        const overScreen = document.getElementById('game-over-screen');
        const overTitle = document.getElementById('game-over-title');
        
        overScreen.classList.remove('hidden');
        if (isWin) {
            overTitle.innerText = '恭喜通关！';
            overTitle.style.color = '#f1c40f'; // 金色
        } else {
            overTitle.innerText = '游戏结束';
            overTitle.style.color = '#e74c3c'; // 红色
        }
        
        document.getElementById('final-score').innerText = this.score;
        document.getElementById('high-score-over').innerText = this.highScore;
        AudioManager.playExplosion();
        // 核心修复：联机模式下死亡不要立即断开连接，否则服务器可能会因为人数不足将状态切回 WAITING
        // 从而导致另一名玩家看到的是“等待加入”而不是“游戏结束”
        // if (this.socket) this.socket.disconnect();
    }

    hideOverlays() {
        document.querySelectorAll('.overlay').forEach(el => el.classList.add('hidden'));
    }

    updateHUD() {
        document.getElementById('hp-value').innerText = this.hp;
        document.getElementById('score-value').innerText = this.score;
        document.getElementById('high-score-value').innerText = this.highScore;
        const levelEl = document.getElementById('level-value');
        if (levelEl) levelEl.innerText = this.level;
    }

    getLevelFromExp(exp) {
        const per = this.isMultiplayer ? 5000 : this.singleExpPerLevel;
        const safe = Number.isFinite(exp) ? Math.max(0, Math.floor(exp)) : 0;
        return Math.floor(safe / per) + 1;
    }

    increaseExp(amount) {
        if (this.isMultiplayer) return;
        if (!Number.isFinite(amount) || amount <= 0) return;
        const delta = Math.floor(amount);
        if (delta <= 0) return;

        const oldLevel = this.level;
        this.exp += delta;
        const newLevel = this.getLevelFromExp(this.exp);
        if (newLevel > oldLevel) {
            this.level = newLevel;
            this.hp = CONFIG.INITIAL_HP;
            if (this.player) this.player.active = true;
            this.updateHUD();
        }
    }

    updateBossHUD() {
        if (!this.bossHudEl) this.bossHudEl = document.getElementById('boss-hp-hud');
        if (!this.bossHpValueEl) this.bossHpValueEl = document.getElementById('boss-hp-value');
        if (!this.bossHudEl || !this.bossHpValueEl) return;

        const boss = this.enemies.find(e => e && e.isBoss && e.active !== false);
        if (!boss) {
            this.bossHudEl.classList.add('hidden');
            return;
        }

        const maxHp = boss.maxHp || 30;
        this.bossHpValueEl.innerText = `${Math.max(0, boss.hp)}/${maxHp}`;
        this.bossHudEl.classList.remove('hidden');
    }

    showWaitingScreen(show) {
        let waitingEl = document.getElementById('waiting-overlay');
        if (!waitingEl) {
            waitingEl = document.createElement('div');
            waitingEl.id = 'waiting-overlay';
            waitingEl.className = 'overlay';
            waitingEl.innerHTML = `
                <div class="content">
                    <h2>等待其他玩家加入...</h2>
                    <p>联机模式至少需要 2 名玩家</p>
                    <div class="loader"></div>
                </div>
            `;
            document.querySelector('.game-container').appendChild(waitingEl);
        }
        
        if (show) {
            waitingEl.classList.remove('hidden');
        } else {
            waitingEl.classList.add('hidden');
        }
    }

    gameLoop() {
        try {
            if (this.state === 'PLAYING') {
                this.update();
            }
            this.draw();
        } catch (error) {
            console.error('游戏循环崩溃:', error);
            this.looping = false; // 允许下次尝试重新启动循环
            return; // 停止当前循环
        }
        requestAnimationFrame(() => this.gameLoop());
    }

    update() {
        const dt = 16;

        // 1. 生成敌人 (仅单机模式)
        if (!this.isMultiplayer) {
            // 普通坦克补充逻辑 (3秒补充一只，场上最多 6 只)
            if (this.enemies.filter(e => !e.isElite).length < CONFIG.MAX_ENEMIES) {
                if (!this.lastEnemySpawnTime) this.lastEnemySpawnTime = 0;
                const now = Date.now();
                if (now - this.lastEnemySpawnTime > 3000) {
                    const enemyPoints = CONFIG.SPAWN_POINTS.ENEMY;
                    const spawnPoint = enemyPoints[Math.floor(Math.random() * enemyPoints.length)];
                    this.enemies.push(new EnemyTank(spawnPoint.x * CONFIG.TILE_SIZE, spawnPoint.y * CONFIG.TILE_SIZE));
                    this.lastEnemySpawnTime = now;
                }
            }

            // 精英坦克补充逻辑 (30秒周期，场上最多 2 只)
            const now = Date.now();
            if (now - this.lastEliteSpawnTime > this.eliteSpawnInterval) {
                this.spawnSingleElite();
            }

            // BOSS 触发逻辑：1000 分且场上没有 BOSS
            if (this.score >= 1000 && !this.enemies.some(e => e.isBoss)) {
                this.spawnBoss();
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

        // 5. 更新道具拾取
        this._updatePowerups(dt);
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
                // 如果是普通子弹打中铁墙，子弹消失但墙不坏
                if (hitInfo.tileType === CONFIG.TILE_TYPES.STEEL && !bullet.isElite) {
                    bullet.active = false;
                    this.bullets.splice(i, 1);
                    continue;
                }
                
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
                    // 核心修复：如果坦克有护盾且被敌方子弹击中，子弹消失但坦克不受伤
                    if (tank.isShielded && bullet.owner === 'enemy') {
                        bullet.active = false;
                        this.createExplosion(bullet.x, bullet.y, true);
                        AudioManager.playHit();
                        break;
                    }

                    bullet.active = false;
                    this.createExplosion(tank.x + 16, tank.y + 16);
                    AudioManager.playExplosion();

                    if (tank === this.player) {
                        // 再次确认护盾（双重保险）
                        if (this.player.isShielded) break;
                        
                        const actualDamage = bullet.damage || 1;
                        this.hp -= actualDamage;
                        this.updateHUD();
                        if (this.isMultiplayer && this.socket) {
                            this.socket.emit('playerHit', { hp: this.hp });
                        }
                        if (this.hp <= 0) this.gameOver();
                    } else if (tank instanceof EnemyTank) {
                        const damage = bullet.damage || 1;
                        if (this.isMultiplayer && this.socket) {
                            // 联机模式：发送伤害给服务器
                            this.socket.emit('enemyHit', { id: tank.id, damage: damage });
                        } else {
                            // 单机模式 BOSS 逻辑
                            if (tank.isBoss) {
                                tank.hp -= damage;
                                if (tank.hp <= 0) {
                                tank.active = false;
                                this.score += 5000;
                                this.increaseExp(5000);
                                this.gameOver(true, true); // 击杀胜利
                            }
                            } else if (tank.isElite) {
                                tank.hp -= damage;
                                if (tank.hp <= 0) {
                                    tank.active = false;
                                    this.score += 500; // 精英怪 500 分
                                    this.increaseExp(500);
                                    this.updateHUD();
                                    // 精英怪 100% 掉落道具
                                    const types = Object.values(CONFIG.POWERUP_TYPES);
                                    this.powerups.push(new Powerup(tank.x, tank.y, types[Math.floor(Math.random() * types.length)]));
                                }
                            } else {
                                tank.active = false;
                                this.score += 100;
                                this.increaseExp(100);
                                this.updateHUD();
                                if (Math.random() < CONFIG.POWERUP_CHANCE) {
                                    const types = Object.values(CONFIG.POWERUP_TYPES);
                                    this.powerups.push(new Powerup(tank.x, tank.y, types[Math.floor(Math.random() * types.length)]));
                                }
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
        const tileType = (this.map.grid[row] && this.map.grid[row][col]) || 0;
        const hitType = this.map.hitTest(bullet);
        
        // 核心修复：无论是普通砖墙还是老家(BASE)，只要被击中，都要同步给服务端
        if ((hitType === 'hit_destructible' || hitType === 'game_over') && this.isMultiplayer && this.socket) {
            // 如果是铁墙，只有精英子弹能打掉
            if (tileType === CONFIG.TILE_TYPES.STEEL && !bullet.isElite) {
                // 不发送销毁请求
            } else {
                this.socket.emit('tileDestroyed', { row, col, bulletType: bullet.isElite ? 'elite' : 'normal' });
            }
        }
        
        return hitType ? { type: hitType, row, col, tileType } : null;
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
                if (this.isMultiplayer && this.socket) {
                    this.socket.emit('powerupPicked', p.id);
                }
                this.powerups.splice(i, 1);
            }
        }
        
        // 更新激光和普通特效的生命周期
        this.explosions.forEach(exp => {
            exp.frame++;
        });
        
        // 过滤掉已过期的特效
        this.explosions = this.explosions.filter(exp => {
            const maxFrame = exp.type === 'laser' ? (exp.life || 15) : (exp.isSmall ? 10 : 20);
            return exp.frame <= maxFrame;
        });

        // 仅在单机模式下清理非活跃敌人 (联机模式由服务端同步删除)
        if (!this.isMultiplayer) {
            this.enemies = this.enemies.filter(e => e.active);
        }
    }

    applyPowerup(type) {
        // 联机模式下，大部分道具效果通过服务器广播同步
        // 只有 LIFE, SHIELD 和 LASER 是个人私有的
        if (this.isMultiplayer) {
            if (type === CONFIG.POWERUP_TYPES.LIFE) {
                this.hp++;
                this.updateHUD();
                this.socket.emit('playerUpdate', { hp: this.hp });
            }
            if (type === CONFIG.POWERUP_TYPES.SHIELD) {
                this.player.isShielded = true;
                this.socket.emit('playerUpdate', { isShielded: true });
                // 10秒后自动取消
                setTimeout(() => {
                    if (this.player) {
                        this.player.isShielded = false;
                        if (this.socket) this.socket.emit('playerUpdate', { isShielded: false });
                    }
                }, 10000);
            }
            if (type === CONFIG.POWERUP_TYPES.LASER) {
                this.player.laserCount = 5;
            }
            return;
        }

        switch(type) {
            case CONFIG.POWERUP_TYPES.LIFE: this.hp++; break;
            case CONFIG.POWERUP_TYPES.LASER: this.player.laserCount = 5; break;
            case CONFIG.POWERUP_TYPES.SHIELD:
                if (this.player) {
                    this.player.isShielded = true;
                    setTimeout(() => { if (this.player) this.player.isShielded = false; }, 10000);
                }
                break;
            case CONFIG.POWERUP_TYPES.BOMB: 
                let gainedTotal = 0;
                this.enemies.forEach(e => {
                    this.createExplosion(e.x+16, e.y+16);
                    if (e.isBoss) {
                        e.hp -= 5; // 修改：单机模式炸弹对 BOSS 也是扣 5 点
                        if (e.hp <= 0) {
                            e.active = false;
                            this.score += 5000;
                            gainedTotal += 5000;
                            this.gameOver(true, true);
                        }
                    } else {
                        e.active = false;
                        const gained = (e.isElite ? 500 : 100);
                        this.score += gained;
                        gainedTotal += gained;
                    }
                });
                if (gainedTotal > 0) this.increaseExp(gainedTotal);
                this.enemies = this.enemies.filter(e => e.active);
                break;
            case CONFIG.POWERUP_TYPES.STAR:
                if (this.player) {
                    this.player.shootInterval = 200;
                    setTimeout(() => { if (this.player) this.player.shootInterval = 500; }, 10000);
                }
                break;
            case CONFIG.POWERUP_TYPES.SHOVEL:
                this.map.reinforceBase(true);
                setTimeout(() => this.map.reinforceBase(false), 30000);
                break;
            case CONFIG.POWERUP_TYPES.REPAIR:
                this.map.grid[CONFIG.MAP_ROWS - 2][Math.floor(CONFIG.MAP_COLS / 2) - 1] = CONFIG.TILE_TYPES.BRICK;
                this.map.grid[CONFIG.MAP_ROWS - 2][Math.floor(CONFIG.MAP_COLS / 2) + 1] = CONFIG.TILE_TYPES.BRICK;
                this.map.grid[CONFIG.MAP_ROWS - 3][Math.floor(CONFIG.MAP_COLS / 2) - 1] = CONFIG.TILE_TYPES.STEEL;
                this.map.grid[CONFIG.MAP_ROWS - 3][Math.floor(CONFIG.MAP_COLS / 2)] = CONFIG.TILE_TYPES.STEEL;
                this.map.grid[CONFIG.MAP_ROWS - 3][Math.floor(CONFIG.MAP_COLS / 2) + 1] = CONFIG.TILE_TYPES.STEEL;
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

        this.updateBossHUD();

        this.map.draw(this.ctx, 'bottom');
        
        if (this.player && this.player.active) this.player.draw(this.ctx);
        Object.values(this.remotePlayers).forEach(p => p.draw(this.ctx));
        this.enemies.forEach(enemy => enemy.draw(this.ctx));
        this.powerups.forEach(p => p.draw(this.ctx));
        this.bullets.forEach(bullet => bullet.draw(this.ctx));
        
        this.map.draw(this.ctx, 'top');
        this.explosions.forEach(exp => {
            if (exp.type === 'laser') {
                SpriteRenderer.drawExplosion(this.ctx, exp.x, exp.y, exp.frame, false, 'laser', exp.dir);
            } else {
                SpriteRenderer.drawExplosion(this.ctx, exp.x, exp.y, exp.frame, exp.isSmall);
            }
        });
    }
}

// 核心修复：确保实例化代码在文件末尾，且不重复
if (!window.game) {
    window.game = new Game();
}
