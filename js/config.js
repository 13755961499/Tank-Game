/**
 * 坦克大战全局配置
 */
const CONFIG = {
    TILE_SIZE: 32,
    MAP_COLS: 26,
    MAP_ROWS: 20,
    FPS: 60,

    // 实体属性
    PLAYER_SPEED: 3,
    ENEMY_SPEED: 2,
    BULLET_SPEED: 6,
    BULLET_SIZE: 6,
    
    // 游戏机制
    INITIAL_HP: 5,
    ENEMY_SPAWN_RATE: 0.01, // 每一帧生成敌人的概率
    MAX_ENEMIES: 6,
    
    // 道具配置
    POWERUP_TYPES: {
        LIFE: 'life',           // 增加生命值
        BOMB: 'bomb',           // 全屏敌人爆炸
        STAR: 'star',           // 提升射击速度 (临时)
        SHOVEL: 'shovel',       // 临时加固老家 (暂定逻辑)
        REPAIR: 'repair',       // 修复老家围墙
        SHIELD: 'shield'        // 护盾无敌
    },
    POWERUP_CHANCE: 0.2,        // 击败敌人掉落道具的概率

    // 颜色定义 (十六进制)
    COLORS: {
        BG: '#000000',
        BRICK: '#a0522d',
        STEEL: '#bdc3c7',
        GRASS: '#2ecc71',
        WATER: '#3498db',
        PLAYER: '#f1c40f',
        ENEMY: '#e74c3c',
        ELITE: '#0000FF',       // 精英坦克蓝色
        BULLET: '#ffffff',
        BASE: '#f1c40f',
        POWERUP: '#9b59b6'      // 道具紫色
    },

    // 枚举
    TILE_TYPES: {
        EMPTY: 0,
        BRICK: 1,
        STEEL: 2,
        GRASS: 3,
        WATER: 4,
        BASE: 9
    },
    
    DIRECTIONS: {
        UP: 0,
        DOWN: 1,
        LEFT: 2,
        RIGHT: 3
    },

    // 固定出生点配置 (网格坐标)
    SPAWN_POINTS: {
        ENEMY: [
            { x: 1, y: 1 },   // 左上
            { x: 12, y: 1 },  // 中上 (避开中间钢墙)
            { x: 24, y: 1 }   // 右上
        ],
        PLAYER: [
            { x: 8, y: 18 },  // 下左 (老家左侧空地)
            { x: 17, y: 18 }, // 下右 (老家右侧空地)
            { x: 1, y: 18 },  // 左下角
            { x: 24, y: 18 }  // 右下角
        ]
    }
};

CONFIG.WIDTH = CONFIG.TILE_SIZE * CONFIG.MAP_COLS;
CONFIG.HEIGHT = CONFIG.TILE_SIZE * CONFIG.MAP_ROWS;
