/**
 * 绘图渲染辅助
 */
const SpriteRenderer = {
    drawTank(ctx, x, y, direction, color, isPlayer, isElite = false) {
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

        // 核心优化：如果是精英怪，增加蓝色外发光效果
        if (isElite) {
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#00BFFF'; // 深天蓝发光
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;
        }

        // 履带 (精英怪和普通怪颜色保持一致，均为 #333)
        ctx.fillStyle = '#333';
        const trackWidth = isElite ? 10 : 8;
        ctx.fillRect(-s/2 + p, -s/2 + p, trackWidth, s - p*2);
        ctx.fillRect(s/2 - p - trackWidth, -s/2 + p, trackWidth, s - p*2);

        // 车身
        // 核心修复：强制精英怪车身为蓝色，防止颜色同步或初始化问题导致显示为红色
        ctx.fillStyle = isElite ? '#0000FF' : color; 
        ctx.fillRect(-s/2 + p + 6, -s/2 + p + 4, s - (p+6)*2, s - (p+4)*2);
        
        // 精英怪的装饰：银色装甲片
        if (isElite) {
            ctx.fillStyle = '#bdc3c7';
            ctx.fillRect(-s/2 + p + 8, -s/2 + p + 6, 4, 4);
            ctx.fillRect(s/2 - p - 12, -s/2 + p + 6, 4, 4);
            ctx.fillRect(-s/2 + p + 8, s/2 - p - 10, 4, 4);
            ctx.fillRect(s/2 - p - 12, s/2 - p - 10, 4, 4);
        }

        // 炮塔
        // 精英怪炮塔主体蓝色，中心亮色
        ctx.fillStyle = isPlayer ? '#d4ac0d' : (isElite ? '#1a237e' : '#c0392b');
        if (isElite) {
            // 精英怪炮塔呈菱形，更显科幻
            ctx.beginPath();
            ctx.moveTo(0, -12);
            ctx.lineTo(12, 0);
            ctx.lineTo(0, 12);
            ctx.lineTo(-12, 0);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#00BFFF';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // 炮塔中心的能量核心
            ctx.fillStyle = '#00BFFF';
            ctx.beginPath();
            ctx.arc(0, 0, 4, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillRect(-6, -6, 12, 12);
        }

        // 炮管
        ctx.fillStyle = isElite ? '#00BFFF' : '#95a5a6';
        if (isElite) {
            // 精英怪：加粗的电磁炮管感
            ctx.fillRect(-4, -s/2 - 2, 8, s/2 + 2);
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(-2, -s/2, 4, s/2 - 4);
        } else {
            ctx.fillRect(-2, -s/2 + 2, 4, s/2);
        }

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

    drawExplosion(ctx, x, y, frame, isSmall = false, type = 'normal', dir = 0) {
        if (type === 'laser') {
            this.drawLaserEffect(ctx, x, y, dir, frame);
            return;
        }
        const maxRadius = isSmall ? 10 : 25;
        const currentRadius = (frame / (isSmall ? 10 : 20)) * maxRadius;
        
        ctx.beginPath();
        ctx.arc(x, y, currentRadius, 0, Math.PI * 2);
        const alpha = 1 - frame / (isSmall ? 10 : 20);
        ctx.fillStyle = `rgba(255, ${200 - frame * 5}, 0, ${alpha})`;
        ctx.fill();
    },

    /**
     * 绘制激光射线特效
     */
    drawLaserEffect(ctx, x, y, dir, frame) {
        ctx.save();
        const alpha = 1 - frame / 15;
        ctx.strokeStyle = `rgba(0, 255, 255, ${alpha})`;
        ctx.lineWidth = 4;
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00ffff';

        ctx.beginPath();
        ctx.moveTo(x, y);
        
        // 根据方向绘制延伸到屏幕边缘的线
        if (dir === CONFIG.DIRECTIONS.UP) ctx.lineTo(x, 0);
        else if (dir === CONFIG.DIRECTIONS.DOWN) ctx.lineTo(x, CONFIG.HEIGHT);
        else if (dir === CONFIG.DIRECTIONS.LEFT) ctx.lineTo(0, y);
        else if (dir === CONFIG.DIRECTIONS.RIGHT) ctx.lineTo(CONFIG.WIDTH, y);
        
        ctx.stroke();

        // 绘制中心白光
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        ctx.restore();
    },

    /**
     * 绘制道具
     */
    drawPowerup(ctx, x, y, type) {
        const s = CONFIG.TILE_SIZE;
        ctx.save();
        
        // 绘制背景框 (兼容性处理：使用 fillRect 代替 roundRect)
        ctx.fillStyle = CONFIG.COLORS.POWERUP;
        ctx.fillRect(x + 2, y + 2, s - 4, s - 4);
        
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 2, y + 2, s - 4, s - 4);

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
            case CONFIG.POWERUP_TYPES.SHOVEL: icon = '🧱'; break; // 改为砖块，表示加固
            case CONFIG.POWERUP_TYPES.REPAIR: icon = '🔧'; break; // 扳手，表示修复
            case CONFIG.POWERUP_TYPES.SHIELD: icon = '💎'; break; // 宝石作为护盾
            case CONFIG.POWERUP_TYPES.LASER: icon = '⚡'; break;  // 闪电表示激光
        }
        ctx.fillText(icon, x + s/2, y + s/2);
        
        ctx.restore();
    },

    /**
     * 绘制护盾光圈
     */
    drawShield(ctx, x, y) {
        const s = CONFIG.TILE_SIZE;
        const centerX = x + s / 2;
        const centerY = y + s / 2;
        const radius = s / 2 + 5;

        ctx.save();
        
        // 创建呼吸效果
        const time = Date.now() / 200;
        const pulse = Math.sin(time) * 3;
        
        // 外圈光晕
        const grad = ctx.createRadialGradient(centerX, centerY, radius - 5, centerX, centerY, radius + pulse);
        grad.addColorStop(0, 'rgba(0, 191, 255, 0)');
        grad.addColorStop(0.5, 'rgba(0, 191, 255, 0.3)');
        grad.addColorStop(1, 'rgba(0, 191, 255, 0.6)');
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius + pulse, 0, Math.PI * 2);
        ctx.fill();

        // 细边线
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]); // 虚线效果
        ctx.lineDashOffset = -time * 10; // 旋转动画
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
    }
};
