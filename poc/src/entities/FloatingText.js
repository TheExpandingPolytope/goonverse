/**
 * Floating text that appears on damage/pickups
 */
export class FloatingText {
    constructor(x, y, text, color, size = 30) {
        this.x = x;
        this.y = y;
        this.text = text;
        this.color = color;
        this.size = size;
        this.life = 70;
        this.vx = (Math.random() - 0.5) * 3;
        this.vy = -4.0;
        this.scale = 0;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.15;
        this.vx *= 0.95;
        this.life--;
        if (this.scale < 1) this.scale += 0.2;
    }

    draw(ctx) {
        if (this.scale <= 0) return;
        
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(this.scale, this.scale);
        ctx.globalAlpha = Math.max(0, Math.min(1, this.life / 20));
        ctx.fillStyle = this.color;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 5;
        ctx.font = `900 ${this.size}px 'Rubik', sans-serif`;
        ctx.textAlign = 'center';
        ctx.strokeText(this.text, 0, 0);
        ctx.fillText(this.text, 0, 0);
        ctx.restore();
    }
}
