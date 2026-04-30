/**
 * 子弹类
 */
class Bullet {
    constructor(x, y, direction, owner) {
        this.x = x;
        this.y = y;
        this.direction = direction;
        this.owner = owner; // 谁发射的（'player' 或 'enemy'）
        this.speed = CONFIG.BULLET_SPEED;
        this.active = true;
        this.radius = CONFIG.BULLET_SIZE / 2;
    }

    update() {
        switch(this.direction) {
            case CONFIG.DIRECTIONS.UP: this.y -= this.speed; break;
            case CONFIG.DIRECTIONS.DOWN: this.y += this.speed; break;
            case CONFIG.DIRECTIONS.LEFT: this.x -= this.speed; break;
            case CONFIG.DIRECTIONS.RIGHT: this.x += this.speed; break;
        }

        // 边界检测
        if (this.x < 0 || this.x > CONFIG.WIDTH || this.y < 0 || this.y > CONFIG.HEIGHT) {
            this.active = false;
        }
    }

    draw(ctx) {
        SpriteRenderer.drawBullet(ctx, this.x, this.y);
    }

    getRect() {
        return {
            x: this.x - this.radius,
            y: this.y - this.radius,
            width: CONFIG.BULLET_SIZE,
            height: CONFIG.BULLET_SIZE
        };
    }
}
