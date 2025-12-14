import { OGAR_FFA_CONFIG } from "./config.js";
export function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}
export function massToRadius(mass) {
    // Ogar3: ceil(sqrt(100 * mass))
    return Math.ceil(Math.sqrt(100 * mass));
}
export function massToSquareSize(mass) {
    // Ogar3: (100 * mass) >> 0
    return Math.trunc(100 * mass);
}
export function distance(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}
export function randIntInclusive(min, max) {
    const r = Math.random();
    return Math.floor(r * (max - min + 1)) + min;
}
export function randomAngleRad() {
    return Math.random() * Math.PI * 2;
}
export function ogarPlayerSpeed(mass, tickMs = OGAR_FFA_CONFIG.tickMs) {
    // Ogar3: playerSpeed * mass^(-1/4.5) * 50/40 (with 50ms ticks)
    // Generalized: * tickMs/40.
    return OGAR_FFA_CONFIG.playerSpeed * Math.pow(mass, -1.0 / 4.5) * (tickMs / 40);
}
export function ogarAngleRad(dx, dy) {
    // Ogar3 uses atan2(deltaX, deltaY) and then applies sin(angle) to X, cos(angle) to Y.
    return Math.atan2(dx, dy);
}
export function reflectAngleHorizontal(angleRad) {
    // Ogar3 uses 6.28 - angle
    return 6.28 - angleRad;
}
export function reflectAngleVertical(angleRad) {
    // Ogar3: (angle <= 3.14) ? 3.14 - angle : 9.42 - angle
    return angleRad <= 3.14 ? 3.14 - angleRad : 9.42 - angleRad;
}
