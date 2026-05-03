/**
 * 道具类
 */
class Powerup {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.active = true;
        this.timer = 0;
        this.duration = 60000; // 增加到60秒，方便测试
    }

    update(dt) {
        this.timer += dt;
        if (this.timer > this.duration) {
            this.active = false;
        }
    }

    draw(ctx) {
        if (!this.active) return;
        SpriteRenderer.drawPowerup(ctx, this.x, this.y, this.type);
    }

    getRect() {
        return {
            x: this.x,
            y: this.y,
            width: CONFIG.TILE_SIZE,
            height: CONFIG.TILE_SIZE
        };
    }
}
