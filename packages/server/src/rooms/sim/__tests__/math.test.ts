import test from "node:test";
import assert from "node:assert/strict";
import { massToRadius, mobilityMultiplier } from "../math.js";

test("massToRadius increases with mass", () => {
  const r1 = massToRadius(100, 100);
  const r2 = massToRadius(500, 100);
  assert.ok(r2 >= r1);
});

test("mobilityMultiplier is bounded", () => {
  const small = mobilityMultiplier(20);
  const big = mobilityMultiplier(120);
  assert.ok(Number.isFinite(small));
  assert.ok(Number.isFinite(big));
  assert.ok(small >= big);
});


