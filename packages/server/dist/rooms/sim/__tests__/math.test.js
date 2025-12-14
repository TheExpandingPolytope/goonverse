import test from "node:test";
import assert from "node:assert/strict";
import { massToRadius, movementAngleRad, playerSpeedFromMass } from "../math.js";
test("massToRadius follows ceil(sqrt(100 * mass))", () => {
    assert.equal(massToRadius(1), 10);
    assert.equal(massToRadius(2), 15);
    assert.equal(massToRadius(10), 32);
});
test("movementAngleRad matches atan2(dx, dy) convention", () => {
    const a0 = movementAngleRad(0, 1);
    assert.ok(Number.isFinite(a0));
    assert.equal(a0, 0);
    const a1 = movementAngleRad(1, 0);
    assert.ok(a1 > 1.4 && a1 < 1.8); // ~pi/2
});
test("playerSpeedFromMass decreases with mass", () => {
    const small = playerSpeedFromMass(10);
    const big = playerSpeedFromMass(1000);
    assert.ok(small > big);
});
