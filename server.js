const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// 静态文件服务
app.use(express.static(__dirname));

// 游戏状态
let players = {};
let enemies = {}; // 服务端管理的AI敌人
let mapData = null;
let enemyIdCounter = 0;
let teamScore = 0; // 全局团队分数
let bossSpawned = false; // BOSS 是否已生成
let powerups = {}; // 服务端管理的道具
let powerupIdCounter = 0;
let powerupTimeouts = {};
const POWERUP_LIFETIME_MS = 10000;
const EXP_PER_LEVEL = 5000;
const MAX_EXP = Number.MAX_SAFE_INTEGER;
let gameState = 'WAITING'; // WAITING, PLAYING, GAMEOVER
let eliteSpawnTimer = null; // 精英坦克生成定时器
let hasSpawnedInitialLasers = false; // 记录是否已经发放过开局激光

// 初始化服务端地图数据 (用于 AI 碰撞检测)
function initServerMap() {
    const rows = 20;
    const cols = 26;
    mapData = [];
    for (let r = 0; r < rows; r++) {
        mapData[r] = [];
        for (let c = 0; c < cols; c++) {
            // 边界墙
            if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) {
                mapData[r][c] = 2; // STEEL
            } else {
                mapData[r][c] = 0; // EMPTY
            }
        }
    }

    // 辅助函数添加障碍物 (对应 map.js 的布局)
    const addBlocks = (row, col, w, h, type) => {
        for (let r = row; r < row + h; r++) {
            for (let c = col; c < col + w; c++) {
                if (mapData[r]) mapData[r][c] = type;
            }
        }
    };

    addBlocks(3, 3, 2, 4, 1);   // BRICK
    addBlocks(3, 10, 2, 4, 1);  // BRICK
    addBlocks(3, 17, 2, 4, 1);  // BRICK
    addBlocks(10, 5, 4, 2, 2);  // STEEL
    addBlocks(10, 15, 4, 2, 2); // STEEL
    addBlocks(15, 3, 2, 4, 1);  // BRICK
    addBlocks(15, 17, 2, 4, 1); // BRICK
    addBlocks(8, 8, 10, 2, 4);  // WATER
    
    // 添加草地 (GRASS: 3)
    addBlocks(4, 5, 3, 3, 3);
    addBlocks(4, 18, 3, 3, 3);
    addBlocks(14, 10, 6, 2, 3);
    
    // 老家位置
    const midX = 13;
    mapData[18][midX] = 9;      // BASE
    mapData[18][midX-1] = 1;    // BRICK
    mapData[18][midX+1] = 1;    // BRICK
    mapData[17][midX-1] = 2;    // STEEL
    mapData[17][midX] = 2;      // STEEL
    mapData[17][midX+1] = 2;    // STEEL

    // 核心修复：确保所有出生点位置都是空的 (0)
    const clearSpawnPoints = [
        { x: 1, y: 1 }, { x: 12, y: 1 }, { x: 24, y: 1 }, // 敌人出生点
        { x: 10, y: 18 }, { x: 16, y: 18 } // 玩家出生点 (老家左右三格)
    ];
    clearSpawnPoints.forEach(p => {
        if (mapData[p.y]) mapData[p.y][p.x] = 0;
    });
}

initServerMap();

function getLevelFromExp(totalExp) {
    const exp = Number.isFinite(totalExp) ? Math.max(0, Math.floor(totalExp)) : 0;
    return Math.floor(exp / EXP_PER_LEVEL) + 1;
}

function normalizeExpAmount(amount) {
    if (!Number.isFinite(amount)) return 0;
    const n = Math.floor(amount);
    if (n <= 0) return 0;
    return n;
}

