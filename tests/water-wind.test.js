import test from "node:test";
import assert from "node:assert/strict";
import { SandSimulation } from "../src/terrain.js";

function pool(wind, direction) {
  const s = new SandSimulation(41, 20, () => 0);
  s.water.fill(1);
  s.moisture.fill(s.waterCapacity);
  s.hasWater = true;
  const volume = s.waterVolume();
  for (let i = 0; i < 180; i++) s.step(1 / 30, wind, direction);
  let x = 0,
    z = 0,
    mass = 0;
  for (let row = 0; row < 41; row++)
    for (let col = 0; col < 41; col++) {
      const i = row * 41 + col,
        w = s.water[i] * s.weights[i];
      x += (col * 0.5 - 10) * w;
      z += (row * 0.5 - 10) * w;
      mass += w;
    }
  assert.ok(
    Math.abs(s.waterVolume() - volume) < 0.001,
    "wind conserves total water",
  );
  assert.ok(
    s.water.every((v) => Number.isFinite(v) && v >= 0),
    "water remains finite and nonnegative",
  );
  return { s, x: x / mass, z: z / mass };
}

test("wind drives water downwind, scales with speed, and respects direction", () => {
  const calm = pool(0, 0),
    breeze = pool(12, 0),
    east = pool(40, 0),
    west = pool(40, 180),
    north = pool(40, 90);
  assert.ok(
    calm.s.water.every((v) => v === 1),
    "a calm level pool rests",
  );
  assert.ok(breeze.x > 0.05);
  assert.ok(east.x > breeze.x * 3);
  assert.ok(east.x > 0.8 && Math.abs(east.z) < 0.001);
  assert.ok(west.x < -0.8 && Math.abs(west.x + east.x) < 0.001);
  assert.ok(north.z > 0.8 && Math.abs(north.x) < 0.001);
});

test("wind cannot create water on a dry surface", () => {
  const s = new SandSimulation(41, 20, () => 0);
  for (let i = 0; i < 120; i++) s.stepWater(1 / 30, 40, 135);
  assert.equal(s.waterVolume(), 0);
});
