/**
 * Static obstacle in the game world
 * Soft pastel colors with thick cartoon borders
 */
import { OBSTACLE_COLORS } from '../config.js';

export class Obstacle {
    constructor(x, y, radius) {
        this.x = x;
        this.y = y;
        this.radius = radius;

        // Discrete shape set (not random N-gons)
        const shapes = ['circle', 'triangle', 'square', 'pentagon', 'hexagon', 'octagon'];
        this.shape = shapes[Math.floor(Math.random() * shapes.length)];
        this.sides =
            this.shape === 'triangle' ? 3 :
            this.shape === 'square' ? 4 :
            this.shape === 'pentagon' ? 5 :
            this.shape === 'hexagon' ? 6 :
            this.shape === 'octagon' ? 8 :
            0;

        // For squares, define dimensions so the drawn shape fits within collision radius
        this.rectW = 0;
        this.rectH = 0;
        if (this.shape === 'square') {
            // side chosen so half-diagonal ~= radius
            const side = this.radius * 1.4;
            this.rectW = side;
            this.rectH = side;
        }

        this.angle = Math.random() * Math.PI * 2;
        this.spin = (Math.random() - 0.5) * 0.006; // Gentle spin
        
        // Random color from palette
        const colorIndex = Math.floor(Math.random() * OBSTACLE_COLORS.length);
        this.fillColor = OBSTACLE_COLORS[colorIndex].fill;
        this.borderColor = OBSTACLE_COLORS[colorIndex].border;
    }

    /**
     * Tick-based update (rotation)
     */
    tick() {
        this.angle += this.spin;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        // Shape path
        ctx.beginPath();
        if (this.shape === 'circle') {
            ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        } else if (this.shape === 'square') {
            ctx.rect(-this.rectW / 2, -this.rectH / 2, this.rectW, this.rectH);
        } else {
            // Regular polygon
            // Offset squares to look like a square (flat top) when chosen via polygon path
            const offset = this.shape === 'square' ? Math.PI / 4 : 0;
            const rr = this.radius * 0.95;
            for (let i = 0; i < this.sides; i++) {
                const theta = offset + (i / this.sides) * Math.PI * 2;
                const px = Math.cos(theta) * rr;
                const py = Math.sin(theta) * rr;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
        }
        
        // Main fill + single soft cartoon outline
        ctx.fillStyle = this.fillColor;
        ctx.fill();
        ctx.strokeStyle = this.borderColor;
        ctx.lineWidth = 7;
        ctx.lineJoin = 'round';
        ctx.stroke();

        ctx.restore();
    }
}