function applyExpGain(player, amount) {
    const delta = normalizeExpAmount(amount);
    if (!delta) return { oldLevel: player.level || 1, newLevel: player.level || 1, exp: player.exp || 0, leveled: false };

    const oldExp = Number.isFinite(player.exp) ? player.exp : 0;
    const nextExp = Math.min(MAX_EXP, oldExp + delta);
    player.exp = nextExp;

    const oldLevel = Number.isFinite(player.level) ? player.level : 1;
    const newLevel = getLevelFromExp(nextExp);
    if (newLevel > oldLevel) {
        player.level = newLevel;
        return { oldLevel, newLevel, exp: nextExp, leveled: true };
    }
    player.level = oldLevel;
    return { oldLevel, newLevel: oldLevel, exp: nextExp, leveled: false };
}

function refreshTanksFullHP(playerId) {
    const p = players[playerId];
    if (!p) {
        console.warn(`[SERVER][RefreshTanksFullHP] 玩家不存在: ${playerId}`);
        return;
    }
    if (p.hp === undefined) {
        console.warn(`[SERVER][RefreshTanksFullHP] 玩家HP不存在: ${playerId}`);
        return;
    }
    refreshPlayerFullHP(p);

    io.to(playerId).emit('refreshTanksFullHP', { hp: p.hp, maxHp: p.maxHp });
    io.emit('playerUpdate', p);
}

function refreshPlayerFullHP(player) {
    if (!player) return;
    const maxHp = Number.isFinite(player.maxHp) ? player.maxHp : player.hp;
    player.maxHp = maxHp;
    player.hp = maxHp;
    if (player.burning !== undefined) player.burning = false;
    if (player.poisoned !== undefined) player.poisoned = false;
    if (player.dotStacks !== undefined) player.dotStacks = 0;
}

function refreshAllPlayersFullHP() {
    for (const pid in players) {
        const p = players[pid];
        if (!p) continue;
        if (p.hp === undefined) {
            console.warn(`[SERVER][RefreshAllPlayersFullHP] 玩家HP不存在: ${pid}`);
            continue;
        }
        refreshPlayerFullHP(p);
        io.to(pid).emit('refreshTanksFullHP', { hp: p.hp, maxHp: p.maxHp });
        io.emit('playerUpdate', p);
    }
}

function increaseExp(playerId, amount) {
    const p = players[playerId];
    if (!p) {
        console.warn(`[SERVER][increaseExp] 玩家不存在: ${playerId}`);
        return;
    }
    const delta = normalizeExpAmount(amount);
    if (!delta) {
        if (amount !== undefined && amount !== 0) console.warn(`[SERVER][increaseExp] 非法经验增量: ${amount}`);
        return;
    }
    const before = Number.isFinite(p.exp) ? p.exp : 0;
    const { oldLevel, newLevel, exp, leveled } = applyExpGain(p, delta);
    if (leveled) {
        io.emit('levelUp', { playerId, oldLevel, newLevel, triggerExp: exp });
        refreshAllPlayersFullHP();
    }
    if (Number.isFinite(p.score)) p.score += delta;
    else p.score = delta;
    io.to(playerId).emit('expUpdate', { exp: p.exp, level: p.level });
    if (before !== p.exp) socketSafeBroadcastExp(playerId);
}

function socketSafeBroadcastExp(playerId) {
    const p = players[playerId];
    if (!p) return;
    io.emit('playerExp', { playerId, exp: p.exp || 0, level: p.level || 1 });
}

function schedulePowerupExpiry(powerupId) {
    if (powerupTimeouts[powerupId]) {
        clearTimeout(powerupTimeouts[powerupId]);
        delete powerupTimeouts[powerupId];
    }
    powerupTimeouts[powerupId] = setTimeout(() => {
        if (powerups[powerupId]) {
            delete powerups[powerupId];
            io.emit('powerupDestroyed', powerupId);
        }
        if (powerupTimeouts[powerupId]) {
            clearTimeout(powerupTimeouts[powerupId]);
            delete powerupTimeouts[powerupId];
        }
    }, POWERUP_LIFETIME_MS);
}

