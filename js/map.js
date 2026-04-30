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

        // 老家 (Base)
        const midX = Math.floor(CONFIG.MAP_COLS / 2);
        this.grid[CONFIG.MAP_ROWS - 2][midX] = CONFIG.TILE_TYPES.BASE;
        // 保护老家的围墙 (初始为砖墙，可通过道具升级)
        this.grid[CONFIG.MAP_ROWS - 2][midX - 1] = CONFIG.TILE_TYPES.BRICK;
        this.grid[CONFIG.MAP_ROWS - 2][midX + 1] = CONFIG.TILE_TYPES.BRICK;
        this.grid[CONFIG.MAP_ROWS - 3][midX - 1] = CONFIG.TILE_TYPES.BRICK;
        this.grid[CONFIG.MAP_ROWS - 3][midX] = CONFIG.TILE_TYPES.BRICK;
        this.grid[CONFIG.MAP_ROWS - 3][midX + 1] = CONFIG.TILE_TYPES.BRICK;
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

    draw(ctx) {
        for (let r = 0; r < CONFIG.MAP_ROWS; r++) {
            for (let c = 0; c < CONFIG.MAP_COLS; c++) {
                const type = this.grid[r][c];
                if (type !== CONFIG.TILE_TYPES.EMPTY) {
                    SpriteRenderer.drawTile(ctx, type, c * CONFIG.TILE_SIZE, r * CONFIG.TILE_SIZE);
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
     * 临时加固/恢复老家
     */
    reinforceBase(reinforced) {
        const midX = Math.floor(CONFIG.MAP_COLS / 2);
        const type = reinforced ? CONFIG.TILE_TYPES.STEEL : CONFIG.TILE_TYPES.BRICK;
        
        this.grid[CONFIG.MAP_ROWS - 2][midX - 1] = type;
        this.grid[CONFIG.MAP_ROWS - 2][midX + 1] = type;
        this.grid[CONFIG.MAP_ROWS - 3][midX - 1] = type;
        this.grid[CONFIG.MAP_ROWS - 3][midX] = type;
        this.grid[CONFIG.MAP_ROWS - 3][midX + 1] = type;
    }
}
