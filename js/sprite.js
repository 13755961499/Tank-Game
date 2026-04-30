/**
 * 绘图渲染辅助
 */
const SpriteRenderer = {
    drawTank(ctx, x, y, direction, color, isPlayer) {
        ctx.save();
        ctx.translate(x + CONFIG.TILE_SIZE / 2, y + CONFIG.TILE_SIZE / 2);
        
        switch(direction) {
            case CONFIG.DIRECTIONS.UP: break;
            case CONFIG.DIRECTIONS.DOWN: ctx.rotate(Math.PI); break;
            case CONFIG.DIRECTIONS.LEFT: ctx.rotate(-Math.PI / 2); break;
            case CONFIG.DIRECTIONS.RIGHT: ctx.rotate(Math.PI / 2); break;
        }

        const s = CONFIG.TILE_SIZE;
        const p = 4;

        // 履带
        ctx.fillStyle = '#333';
        ctx.fillRect(-s/2 + p, -s/2 + p, 8, s - p*2);
        ctx.fillRect(s/2 - p - 8, -s/2 + p, 8, s - p*2);

        // 车身
        ctx.fillStyle = color;
        ctx.fillRect(-s/2 + p + 6, -s/2 + p + 4, s - (p+6)*2, s - (p+4)*2);

        // 炮塔
        ctx.fillStyle = isPlayer ? '#d4ac0d' : '#c0392b';
        ctx.fillRect(-6, -6, 12, 12);

        // 炮管
        ctx.fillStyle = '#95a5a6';
        ctx.fillRect(-2, -s/2 + 2, 4, s/2);

        ctx.restore();
    },

    drawBullet(ctx, x, y) {
        ctx.fillStyle = CONFIG.COLORS.BULLET;
        ctx.beginPath();
        ctx.arc(x, y, CONFIG.BULLET_SIZE / 2, 0, Math.PI * 2);
        ctx.fill();
    },

    drawTile(ctx, type, x, y) {
        const s = CONFIG.TILE_SIZE;
        ctx.save();
        switch(type) {
            case CONFIG.TILE_TYPES.BRICK:
                ctx.fillStyle = CONFIG.COLORS.BRICK;
                ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
                ctx.strokeStyle = '#5d4037';
                ctx.strokeRect(x + 2, y + 2, s - 4, s - 4);
                break;
            case CONFIG.TILE_TYPES.STEEL:
                ctx.fillStyle = CONFIG.COLORS.STEEL;
                ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
                ctx.strokeStyle = '#7f8c8d';
                ctx.strokeRect(x + 4, y + 4, s - 8, s - 8);
                break;
            case CONFIG.TILE_TYPES.GRASS:
                ctx.fillStyle = CONFIG.COLORS.GRASS;
                ctx.fillRect(x, y, s, s);
                // 绘制草丛纹理
                ctx.strokeStyle = '#27ae60';
                ctx.lineWidth = 1;
                for (let i = 0; i < 4; i++) {
                    const ox = (i % 2) * (s/2);
                    const oy = Math.floor(i / 2) * (s/2);
                    ctx.beginPath();
                    ctx.moveTo(x + ox + 4, y + oy + s/2 - 4);
                    ctx.lineTo(x + ox + s/4, y + oy + 4);
                    ctx.lineTo(x + ox + s/2 - 4, y + oy + s/2 - 4);
                    ctx.stroke();
                }
                break;
            case CONFIG.TILE_TYPES.WATER:
                ctx.fillStyle = CONFIG.COLORS.WATER;
                ctx.fillRect(x, y, s, s);
                // 绘制波纹纹理
                ctx.strokeStyle = '#ebf5fb';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x + 5, y + s/3);
                ctx.lineTo(x + s - 5, y + s/3);
                ctx.moveTo(x + 10, y + (s*2)/3);
                ctx.lineTo(x + s - 10, y + (s*2)/3);
                ctx.stroke();
                break;
            case CONFIG.TILE_TYPES.BASE:
                ctx.fillStyle = CONFIG.COLORS.BASE;
                ctx.beginPath();
                ctx.moveTo(x + s/2, y + 5);
                ctx.lineTo(x + 5, y + s - 5);
                ctx.lineTo(x + s - 5, y + s - 5);
                ctx.closePath();
                ctx.fill();
                break;
        }
        ctx.restore();
    },

    drawExplosion(ctx, x, y, frame, isSmall = false) {
        const maxRadius = isSmall ? 10 : 25;
        const currentRadius = (frame / (isSmall ? 10 : 20)) * maxRadius;
        
        ctx.beginPath();
        ctx.arc(x, y, currentRadius, 0, Math.PI * 2);
        const alpha = 1 - frame / (isSmall ? 10 : 20);
        ctx.fillStyle = `rgba(255, ${200 - frame * 5}, 0, ${alpha})`;
        ctx.fill();
    },

    /**
     * 绘制道具
     */
    drawPowerup(ctx, x, y, type) {
        const s = CONFIG.TILE_SIZE;
        ctx.save();
        
        // 绘制背景框
        ctx.fillStyle = CONFIG.COLORS.POWERUP;
        ctx.beginPath();
        ctx.roundRect(x + 2, y + 2, s - 4, s - 4, 4);
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 绘制图标内容
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 20px Arial';

        let icon = '?';
        switch(type) {
            case CONFIG.POWERUP_TYPES.LIFE: icon = '❤'; break;
            case CONFIG.POWERUP_TYPES.BOMB: icon = '💣'; break;
            case CONFIG.POWERUP_TYPES.STAR: icon = '⭐'; break;
            case CONFIG.POWERUP_TYPES.SHOVEL: icon = '🛡'; break;
        }
        ctx.fillText(icon, x + s/2, y + s/2);
        
        ctx.restore();
    }
};
