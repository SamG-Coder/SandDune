import test from "node:test";
import assert from "node:assert/strict";
import { SandSimulation } from "../src/terrain.js";
import {
  createFishState,
  fishHabitat,
  advanceFish,
  sampleWater,
} from "../src/fish-habitat.js";
const pool = () => {
  const s = new SandSimulation(81, 20, () => 0);
  s.water.fill(4);
  s.hasWater = true;
  return s;
};

test("fish placement requires enough water for the body and fins, inside the glass", () => {
  const s = pool();
  assert.ok(createFishState(s, 0, 0));
  assert.equal(createFishState(s, 9, 0), null);
  s.water.fill(0.4);
  assert.equal(createFishState(s, 0, 0), null);
  s.water.fill(0);
  assert.equal(createFishState(s, 0, 0), null);
  assert.equal(fishHabitat(s, NaN, 0), null);
});
test("fish cannot swim across a narrow dry barrier into a disconnected pool", () => {
  const s = pool();
  for (let z = 0; z < 81; z++) s.water[z * 81 + 40] = 0;
  const f = createFishState(s, -4, 0);
  assert.ok(f);
  f.heading = 0;
  for (let i = 0; i < 1200; i++) {
    advanceFish(s, f, 1 / 30, i / 30);
    assert.ok(f.x < 0);
    assert.ok(fishHabitat(s, f.x, f.z));
    const h = fishHabitat(s, f.x, f.z);
    assert.ok(f.y >= h.floor && f.y <= h.ceiling);
  }
});
test("fish detect small dry pockets under their footprint", () => {
  const s = pool();
  s.water[42 * 81 + 43] = 0;
  assert.equal(fishHabitat(s, 0, 0), null);
});
test("fish stop swimming when water disappears and resume only when it is deep again", () => {
  const s = pool(),
    f = createFishState(s, 0, 0);
  advanceFish(s, f, 0.1, 1);
  const x = f.x,
    z = f.z;
  s.water.fill(0);
  advanceFish(s, f, 0.1, 2);
  assert.equal(f.swimming, false);
  assert.equal(f.x, x);
  assert.equal(f.z, z);
  s.water.fill(0.2);
  advanceFish(s, f, 0.1, 3);
  assert.equal(f.swimming, false);
  s.water.fill(4);
  advanceFish(s, f, 0.1, 4);
  assert.equal(f.swimming, true);
  assert.ok(fishHabitat(s, f.x, f.z));
});
test("water sampling handles the exact boundary without wrapping", () => {
  const s = pool();
  assert.equal(sampleWater(s, 10, 10), 4);
  assert.equal(sampleWater(s, 10.01, 0), 0);
});
