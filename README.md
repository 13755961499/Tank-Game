# 坦克大战 (Tank Game) - HTML5 Canvas 版

![JavaScript](https://img.shields.io/badge/Language-JavaScript-yellow.svg)
![HTML5](https://img.shields.io/badge/Platform-HTML5-orange.svg)
![License](https://img.shields.io/badge/License-MIT-green.svg)

这是一个使用纯 **HTML5 Canvas** 和 **JavaScript** 开发的复古坦克大战小游戏。无需安装任何环境，直接在浏览器中即可运行。

---

## 🎮 游戏在线预览
*如果您已将项目推送到 GitHub Pages，可以在此处添加链接*

---

## ✨ 核心特性

- **🕹️ 玩家控制系统**
  - 支持键盘方向键精确移动。
  - 空格键发射子弹。
  - 支持 ESC 键实时暂停游戏。
- **🤖 智能敌方 AI**
  - 自动生成系统，支持多坦克同屏。
  - 随机巡逻、自动寻向及自动射击逻辑。
- **⚔️ 进阶战斗机制**
  - **子弹对消**：玩家子弹与敌方子弹碰撞时会相互抵消，增加防御维度。
  - **粒子爆炸**：精细的 Canvas 爆炸动画及屏幕震动反馈感。
- **🎁 随机道具系统**
  - 击败敌人概率掉落：
    - `❤` **生命**：增加 1 点生命值。
    - `💣` **炸弹**：全屏敌人瞬间爆炸。
    - `⭐` **星星**：临时提升射击频率（火力全开）。
    - `🛡` **铲子**：临时将老家围墙升级为不可破坏的钢墙。
- **🌐 实时多人对战 (New!)**
  - **同步机制**：基于 Socket.io 的高性能实时同步。
  - **团队协作**：联机模式下分数共享，玩家共同对抗 AI。
  - **服务端 AI**：由 Node.js 服务端统一管理 AI 逻辑，确保所有玩家看到的敌人位置、行动完全一致。
- **🗺️ 动态地图系统**
  - 包含砖墙（可破坏）、钢墙（不可破坏）、草地（掩体）、水面（阻挡坦克）。
  - 老家（Base）实时血量监控。
- **🎵 原生合成音效**
  - 使用 Web Audio API 实时合成射击和爆炸声，无需加载外部音频文件。

---

## ⌨️ 操作说明

| 按键 | 功能 |
| :--- | :--- |
| **↑ ↓ ← →** | 控制坦克移动方向 |
| **Space (空格)** | 发射子弹 |
| **ESC** | 暂停 / 继续游戏 |

---

## 🚀 快速开始

### 1. 单机模式
直接用浏览器打开项目根目录下的 `index.html` 即可开始战斗。

### 2. 多人联机模式 (本地/局域网)
1. **安装依赖**
   ```bash
   npm install
   ```
2. **启动服务器**
   ```bash
   node server.js
   ```
3. **开始游戏**
   - 主机访问：`http://localhost:3000`
   - 队友访问：`http://你的局域网IP:3000` (服务器启动时会显示具体 IP)

### 3. 公网联机 (内网穿透)
若想让不在同一 WiFi 下的朋友加入，推荐使用 NATAPP 或 cpolar：
1. **启动服务器**：`node server.js`
2. **启动穿透**：`./natapp.exe -authtoken=你的授权码`
3. **分享地址**：将 NATAPP 提供的 `http://xxxx.natappfree.cc` 发送给朋友。

---

## 📂 项目结构说明

```text
.
├── server.js           # Node.js 服务端核心逻辑 (Socket.io)
├── index.html          # 游戏入口文件
├── css/
│   └── style.css       # 游戏样式与 UI 布局
└── js/
    ├── config.js       # 全局配置中心 (平衡性参数、颜色、枚举)
    ├── audio.js        # 音效引擎 (Web Audio API 实现)
    ├── sprite.js       # 渲染引擎 (Canvas 矢量绘图逻辑)
    ├── tank.js         # 坦克逻辑类 (玩家 & AI)
    ├── bullet.js       # 子弹实体类
    ├── powerup.js      # 道具系统逻辑
    ├── map.js          # 地图系统与碰撞检测核心
    └── game.js         # 游戏主逻辑引擎 & 状态机
```

---

## 🛠️ 扩展与定制建议

- **地图编辑器**：可以通过修改 `map.js` 中的 `grid` 数组轻松创建自定义关卡。
- **资源替换**：若想使用图片素材，只需在 `sprite.js` 中将 `ctx.fillRect` 替换为 `ctx.drawImage`。
- **网络优化**：目前采用全量广播，未来可优化为差量更新以节省带宽。

---

## 📄 开源协议
本项目遵循 [MIT License](LICENSE) 开源协议。

---
祝你玩得愉快！如果你喜欢这个项目，欢迎点个 **Star** ⭐