// 服务端碰撞检测
function checkCollision(x, y, excludeId = null) {
    const size = 32;
    const padding = 2; // 减小边距，提高碰撞检测的严密性
    
    // 边界检查：防止走出地图
    if (x < 0 || x > 26 * 32 - size || y < 0 || y > 20 * 32 - size) {
        return true;
    }

    const rect = {
        left: x + padding,
        right: x + size - padding,
        top: y + padding,
        bottom: y + size - padding
    };

    // 1. 地图碰撞 (精确检测四个角和中点)
    const checkPoints = [
        { x: rect.left, y: rect.top },
        { x: rect.right, y: rect.top },
        { x: rect.left, y: rect.bottom },
        { x: rect.right, y: rect.bottom },
        { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 }
    ];

    for (let pt of checkPoints) {
        const c = Math.floor(pt.x / size);
        const r = Math.floor(pt.y / size);
        if (mapData[r] && mapData[r][c]) {
            const type = mapData[r][c];
            // 1: BRICK, 2: STEEL, 4: WATER, 9: BASE
            if (type === 1 || type === 2 || type === 4 || type === 9) return true;
        }
    }

    // 2. 与其他玩家碰撞
    for (let id in players) {
        if (id === excludeId) continue;
        const p = players[id];
        if (rect.left < p.x + size - padding &&
            rect.right > p.x + padding &&
            rect.top < p.y + size - padding &&
            rect.bottom > p.y + padding) {
            return true;
        }
    }

    // 3. 与其他 AI 碰撞
    for (let id in enemies) {
        if (id === excludeId) continue;
        const e = enemies[id];
        if (rect.left < e.x + size - padding &&
            rect.right > e.x + padding &&
            rect.top < e.y + size - padding &&
            rect.bottom > e.y + padding) {
            return true;
        }
    }

    return false;
}

// 封装生成 AI 的逻辑
function spawnEnemy(type = 'ai') {
    if (type === 'ai' && Object.keys(enemies).filter(id => !id.startsWith('elite') && !id.startsWith('boss')).length >= 6) return;
    
    // 核心限制：场上精英坦克最多存在 2 只
    if (type === 'elite' && Object.keys(enemies).filter(id => id.startsWith('elite')).length >= 2) {
        return;
    }

    // BOSS 限制
    if (type === 'boss' && (bossSpawned || Object.keys(enemies).some(id => id.startsWith('boss')))) {
        return;
    }

    const id = type === 'boss' ? `boss_${enemyIdCounter++}` : (type === 'elite' ? `elite_${enemyIdCounter++}` : `ai_${enemyIdCounter++}`);
    
    // 使用固定的安全出生点 (网格坐标转像素)
    const spawnPoints = [
        { x: 1 * 32, y: 1 * 32 },
        { x: 12 * 32, y: 1 * 32 },
        { x: 24 * 32, y: 1 * 32 }
    ];
    
    // 寻找一个既没有墙也没有其他坦克的出生点
    let bestPoint = null;
    const shuffledPoints = spawnPoints.sort(() => Math.random() - 0.5);
    
    for (let p of shuffledPoints) {
        // 对于精英坦克和 BOSS，我们稍微放宽一点碰撞检测，或者如果失败了就强制选一个
        if (!checkCollision(p.x, p.y)) {
            bestPoint = p;
            break;
        }
    }
    
    // 如果是精英坦克或 BOSS 但没找到空位，强制选择一个出生点
    if (!bestPoint && (type === 'elite' || type === 'boss')) {
        bestPoint = shuffledPoints[0];
    }
    
    if (!bestPoint) return;
    
    enemies[id] = {
        id,
        x: bestPoint.x,
        y: bestPoint.y,
        direction: 1, // DOWN
        type: type,
        hp: type === 'boss' ? 30 : (type === 'elite' ? 3 : 1),
        lastShootTime: 0 // 初始化射击时间
    };
    if (type === 'boss') bossSpawned = true;
    io.emit('enemySpawned', enemies[id]);
}

