import { FFA_CONFIG } from "./config.js";
export function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}
export function massToRadius(mass) {
    // Reference formula: ceil(sqrt(100 * mass))
    return Math.ceil(Math.sqrt(100 * mass));
}
export function massToSquareSize(mass) {
    // Reference formula: trunc(100 * mass)
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
export function playerSpeedFromMass(mass, tickMs = FFA_CONFIG.tickMs) {
    // playerSpeed * mass^(-1/4.5) * tickMs/40
    return FFA_CONFIG.playerSpeed * Math.pow(mass, -1.0 / 4.5) * (tickMs / 40);
}
export function movementAngleRad(dx, dy) {
    // We use atan2(dx, dy) and then apply sin(angle) to X, cos(angle) to Y.
    return Math.atan2(dx, dy);
}
export function reflectAngleHorizontal(angleRad) {
    // Horizontal reflection used by move-engine border bounce
    return 6.28 - angleRad;
}
export function reflectAngleVertical(angleRad) {
    // Vertical reflection used by move-engine border bounce
    return angleRad <= 3.14 ? 3.14 - angleRad : 9.42 - angleRad;
}
