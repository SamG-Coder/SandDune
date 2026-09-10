import test from "node:test";
import assert from "node:assert/strict";
import {
  SandSimulation,
  terrainHeight,
  windVector,
  chooseAdaptiveQuality,
} from "../src/terrain.js";
const flat = () => new SandSimulation(65, 32, () => 0);
const maximumSlope = (s) => {
  let max = 0;
  const n = s.resolution;
  for (let z = 2; z < n - 3; z++)
    for (let x = 2; x < n - 3; x++) {
      const i = z * n + x;
      max = Math.max(
        max,
        Math.abs(s.height[i] - s.height[i + 1]) / s.cell,
        Math.abs(s.height[i] - s.height[i + n]) / s.cell,
      );
    }
  return max;
};
test("digging displaces sand into a rim without destroying volume", () => {
  const s = flat(),
    v = s.volume();
  s.brush(0, 0, 2.5, 2, "dig");
  assert.ok(s.sample(0, 0) < -1.9);
  assert.ok(s.sample(3, 0) > 0);
  assert.ok(Math.abs(s.volume() - v) < 1e-4);
});
test("pouring adds material and a steep pile settles to its angle of repose", () => {
  const s = flat();
  s.brush(0, 0, 2, 12, "pour");
  const peak = s.sample(0, 0),
    volume = s.volume();
  assert.ok(maximumSlope(s) > 2);
  for (let i = 0; i < 1200; i++) s.step(1 / 30, 0, 0);
  assert.ok(s.sample(0, 0) < peak * 0.6);
  assert.ok(maximumSlope(s) < 0.64);
  assert.ok(Math.abs(s.volume() - volume) < 0.003);
});
test("sand at rest below the repose threshold stays still without wind", () => {
  const s = flat();
  s.brush(0, 0, 4, 0.5, "pour");
  const before = s.height.slice();
  for (let i = 0; i < 120; i++) s.step(1 / 30, 0, 0);
  assert.deepEqual(s.height, before);
});
test("wind translates deposited material downwind, reversing when wind reverses", () => {
  for (const direction of [0, 180]) {
    const background = flat(),
      pile = flat();
    pile.brush(0, 0, 3, 1, "pour");
    const volume = pile.volume();
    for (let i = 0; i < 600; i++) {
      background.step(1 / 30, 30, direction);
      pile.step(1 / 30, 30, direction);
    }
    let mass = 0,
      moment = 0;
    for (let z = 2; z < 63; z++)
      for (let x = 2; x < 63; x++) {
        const i = z * 65 + x,
          d = pile.height[i] - background.height[i];
        mass += d;
        moment += d * (x * pile.cell - 16);
      }
    assert.ok(
      (moment / mass) * (direction === 0 ? 1 : -1) > 0.2,
      `centroid ${moment / mass}`,
    );
    assert.ok(Math.abs(pile.volume() - volume) < 0.005);
  }
});
test("wind and avalanches conserve total sand over sustained simulation", () => {
  const s = flat();
  s.brush(0, 0, 3, 6, "pour");
  s.brush(-5, 2, 2, 2, "dig");
  const volume = s.volume();
  for (let i = 0; i < 900; i++) s.step(1 / 30, 40, 65);
  assert.ok(Math.abs(s.volume() - volume) < 0.005);
  assert.ok(s.height.every(Number.isFinite));
  assert.ok(s.height.every((h) => h >= s.bedrock - 1e-5));
});
test("digging cannot remove sand beneath the finite sand layer", () => {
  const s = flat(),
    volume = s.volume();
  for (let i = 0; i < 50; i++) s.brush(0, 0, 2, 2, "dig");
  assert.ok(s.sample(0, 0) >= s.bedrock);
  assert.ok(Math.abs(s.volume() - volume) < 0.005);
});
test("smoothing conserves volume and reset restores the original field", () => {
  const s = flat();
  s.brush(0, 0, 2, 4, "pour");
  const v = s.volume(),
    peak = s.sample(0, 0);
  for (let i = 0; i < 20; i++) s.brush(0, 0, 4, 0.2, "smooth");
  assert.ok(s.sample(0, 0) < peak);
  assert.ok(Math.abs(s.volume() - v) < 0.001);
  s.reset();
  assert.deepEqual(s.height, s.base);
});
test("out-of-bounds and invalid brushes leave the field untouched", () => {
  const s = flat(),
    copy = s.height.slice();
  assert.equal(s.brush(16.1, 0, 3, 1), false);
  assert.equal(s.brush(NaN, 0, 3, 1), false);
  assert.equal(s.brush(0, 0, 0, 1), false);
  assert.deepEqual(s.height, copy);
});

test("sand can be dug away directly against every wall and corner without losing volume", () => {
  for (const [x, z] of [
    [16, 0],
    [-16, 0],
    [0, 16],
    [0, -16],
    [16, 16],
    [-16, -16],
  ]) {
    const s = flat(),
      volume = s.volume();
    assert.equal(s.brush(x, z, 3, 2, "dig"), true);
    assert.ok(s.sample(x, z) < -1.9);
    assert.ok(Math.abs(s.volume() - volume) < 0.001);
    s.brush(x, z, 3, 0.2, "smooth");
    assert.ok(s.height.every(Number.isFinite));
    assert.ok(Math.abs(s.volume() - volume) < 0.001);
  }
});

test("a pile at the wall slumps inward instead of leaving an immovable rim", () => {
  const s = flat();
  s.brush(16, 0, 2.5, 10, "pour");
  const volume = s.volume(),
    peak = s.sample(16, 0),
    interior = s.sample(12, 0);
  for (let i = 0; i < 900; i++) s.step(1 / 30, 0, 0);
  assert.ok(s.sample(16, 0) < peak * 0.7);
  assert.ok(s.sample(12, 0) > interior + 0.1);
  assert.ok(Math.abs(s.volume() - volume) < 0.003);
});

test("edge volume accounts for half cells and quarter corners", () => {
  const s = flat();
  assert.equal(s.volume(), 32 * 32 * 8);
  assert.equal(s.sample(16, 0), 0);
  assert.equal(s.sample(0, 16), 0);
  assert.equal(s.sample(16, 16), 0);
  assert.equal(s.sample(16.01, 0), s.bedrock);
});
test("height sampling agrees with grid vertices and bilinear cell centres", () => {
  const s = new SandSimulation(33, 32, (x, z) => x * 0.1 + z * 0.05);
  assert.ok(Math.abs(s.sample(0, 0)) < 1e-6);
  assert.ok(Math.abs(s.sample(0.5, 0.5) - 0.075) < 1e-6);
});
test("the nonperiodic desert remains finite over the rendered world", () => {
  for (let x = -700; x <= 700; x += 23)
    for (let z = -700; z <= 700; z += 23) {
      const h = terrainHeight(x, z);
      assert.ok(Number.isFinite(h) && h > -4 && h < 90);
    }
});
test("wind vectors and adaptive rendering have bounded behaviour", () => {
  for (let a = 0; a <= 360; a++)
    assert.ok(Math.abs(Math.hypot(...windVector(a)) - 1) < 1e-12);
  assert.equal(chooseAdaptiveQuality(25, "medium"), "low");
  assert.equal(chooseAdaptiveQuality(60, "low"), "medium");
  assert.equal(chooseAdaptiveQuality(48, "medium"), "medium");
});