// 开始精英坦克循环
function startEliteCycle() {
    if (eliteSpawnTimer) clearInterval(eliteSpawnTimer);
    
    console.log('[SERVER] 游戏开始，尝试立即生成首只精英坦克...');
    // 核心要求：游戏开始立即刷新一只精英怪
    // 增加一个延时，确保地图和状态已经完全同步
    setTimeout(() => {
        spawnEnemy('elite');
    }, 500);

    eliteSpawnTimer = setInterval(() => {
        if (gameState === 'PLAYING' && Object.keys(players).length >= 2) {
            console.log('[SERVER] 30秒周期：尝试生成精英坦克');
            spawnEnemy('elite');
        }
    }, 30000); // 30秒
}

// 服务端AI逻辑
function updateAI() {
    if (Object.keys(players).length === 0) return;
    // 只有在游戏进行中才更新 AI
    if (gameState !== 'PLAYING') return;

    if (Object.keys(enemies).length < 6 && Math.random() < 0.1) {
        spawnEnemy();
    }

    for (let id in enemies) {
        const enemy = enemies[id];
        const speed = 4;
        let moved = false;

        // 尝试当前方向移动
        let nextX = enemy.x;
        let nextY = enemy.y;
        if (enemy.direction === 0) nextY -= speed;
        else if (enemy.direction === 1) nextY += speed;
        else if (enemy.direction === 2) nextX -= speed;
        else if (enemy.direction === 3) nextX += speed;

        // 核心修复：增加脱困逻辑。如果移动受阻，尝试其他所有方向
        if (checkCollision(nextX, nextY, id)) {
            // 随机打乱方向顺序尝试
            const dirs = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
            for (let d of dirs) {
                let tx = enemy.x;
                let ty = enemy.y;
                if (d === 0) ty -= speed;
                else if (d === 1) ty += speed;
                else if (d === 2) tx -= speed;
                else if (d === 3) tx += speed;

                if (!checkCollision(tx, ty, id)) {
                    enemy.x = tx;
                    enemy.y = ty;
                    enemy.direction = d;
                    moved = true;
                    break;
                }
            }
            // 如果所有方向都走不动，保持原位并随机换个方向下次再试
            if (!moved) {
                enemy.direction = Math.floor(Math.random() * 4);
            }
        } else {
            enemy.x = nextX;
            enemy.y = nextY;
            moved = true;
            // 随机改变方向的概率
            if (Math.random() < 0.05) {
                enemy.direction = Math.floor(Math.random() * 4);
            }
        }

        // 3. 随机射击逻辑 (增加射击频率限制：不低于 0.5s)
        const now = Date.now();
        if (now - enemy.lastShootTime > 500 && Math.random() < 0.1) {
            enemy.lastShootTime = now;
            // 计算子弹起始位置（炮管口）
            let bx = enemy.x + 16;
            let by = enemy.y + 16;
            const offset = 16;
            if (enemy.direction === 0) by -= offset;
            else if (enemy.direction === 1) by += offset;
            else if (enemy.direction === 2) bx -= offset;
            else if (enemy.direction === 3) bx += offset;

            io.emit('enemyShoot', {
                x: bx,
                y: by,
                direction: enemy.direction,
                type: 'enemy',
                isElite: enemy.type === 'elite',
                isBoss: enemy.type === 'boss',
                damage: enemy.type === 'boss' ? 2 : 1
            });
        }
    }

    // 检查是否需要生成 BOSS
    if (teamScore >= 1000 && !bossSpawned) {
        console.log(`[SERVER] 团队分数达到 ${teamScore}，触发 BOSS 生成逻辑`);
        spawnEnemy('boss');
    }

    if (Object.keys(enemies).length > 0) {
        io.emit('enemiesMoved', enemies);
    }
}

// 仅修复老家围墙
function repairBaseWalls() {
    if (!mapData) return;
    const midX = 13;
    // 恢复老家周围的砖墙和钢墙
    mapData[18][midX-1] = 1;    // BRICK
    mapData[18][midX+1] = 1;    // BRICK
    mapData[17][midX-1] = 2;    // STEEL
    mapData[17][midX] = 2;      // STEEL
    mapData[17][midX+1] = 2;    // STEEL
    // 确保老家本身是存在的
    mapData[18][midX] = 9;      // BASE
}

