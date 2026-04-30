/**
 * 坦克基类
 */
class Tank {
    constructor(x, y, direction, color) {
        this.x = x;
        this.y = y;
        this.direction = direction;
        this.color = color;
        this.speed = 0;
        this.hp = CONFIG.TANK_HP;
        this.active = true;
        this.lastShotTime = 0;
        this.shootInterval = 500; // 射击冷却 (ms)
    }

    getRect() {
        return {
            x: this.x + 2,
            y: this.y + 2,
            width: CONFIG.TILE_SIZE - 4,
            height: CONFIG.TILE_SIZE - 4
        };
    }

    draw(ctx) {
        if (!this.active) return;
        SpriteRenderer.drawTank(ctx, this.x, this.y, this.direction, this.color, this instanceof PlayerTank);
    }

    shoot() {
        const now = Date.now();
        if (now - this.lastShotTime > this.shootInterval) {
            this.lastShotTime = now;
            // 计算子弹起始位置（炮管口）
            let bx = this.x + CONFIG.TILE_SIZE / 2;
            let by = this.y + CONFIG.TILE_SIZE / 2;
            
            const offset = CONFIG.TILE_SIZE / 2;
            switch(this.direction) {
                case CONFIG.DIRECTIONS.UP: by -= offset; break;
                case CONFIG.DIRECTIONS.DOWN: by += offset; break;
                case CONFIG.DIRECTIONS.LEFT: bx -= offset; break;
                case CONFIG.DIRECTIONS.RIGHT: bx += offset; break;
            }
            
            AudioManager.playShoot();
            return new Bullet(bx, by, this.direction, this instanceof PlayerTank ? 'player' : 'enemy');
        }
        return null;
    }

    move(newDir, mapSystem, otherTanks) {
        this.direction = newDir;
        let nextX = this.x;
        let nextY = this.y;

        switch(newDir) {
            case CONFIG.DIRECTIONS.UP: nextY -= this.speed; break;
            case CONFIG.DIRECTIONS.DOWN: nextY += this.speed; break;
            case CONFIG.DIRECTIONS.LEFT: nextX -= this.speed; break;
            case CONFIG.DIRECTIONS.RIGHT: nextX += this.speed; break;
        }

        // 碰撞检测：地图
        const rect = { x: nextX + 2, y: nextY + 2, width: CONFIG.TILE_SIZE - 4, height: CONFIG.TILE_SIZE - 4 };
        if (mapSystem.checkCollision(rect)) {
            return false;
        }

        // 碰撞检测：其他坦克
        for (let tank of otherTanks) {
            if (tank === this || !tank.active) continue;
            if (this._checkRectCollision(rect, tank.getRect())) {
                return false;
            }
        }

        // 边界限制
        if (nextX < 0 || nextX > CONFIG.WIDTH - CONFIG.TILE_SIZE || 
            nextY < 0 || nextY > CONFIG.HEIGHT - CONFIG.TILE_SIZE) {
            return false;
        }

        this.x = nextX;
        this.y = nextY;
        return true;
    }

    _checkRectCollision(r1, r2) {
        return r1.x < r2.x + r2.width &&
               r1.x + r1.width > r2.x &&
               r1.y < r2.y + r2.height &&
               r1.y + r1.height > r2.y;
    }
}

/**
 * 玩家坦克
 */
class PlayerTank extends Tank {
    constructor(x, y) {
        super(x, y, CONFIG.DIRECTIONS.UP, CONFIG.COLORS.PLAYER);
        this.speed = CONFIG.PLAYER_SPEED;
    }
}

/**
 * 敌方坦克
 */
class EnemyTank extends Tank {
    constructor(x, y) {
        super(x, y, CONFIG.DIRECTIONS.DOWN, CONFIG.COLORS.ENEMY);
        this.speed = CONFIG.ENEMY_SPEED;
        this.moveTimer = 0;
        this.changeDirInterval = 1000 + Math.random() * 2000;
    }

    update(dt, mapSystem, otherTanks) {
        this.moveTimer += dt;
        
        // 随机移动逻辑
        if (!this.move(this.direction, mapSystem, otherTanks) || this.moveTimer > this.changeDirInterval) {
            const dirs = [CONFIG.DIRECTIONS.UP, CONFIG.DIRECTIONS.DOWN, CONFIG.DIRECTIONS.LEFT, CONFIG.DIRECTIONS.RIGHT];
            this.direction = dirs[Math.floor(Math.random() * dirs.length)];
            this.moveTimer = 0;
        }

        // 随机射击
        if (Math.random() < 0.02) {
            return this.shoot();
        }
        return null;
    }
}
