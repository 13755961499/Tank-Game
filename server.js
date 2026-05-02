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
let powerups = {}; // 服务端管理的道具
let powerupIdCounter = 0;
let gameState = 'WAITING'; // WAITING, PLAYING, GAMEOVER

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
        { x: 8, y: 18 }, { x: 17, y: 18 }, { x: 1, y: 18 }, { x: 24, y: 18 } // 玩家出生点
    ];
    clearSpawnPoints.forEach(p => {
        if (mapData[p.y]) mapData[p.y][p.x] = 0;
    });
}

initServerMap();

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
function spawnEnemy() {
    if (Object.keys(enemies).length >= 6) return;
    const id = `ai_${enemyIdCounter++}`;
    
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
        if (!checkCollision(p.x, p.y)) {
            bestPoint = p;
            break;
        }
    }
    
    // 如果三个点都有人挡着，就暂时不生成，等待下一次循环
    if (!bestPoint) return;
    
    enemies[id] = {
        id,
        x: bestPoint.x,
        y: bestPoint.y,
        direction: 1, // DOWN
        type: 'ai'
    };
    io.emit('enemySpawned', enemies[id]);
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
        let nextX = enemy.x;
        let nextY = enemy.y;

        if (enemy.direction === 0) nextY -= speed;
        else if (enemy.direction === 1) nextY += speed;
        else if (enemy.direction === 2) nextX -= speed;
        else if (enemy.direction === 3) nextX += speed;

        if (checkCollision(nextX, nextY, id)) {
            enemy.direction = Math.floor(Math.random() * 4);
        } else {
            enemy.x = nextX;
            enemy.y = nextY;
            if (Math.random() < 0.05) {
                enemy.direction = Math.floor(Math.random() * 4);
            }
        }

        // 3. 随机射击逻辑 (增加射击同步)
        if (Math.random() < 0.08) {
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
                type: 'enemy'
            });
        }
    }

    if (Object.keys(enemies).length > 0) {
        io.emit('enemiesMoved', enemies);
    }
}

// 提高更新频率：从 100ms 改为 50ms
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
        players[socket.id] = {
            id: socket.id,
            x: playerData.x,
            y: playerData.y,
            direction: playerData.direction,
            color: playerData.color,
            hp: playerData.hp,
            score: playerData.score
        };
        console.log(`玩家 ${socket.id} 加入游戏，当前在线人数: ${Object.keys(players).length}`);

        // 广播给其他玩家
        socket.broadcast.emit('playerJoined', players[socket.id]);
        // 发送现有玩家列表给新玩家
        socket.emit('currentPlayers', players);
        // 发送当前团队分数给新加入的玩家
        socket.emit('scoreUpdate', teamScore);
        // 发送当前存在的道具给新玩家
        if (Object.keys(powerups).length > 0) {
            socket.emit('currentPowerups', powerups);
        }
        // 发送当前游戏状态
        socket.emit('gameStateUpdate', gameState);

        // 检查人数是否足够开始游戏
        if (gameState === 'WAITING' && Object.keys(players).length >= 2) {
            gameState = 'PLAYING';
            io.emit('gameStateUpdate', 'PLAYING');
            console.log('[SERVER] 玩家人数足够，游戏开始！');
            // 立即生成一个 AI
            if (Object.keys(enemies).length === 0) {
                spawnEnemy();
            }
        }
    });

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
            const enemyPos = { x: enemies[data.id].x, y: enemies[data.id].y };
            delete enemies[data.id];
            
            // 增加团队分数并同步给所有玩家
            teamScore += 100;
            io.emit('scoreUpdate', teamScore);
            
            io.emit('enemyDestroyed', data.id);

            // 联机模式下的道具生成
            if (Math.random() < 0.2) { // 20% 概率掉落
                const types = ['life', 'bomb', 'star', 'shovel'];
                const type = types[Math.floor(Math.random() * types.length)];
                const powerupId = `pw_${powerupIdCounter++}`;
                powerups[powerupId] = {
                    id: powerupId,
                    x: enemyPos.x,
                    y: enemyPos.y,
                    type: type
                };
                io.emit('powerupSpawned', powerups[powerupId]);
            }
            
            // 3秒后自动补充一个敌人
            setTimeout(() => {
                if (Object.keys(players).length > 0) {
                    spawnEnemy();
                }
            }, 3000);
        }
    });

    // 处理地图更新（墙体破坏）
    socket.on('tileDestroyed', (data) => {
        // data: { row, col }
        if (mapData && mapData[data.row]) {
            mapData[data.row][data.col] = 0; // 同步服务端地图状态
        }
        socket.broadcast.emit('tileDestroyed', data);
    });

    // 显式重置游戏状态（用于重新开始）
    socket.on('resetGame', () => {
        teamScore = 0;
        enemies = {};
        enemyIdCounter = 0;
        powerups = {};
        powerupIdCounter = 0;
        gameState = 'WAITING'; // 重置为等待状态
        initServerMap();
        io.emit('scoreUpdate', teamScore);
        io.emit('mapUpdate', mapData);
        io.emit('currentPowerups', powerups);
        io.emit('gameStateUpdate', 'WAITING');
        console.log(`[SERVER] 玩家 ${socket.id} 请求重置游戏状态`);
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
            socket.broadcast.emit('playerUpdate', players[socket.id]);
        }
    });

    // 处理道具拾取
    socket.on('powerupPicked', (id) => {
        if (powerups[id]) {
            const type = powerups[id].type;
            delete powerups[id];
            // 广播道具消失
            io.emit('powerupDestroyed', id);
            
            // 1. 如果是炸弹，同步全屏爆炸
            if (type === 'bomb') {
                for (let eid in enemies) {
                    teamScore += 100;
                    delete enemies[eid];
                }
                io.emit('scoreUpdate', teamScore);
                io.emit('allEnemiesDestroyed');
            }
            
            // 2. 如果是铲子，同步基地加固
            if (type === 'shovel') {
                io.emit('baseReinforce', true);
                // 10秒后自动取消加固
                setTimeout(() => {
                    io.emit('baseReinforce', false);
                }, 10000);
            }
        }
    });

    // 兼容旧的 playerHit 事件
    socket.on('playerHit', (data) => {
        if (players[socket.id]) {
            players[socket.id].hp = data.hp;
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
            gameState = 'WAITING';
            initServerMap(); // 恢复地图
            console.log('[SERVER] 所有玩家已离开，重置游戏状态');
        } else if (Object.keys(players).length < 2 && gameState === 'PLAYING') {
            // 如果人数不足 2 人且正在游戏中，回到等待状态
            gameState = 'WAITING';
            io.emit('gameStateUpdate', 'WAITING');
            console.log('[SERVER] 玩家人数不足 2 人，回到等待状态');
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
    // 排序：优先显示 192.168 开头的常用局域网地址
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
