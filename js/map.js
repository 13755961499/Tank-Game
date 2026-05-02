/**
 * 地图系统
 */
class MapSystem {
    constructor() {
        this.grid = [];
        this.initDefaultMap();
    }

    initDefaultMap() {
        // 初始化空地图
        for (let r = 0; r < CONFIG.MAP_ROWS; r++) {
            this.grid[r] = [];
            for (let c = 0; c < CONFIG.MAP_COLS; c++) {
                // 边界墙
                if (r === 0 || r === CONFIG.MAP_ROWS - 1 || c === 0 || c === CONFIG.MAP_COLS - 1) {
                    this.grid[r][c] = CONFIG.TILE_TYPES.STEEL;
                } else {
                    this.grid[r][c] = CONFIG.TILE_TYPES.EMPTY;
                }
            }
        }

        // 添加一些障碍物
        this._addBlocks(3, 3, 2, 4, CONFIG.TILE_TYPES.BRICK);
        this._addBlocks(3, 10, 2, 4, CONFIG.TILE_TYPES.BRICK);
        this._addBlocks(3, 17, 2, 4, CONFIG.TILE_TYPES.BRICK);
        
        this._addBlocks(10, 5, 4, 2, CONFIG.TILE_TYPES.STEEL);
        this._addBlocks(10, 15, 4, 2, CONFIG.TILE_TYPES.STEEL);

        this._addBlocks(15, 3, 2, 4, CONFIG.TILE_TYPES.BRICK);
        this._addBlocks(15, 17, 2, 4, CONFIG.TILE_TYPES.BRICK);

        // 添加水面区域 (不可通行，子弹可通过)
        this._addBlocks(8, 8, 10, 2, CONFIG.TILE_TYPES.WATER);

        // 添加草地区域 (可通行，遮挡视线)
        this._addBlocks(4, 5, 3, 3, CONFIG.TILE_TYPES.GRASS);
        this._addBlocks(4, 18, 3, 3, CONFIG.TILE_TYPES.GRASS);
        this._addBlocks(14, 10, 6, 2, CONFIG.TILE_TYPES.GRASS);

        // 老家 (Base)
        const midX = Math.floor(CONFIG.MAP_COLS / 2);
        this.grid[CONFIG.MAP_ROWS - 2][midX] = CONFIG.TILE_TYPES.BASE;
        // 保护老家的围墙 (仅正面三块加固为钢墙，侧面保留为砖墙)
        this.grid[CONFIG.MAP_ROWS - 2][midX - 1] = CONFIG.TILE_TYPES.BRICK; // 左侧
        this.grid[CONFIG.MAP_ROWS - 2][midX + 1] = CONFIG.TILE_TYPES.BRICK; // 右侧
        this.grid[CONFIG.MAP_ROWS - 3][midX - 1] = CONFIG.TILE_TYPES.STEEL; // 正面左
        this.grid[CONFIG.MAP_ROWS - 3][midX] = CONFIG.TILE_TYPES.STEEL;     // 正面中
        this.grid[CONFIG.MAP_ROWS - 3][midX + 1] = CONFIG.TILE_TYPES.STEEL; // 正面右

        // 核心修复：确保所有出生点位置都是空的
        const spawnPoints = [
            ...CONFIG.SPAWN_POINTS.ENEMY,
            ...CONFIG.SPAWN_POINTS.PLAYER
        ];
        spawnPoints.forEach(p => {
            if (this.grid[p.y]) this.grid[p.y][p.x] = CONFIG.TILE_TYPES.EMPTY;
        });
    }

    _addBlocks(row, col, w, h, type) {
        for (let r = row; r < row + h; r++) {
            for (let c = col; c < col + w; c++) {
                if (this.grid[r] && this.grid[r][c] !== undefined) {
                    this.grid[r][c] = type;
                }
            }
        }
    }

    draw(ctx, layer = 'bottom') {
        for (let r = 0; r < CONFIG.MAP_ROWS; r++) {
            for (let c = 0; c < CONFIG.MAP_COLS; c++) {
                const type = this.grid[r][c];
                if (type === CONFIG.TILE_TYPES.EMPTY) continue;

                if (layer === 'bottom') {
                    // 底部层：砖墙、钢墙、水面、老家
                    if (type !== CONFIG.TILE_TYPES.GRASS) {
                        SpriteRenderer.drawTile(ctx, type, c * CONFIG.TILE_SIZE, r * CONFIG.TILE_SIZE);
                    }
                } else if (layer === 'top') {
                    // 顶部层：草地 (遮盖坦克)
                    if (type === CONFIG.TILE_TYPES.GRASS) {
                        SpriteRenderer.drawTile(ctx, type, c * CONFIG.TILE_SIZE, r * CONFIG.TILE_SIZE);
                    }
                }
            }
        }
    }

    /**
     * 检测矩形是否与地图障碍物碰撞
     */
    checkCollision(rect) {
        const startCol = Math.floor(rect.x / CONFIG.TILE_SIZE);
        const endCol = Math.floor((rect.x + rect.width) / CONFIG.TILE_SIZE);
        const startRow = Math.floor(rect.y / CONFIG.TILE_SIZE);
        const endRow = Math.floor((rect.y + rect.height) / CONFIG.TILE_SIZE);

        for (let r = startRow; r <= endRow; r++) {
            for (let c = startCol; c <= endCol; c++) {
                if (this.grid[r] && this.grid[r][c]) {
                    const type = this.grid[r][c];
                    if (type === CONFIG.TILE_TYPES.BRICK || 
                        type === CONFIG.TILE_TYPES.STEEL || 
                        type === CONFIG.TILE_TYPES.WATER ||
                        type === CONFIG.TILE_TYPES.BASE) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    /**
     * 子弹击中检测
     */
    hitTest(bullet) {
        const col = Math.floor(bullet.x / CONFIG.TILE_SIZE);
        const row = Math.floor(bullet.y / CONFIG.TILE_SIZE);

        if (this.grid[row] && this.grid[row][col]) {
            const type = this.grid[row][col];
            if (type === CONFIG.TILE_TYPES.BRICK) {
                this.grid[row][col] = CONFIG.TILE_TYPES.EMPTY;
                return 'hit_destructible';
            }
            if (type === CONFIG.TILE_TYPES.STEEL) {
                return 'hit_indestructible';
            }
            if (type === CONFIG.TILE_TYPES.BASE) {
                return 'game_over';
            }
        }
        return null;
    }

    /**
     * 临时加固/恢复老家 (适配新需求：正面永久钢墙，仅侧面随道具切换)
     */
    reinforceBase(reinforced) {
        const midX = Math.floor(CONFIG.MAP_COLS / 2);
        
        // 正面三块保持永久钢墙
        this.grid[CONFIG.MAP_ROWS - 3][midX - 1] = CONFIG.TILE_TYPES.STEEL;
        this.grid[CONFIG.MAP_ROWS - 3][midX] = CONFIG.TILE_TYPES.STEEL;
        this.grid[CONFIG.MAP_ROWS - 3][midX + 1] = CONFIG.TILE_TYPES.STEEL;

        // 侧面两块根据道具状态在钢墙和砖墙之间切换
        const sideType = reinforced ? CONFIG.TILE_TYPES.STEEL : CONFIG.TILE_TYPES.BRICK;
        this.grid[CONFIG.MAP_ROWS - 2][midX - 1] = sideType;
        this.grid[CONFIG.MAP_ROWS - 2][midX + 1] = sideType;
    }
}
