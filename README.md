# 坦克大战 (Tank Game)

复古像素风坦克大战，支持单机与联机合作（Socket.io）。联机模式采用服务端权威：服务端统一驱动 AI、判定关键状态并同步给客户端。

- 渲染：HTML5 Canvas
- 客户端：原生 JavaScript
- 服务端：Node.js + Express + Socket.io

## 核心玩法

- 子弹对消：玩家子弹与敌方子弹碰撞会相互抵消
- 敌方类型：普通敌人 / 精英坦克 / BOSS
- 道具系统：击败敌人掉落道具，道具在地面停留一段时间后会消失
- 通关条件：击杀 BOSS 显示“恭喜通关！”
- 联机规则：
  - 至少 2 名玩家才会开始游戏（WAITING → PLAYING）
  - 玩家出生点由服务端分配，避免重叠出生
  - BOSS 血量在 HUD 中显示并实时更新
  - 每局开始会发放开局激光（两人模式共 2 个）

## 平衡参数（最新）

- 激光伤害：固定 3（对任何敌人一致）
- 精英坦克血量：3
- BOSS 血量：30
- 炸弹对 BOSS：固定扣 5 点（不再秒杀）
- 敌人射击频率：服务端限制，最低间隔 0.5s
- 道具地面停留时间：10s
- 道具效果持续时间：
  - 星星（攻速）：10s
  - 铲子（基地加固）：30s
  - 护盾：10s

## 经验等级（EXP / LV）

- 联机模式：EXP 每累计 5000 自动升 1 级；升级触发“全队坦克满血刷新”，HUD 显示 LV
- 单机模式：每 2000 分升级 1 次；升级触发满血刷新，HUD 显示 LV

## 操作说明

| 按键 | 功能 |
| --- | --- |
| ↑ ↓ ← → | 移动 |
| Space | 射击 |
| ESC | 暂停/继续（仅单机模式） |

## 运行方式

### 单机模式

直接用浏览器打开 [index.html](index.html) 即可开始。

### 联机模式（本地/局域网）

1. 安装依赖
   ```bash
   npm install
   ```
2. 启动服务器
   ```bash
   npm start
   ```
3. 访问游戏
   - 本机：`http://localhost:3000`
   - 队友：`http://你的局域网IP:3000`

如果队友访问不到，检查防火墙是否放行 3000 端口、以及双方是否在同一局域网。

### 内网穿透（natapp / netapp）

项目根目录已包含 [natapp.exe](natapp.exe)。常用方式二选一：

1) 使用 authtoken 直接启动（示例）
```powershell
.\natapp.exe -authtoken=你的token -proto=tcp -localport=3000
```

2) 使用 natapp 的配置文件（如果你本机已按 natapp 文档配置好）
```powershell
.\natapp.exe
```

启动后 natapp 会输出一个公网地址（域名或 IP:端口）。把该地址分享给队友，通过浏览器访问即可。

## 测试

```bash
npm test
```

## 背景音乐

项目内置背景音乐文件，开始游戏后自动循环播放，结算界面停止播放。

- 当前曲目：`assets/韩承东 - 机战王.mp3`
- 资源目录：`assets/`

## 目录结构

```text
.
├── assets/            # 背景音乐等资源
├── server.js          # 服务端权威：游戏状态机、AI、道具、计分、通关、EXP/LV
├── index.html         # 页面入口
├── package.json       # npm scripts（start/test）
├── css/
│   └── style.css      # UI 样式
├── js/
│   ├── config.js      # 配置与平衡参数
│   ├── audio.js       # 音效
│   ├── sprite.js      # 绘制
│   ├── map.js         # 地图与碰撞
│   ├── tank.js        # 坦克与射击（含激光）
│   ├── powerup.js     # 道具实体（单机模式停留时间）
│   └── game.js        # 主循环、联机同步、HUD（含 Boss HP / LV）
└── test/
    └── levelSystem.test.js
```
