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
        this.isElite = false; // 显式初始化精英怪标识
        this.isBoss = false;  // BOSS 标识
        this.isShielded = false; // 护盾状态
        this.laserCount = 0; // 激光子弹剩余数量
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
        SpriteRenderer.drawTank(ctx, this.x, this.y, this.direction, this.color, this instanceof PlayerTank, this.isElite, this.isBoss);
        
        // 绘制护盾光圈
        if (this.isShielded) {
            SpriteRenderer.drawShield(ctx, this.x, this.y);
        }
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
            
            // 如果有激光次数，发射激光
            if (this.laserCount > 0) {
                this.laserCount--;
                const bullet = new Bullet(bx, by, this.direction, this instanceof PlayerTank ? 'player' : 'enemy');
                bullet.isLaser = true;
                bullet.damage = 3;
                return bullet;
            }
            
            if (this.isBoss) {
                const b = new Bullet(bx, by, this.direction, 'enemy');
                b.isBoss = true;
                b.damage = 2;
                return b;
            }
            
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
            const otherRect = tank.getRect();
            if (this._checkRectCollision(rect, otherRect)) {
                // 如果当前位置已经和对方重叠了，允许移动（为了让卡住的坦克能走出来）
                const currentRect = { x: this.x + 2, y: this.y + 2, width: CONFIG.TILE_SIZE - 4, height: CONFIG.TILE_SIZE - 4 };
                if (this._checkRectCollision(currentRect, otherRect)) {
                    // 如果移动后重叠面积变小了，或者不再重叠，就允许移动
                    // 这里简化处理：如果是为了脱困，允许移动
                    continue; 
                }
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
    constructor(x, y, id = null) {
        super(x, y, CONFIG.DIRECTIONS.UP, CONFIG.COLORS.PLAYER);
        this.speed = CONFIG.PLAYER_SPEED;
        this.id = id; // 网络对战时的唯一标识
    }
}

/**
 * 远程玩家坦克 (网络对战)
 */
class RemoteTank extends Tank {
    constructor(x, y, direction, color, id) {
        super(x, y, direction, color);
        this.id = id;
        this.speed = CONFIG.PLAYER_SPEED;
    }

    updateState(data) {
        this.x = data.x;
        this.y = data.y;
        this.direction = data.direction;
        if (data.hp !== undefined) {
            this.hp = data.hp;
            this.active = this.hp > 0;
        }
        if (data.isShielded !== undefined) {
            this.isShielded = data.isShielded;
        }
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

/**
 * 子弹类
 */
class Bullet {
    constructor(x, y, direction, owner) {
        this.x = x;
        this.y = y;
        this.direction = direction;
        this.owner = owner; // 'player' or 'enemy'
        this.speed = CONFIG.BULLET_SPEED;
        this.active = true;
        this.isElite = false; // 精英怪子弹
        this.isBoss = false;  // BOSS 子弹
        this.isLaser = false; // 激光子弹
        this.damage = 1;      // 默认伤害
    }

    update() {
        if (this.isLaser) {
            // 激光是瞬发的，逻辑在 game.js 处理，这里直接设为失效
            this.active = false;
            return;
        }
        let currentSpeed = this.speed;
        if (this.isBoss) currentSpeed *= 1.2; // BOSS 子弹稍微快一点
        
        switch(this.direction) {
            case CONFIG.DIRECTIONS.UP: this.y -= currentSpeed; break;
            case CONFIG.DIRECTIONS.DOWN: this.y += currentSpeed; break;
            case CONFIG.DIRECTIONS.LEFT: this.x -= currentSpeed; break;
            case CONFIG.DIRECTIONS.RIGHT: this.x += currentSpeed; break;
        }
        
        if (this.x < 0 || this.x > CONFIG.WIDTH || this.y < 0 || this.y > CONFIG.HEIGHT) {
            this.active = false;
        }
    }

    getRect() {
        return {
            x: this.x - CONFIG.BULLET_SIZE / 2,
            y: this.y - CONFIG.BULLET_SIZE / 2,
            width: CONFIG.BULLET_SIZE,
            height: CONFIG.BULLET_SIZE
        };
    }

    draw(ctx) {
        if (!this.active || this.isLaser) return;
        if (this.isBoss) {
            ctx.fillStyle = CONFIG.COLORS.BULLET_BOSS;
        } else {
            ctx.fillStyle = CONFIG.COLORS.BULLET;
        }
        ctx.beginPath();
        ctx.arc(this.x, this.y, (this.isBoss ? CONFIG.BULLET_SIZE * 1.5 : CONFIG.BULLET_SIZE) / 2, 0, Math.PI * 2);
        ctx.fill();
        
        if (this.isBoss) {
            // BOSS 子弹发光效果
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#FF0000';
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
    }
}