// 提高更新频率：从 100ms 改为 50ms
if (require.main === module) {
    setInterval(updateAI, 50);

    io.on('connection', (socket) => {
        console.log('玩家连接:', socket.id);

    // 发送当前地图状态给新玩家
    if (mapData) {
        socket.emit('mapUpdate', mapData);
    }

    // 发送当前已存在的 AI 给新玩家
    if (Object.keys(enemies).length > 0) {
        socket.emit('currentEnemies', enemies);
    }

    // 处理新玩家加入
    socket.on('join', (playerData) => {
        let finalX = playerData.x;
        let finalY = playerData.y;

        // 核心修复：检查位置冲突。如果该位置已被其他玩家占用，则自动切换到另一个出生点
        const spawnPoints = [
            { x: 10 * 32, y: 18 * 32 },
            { x: 16 * 32, y: 18 * 32 }
        ];

        for (let pid in players) {
            const p = players[pid];
            if (Math.abs(p.x - finalX) < 32 && Math.abs(p.y - finalY) < 32) {
                // 发生重叠，切换到另一个点
                const otherPoint = spawnPoints.find(pt => Math.abs(pt.x - finalX) > 10);
                if (otherPoint) {
                    finalX = otherPoint.x;
                    finalY = otherPoint.y;
                }
                break;
            }
        }

        players[socket.id] = {
            id: socket.id,
            x: finalX,
            y: finalY,
            direction: playerData.direction,
            color: playerData.color,
            hp: playerData.hp,
            score: playerData.score,
            isShielded: false,
            maxHp: playerData.hp,
            exp: 0,
            level: 1
        };
        console.log(`玩家 ${socket.id} 加入游戏，最终位置: (${finalX}, ${finalY})`);

        // 告知客户端其最终分配的位置
        socket.emit('assignedPosition', { x: finalX, y: finalY });

        // 广播给其他玩家
        socket.broadcast.emit('playerJoined', players[socket.id]);
        // 发送现有玩家列表给新玩家
        socket.emit('currentPlayers', players);
        // 发送当前团队分数给新加入的玩家
        socket.emit('scoreUpdate', teamScore);
        // 发送当前存在的道具给新玩家 (始终发送，确保同步)
        socket.emit('currentPowerups', powerups);
        
        // 发送当前游戏状态
        socket.emit('gameStateUpdate', gameState);

        // 检查人数是否足够开始游戏 (修改：要求至少 2 人开始)
        if (gameState === 'WAITING' && Object.keys(players).length >= 2) {
            gameState = 'PLAYING';
            io.emit('gameStateUpdate', 'PLAYING');
            console.log(`[SERVER] 玩家人数足够 (${Object.keys(players).length}人)，游戏开始！`);
            
            // 核心修复：每次游戏开始时为所有玩家生成激光道具
            spawnInitialLasers();
            
            startEliteCycle(); // 开启精英坦克循环
            // 立即生成一个 AI
            if (Object.keys(enemies).length === 0) {
                spawnEnemy();
            }
        }
    });

    // 辅助函数：为所有玩家生成开局激光
    function spawnInitialLasers() {
        for (let pid in players) {
            const p = players[pid];
            const powerupId = `pw_init_laser_${pid}`;
            // 如果该位置已经有道具了，先删除（防止重复）
            if (powerups[powerupId]) delete powerups[powerupId];
            
            powerups[powerupId] = {
                id: powerupId,
                x: p.x,
                y: p.y,
                type: 'laser'
            };
            io.emit('powerupSpawned', powerups[powerupId]);
            schedulePowerupExpiry(powerupId);
        }
    }

    // 处理玩家移动
    socket.on('playerMove', (moveData) => {
        if (players[socket.id]) {
            players[socket.id].x = moveData.x;
            players[socket.id].y = moveData.y;
            players[socket.id].direction = moveData.direction;
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    // 处理子弹发射
    socket.on('shoot', (bulletData) => {
        socket.broadcast.emit('enemyShoot', {
            playerId: socket.id,
            ...bulletData
        });
    });

    // 处理AI被击中
    socket.on('enemyHit', (data) => {
        if (enemies[data.id]) {
            const enemy = enemies[data.id];
            const damage = data.damage || 1;
            
            enemy.hp -= damage;
            
            // 广播血量更新给所有玩家（可选，用于 UI 同步）
            io.emit('enemyUpdate', { id: data.id, hp: enemy.hp });

            if (enemy.hp <= 0) {
                const enemyPos = { x: enemy.x, y: enemy.y };
                const isElite = enemy.type === 'elite';
                const isBoss = enemy.type === 'boss';
                let shouldWin = false;
                
                delete enemies[data.id];
                
                // 增加团队分数
                if (isBoss) {
                    bossSpawned = false; // 核心修复：BOSS 死亡后重置生成标识
                    teamScore += 5000;
                    increaseExp(socket.id, 5000);
                    if (gameState === 'PLAYING') {
                        gameState = 'GAMEOVER';
                        shouldWin = true;
                    }
                } else {
                    const gained = isElite ? 500 : 100;
                    teamScore += gained;
                    increaseExp(socket.id, gained);
                }
                
                io.emit('scoreUpdate', teamScore);
                if (shouldWin) {
                    io.emit('gameStateUpdate', { state: 'GAMEOVER', isWin: true });
                }
                io.emit('enemyDestroyed', data.id);

                // 道具生成逻辑
                if (isElite || isBoss || Math.random() < 0.25) {
                    const types = ['life', 'bomb', 'star', 'shovel', 'repair', 'shield', 'laser'];
                    const type = types[Math.floor(Math.random() * types.length)];
                    const powerupId = `pw_${powerupIdCounter++}`;
                    powerups[powerupId] = {
                        id: powerupId,
                        x: enemyPos.x,
                        y: enemyPos.y,
                        type: type
                    };
                    io.emit('powerupSpawned', powerups[powerupId]);
                    schedulePowerupExpiry(powerupId);
                }
                
                // 3秒后自动补充一个普通敌人（如果不是 BOSS 死亡）
                if (!isBoss) {
                    setTimeout(() => {
                        if (Object.keys(players).length > 0) {
                            spawnEnemy();
                        }
                    }, 3000);
                }
            }
        }
    });

    // 处理地图更新（墙体破坏）
    socket.on('tileDestroyed', (data) => {
        // data: { row, col, bulletType }
        if (mapData && mapData[data.row]) {
            const tile = mapData[data.row][data.col];
            // 普通子弹打不动铁墙 (2)，只有精英坦克子弹 (elite) 能打掉
            if (tile === 2 && data.bulletType !== 'elite') {
                return; 
            }
            
            // 如果是老家被毁，触发游戏结束
            if (tile === 9) {
                if (gameState === 'PLAYING') {
                    gameState = 'GAMEOVER';
                    io.emit('gameStateUpdate', 'GAMEOVER');
                    console.log(`[SERVER] 老家被毁，游戏结束`);
                }
            }

            mapData[data.row][data.col] = 0; // 同步服务端地图状态
        }
        socket.broadcast.emit('tileDestroyed', data);
    });

    // 显式重置游戏状态（用于重新开始）
    socket.on('resetGame', () => {
        teamScore = 0;
        enemies = {};
        enemyIdCounter = 0;
        bossSpawned = false; // 重置 BOSS 状态
        powerups = {};
        for (const tid in powerupTimeouts) {
            clearTimeout(powerupTimeouts[tid]);
        }
        powerupTimeouts = {};
        powerupIdCounter = 0;
        if (eliteSpawnTimer) clearInterval(eliteSpawnTimer);
        eliteSpawnTimer = null;
        initServerMap();
        
        // 核心修复：重置后立即检查人数，决定是 WAITING 还是 PLAYING (要求至少 2 人)
        if (Object.keys(players).length >= 2) {
            gameState = 'PLAYING';
            console.log(`[SERVER] 玩家 ${socket.id} 请求重置，人数充足 (${Object.keys(players).length}人)，游戏开始`);
            
            // 重置时为每个玩家分配不同的出生点
            const spawnPoints = [
                { x: 10 * 32, y: 18 * 32 },
                { x: 16 * 32, y: 18 * 32 }
            ];
            let idx = 0;
            for (let pid in players) {
                const point = spawnPoints[idx % spawnPoints.length];
                players[pid].x = point.x;
                players[pid].y = point.y;
                players[pid].isShielded = false;
                players[pid].exp = 0;
                players[pid].level = 1;
                if (players[pid].maxHp === undefined) players[pid].maxHp = players[pid].hp;
                players[pid].hp = players[pid].maxHp;
                io.to(pid).emit('assignedPosition', point);
                idx++;
            }

            spawnInitialLasers(); // 每次重新开始都发放激光
            startEliteCycle();
        } else {
            gameState = 'WAITING';
            console.log(`[SERVER] 玩家 ${socket.id} 请求重置，人数不足，等待中`);
        }

        // 确保在连接成功后发送重置指令
        io.emit('scoreUpdate', teamScore);
        io.emit('mapUpdate', mapData);
        io.emit('currentPowerups', powerups);
        io.emit('currentPlayers', players); // 核心修复：重置时同步现有玩家列表，防止队友消失
        io.emit('gameStateUpdate', gameState);
    });

    // 处理玩家状态更新 (血量、分数等)
    socket.on('playerUpdate', (data) => {
        if (players[socket.id]) {
            if (data.hp !== undefined) {
                players[socket.id].hp = data.hp;
                // 如果任一玩家血量降为 0，游戏结束
                if (data.hp <= 0 && gameState === 'PLAYING') {
                    gameState = 'GAMEOVER';
                    io.emit('gameStateUpdate', 'GAMEOVER');
                    console.log(`[SERVER] 玩家 ${socket.id} 阵亡，游戏结束`);
                }
            }
            if (data.score !== undefined) players[socket.id].score = data.score;
            if (data.isShielded !== undefined) players[socket.id].isShielded = data.isShielded;
            socket.broadcast.emit('playerUpdate', players[socket.id]);
        }
    });

    // 处理道具拾取
    socket.on('powerupPicked', (id) => {
        if (powerups[id]) {
            const type = powerups[id].type;
            delete powerups[id];
            if (powerupTimeouts[id]) {
                clearTimeout(powerupTimeouts[id]);
                delete powerupTimeouts[id];
            }
            // 广播道具消失
            io.emit('powerupDestroyed', id);
            
            // 1. 如果是炸弹，同步全屏爆炸
            if (type === 'bomb') {
                const enemiesToDelete = [];
                let shouldWin = false;
                let gainedTotal = 0;
                for (let eid in enemies) {
                    const enemy = enemies[eid];
                    if (enemy.type === 'boss') {
                        enemy.hp -= 5; // 修改：炸弹对 BOSS 固定扣 5 点伤害
                        io.emit('enemyUpdate', { id: eid, hp: enemy.hp }); // 同步 BOSS 血量
                        if (enemy.hp <= 0) {
                            enemiesToDelete.push(eid);
                            bossSpawned = false; // 核心修复：BOSS 被炸弹炸死后重置生成标识
                            teamScore += 5000;
                            gainedTotal += 5000;
                            if (gameState === 'PLAYING') {
                                gameState = 'GAMEOVER';
                                shouldWin = true;
                            }
                        }
                    } else {
                        const gained = enemy.type === 'elite' ? 500 : 100;
                        teamScore += gained;
                        gainedTotal += gained;
                        enemiesToDelete.push(eid);
                    }
                }
                
                // 统一删除
                enemiesToDelete.forEach(eid => {
                    delete enemies[eid];
                    io.emit('enemyDestroyed', eid);
                });

                io.emit('scoreUpdate', teamScore);
                if (gainedTotal > 0) increaseExp(socket.id, gainedTotal);
                if (shouldWin) {
                    io.emit('gameStateUpdate', { state: 'GAMEOVER', isWin: true });
                }
                // 核心修复：不再发送 allEnemiesDestroyed，因为 Boss 可能会幸存
                // 具体的敌人销毁由 enemyDestroyed 处理，客户端会负责对应的爆炸效果
                // io.emit('allEnemiesDestroyed'); 
            }
            
            // 2. 如果是铲子，同步基地加固
            if (type === 'shovel') {
                io.emit('baseReinforce', true);
                setTimeout(() => {
                    io.emit('baseReinforce', false);
                }, 30000);
            }

            // 3. 如果是星星，同步全队火力全开
            if (type === 'star') {
                io.emit('playerBuff', { type: 'star', active: true });
                setTimeout(() => {
                    io.emit('playerBuff', { type: 'star', active: false });
                }, 10000);
            }

            // 4. 如果是修复，同步修复老家围墙
            if (type === 'repair') {
                repairBaseWalls(); // 仅修复老家围墙
                io.emit('mapUpdate', mapData); // 广播给所有人
                io.emit('scoreUpdate', teamScore); 
            }
        }
    });

    // 处理玩家受伤/死亡
    socket.on('playerHit', (data) => {
        if (players[socket.id]) {
            players[socket.id].hp = data.hp;
            
            // 核心修复：playerHit 也要检查是否导致游戏结束
            if (data.hp <= 0 && gameState === 'PLAYING') {
                gameState = 'GAMEOVER';
                io.emit('gameStateUpdate', 'GAMEOVER');
                console.log(`[SERVER] 玩家 ${socket.id} 通过 playerHit 阵亡，游戏结束`);
            }
            
            socket.broadcast.emit('playerUpdate', players[socket.id]);
        }
    });

    // 断开连接
    socket.on('disconnect', () => {
        console.log('玩家断开:', socket.id);
        delete players[socket.id];
        io.emit('playerLeft', socket.id);

        // 如果所有玩家都断开了，重置团队分数和 AI，以便下次游戏从零开始
        if (Object.keys(players).length === 0) {
            teamScore = 0;
            enemies = {};
            enemyIdCounter = 0;
            bossSpawned = false;
            for (const tid in powerupTimeouts) {
                clearTimeout(powerupTimeouts[tid]);
            }
            powerupTimeouts = {};
            powerups = {};
            gameState = 'WAITING';
            initServerMap(); // 恢复地图
            console.log('[SERVER] 所有玩家已离开，重置游戏状态');
        }
    });
    });

    const os = require('os');

    function getLocalIPs() {
        const interfaces = os.networkInterfaces();
        const ips = [];
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    ips.push({ name, address: iface.address });
                }
            }
        }
        ips.sort((a, b) => {
            if (a.address.startsWith('192.168')) return -1;
            if (b.address.startsWith('192.168')) return 1;
            return 0;
        });
        return ips;
    }

    const allIPs = getLocalIPs();

    server.listen(PORT, '0.0.0.0', () => {
        console.log(`坦克大战服务器已启动！`);
        console.log(`- 本地访问: http://localhost:${PORT}`);
        
        if (allIPs.length > 0) {
            console.log(`- 局域网访问地址 (请尝试以下地址):`);
            allIPs.forEach(ip => {
                console.log(`  > http://${ip.address}:${PORT}  (${ip.name})`);
            });
        }

        console.log(`\n提示: 如果他人无法访问，请检查 Windows 防火墙是否允许 ${PORT} 端口。`);
        console.log(`注意: 2.0.0.1 通常是虚拟网卡(如虚拟机的网卡)，联机请优先使用 192.168.x.x 开头的地址。`);
    });
}

module.exports = { EXP_PER_LEVEL, getLevelFromExp, normalizeExpAmount, applyExpGain, refreshPlayerFullHP, refreshAllPlayersFullHP, increaseExp, refreshTanksFullHP };
