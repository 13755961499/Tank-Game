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
let mapData = null; // 用于同步地图状态（如被破坏的墙）

io.on('connection', (socket) => {
    console.log('玩家连接:', socket.id);

    // 发送当前地图状态给新玩家
    if (mapData) {
        socket.emit('mapUpdate', mapData);
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
        // 广播给其他玩家
        socket.broadcast.emit('playerJoined', players[socket.id]);
        // 发送现有玩家列表给新玩家
        socket.emit('currentPlayers', players);
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

    // 处理地图更新（墙体破坏）
    socket.on('tileDestroyed', (data) => {
        // data: { row, col }
        socket.broadcast.emit('tileDestroyed', data);
    });

    // 处理玩家受伤/死亡
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
    });
});

server.listen(PORT, () => {
    console.log(`坦克大战服务器运行在: http://localhost:${PORT}`);
});
