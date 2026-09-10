import test from "node:test";
import assert from "node:assert/strict";
import { SandSimulation } from "../src/terrain.js";
import {
  createFishState,
  createDropState,
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
  assert.ok(Math.hypot(f.x - x, f.z - z) < 0.3);
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

test("drops fall continuously, land on sand and resume swimming after flooding", () => {
  const s = pool();
  s.water.fill(0);
  const f = createDropState(s, 0, 0, 0, 0.8);
  const start = f.y;
  advanceFish(s, f, 0.1, 0);
  assert.ok(f.y < start && f.y > start - 1);
  assert.equal(f.mode, "falling");
  for (let i = 0; i < 60; i++) advanceFish(s, f, 1 / 30, i / 30);
  assert.equal(f.mode, "stranded");
  assert.equal(f.swimming, false);
  assert.ok(Math.hypot(f.x, f.z) < 2);
  s.water.fill(4);
  advanceFish(s, f, 0.1, 3);
  assert.equal(f.mode, "swimming");
  assert.ok(fishHabitat(s, f.x, f.z, f.size));
});
test("turns are bounded even when approaching dry ground", () => {
  const s = pool(),
    f = createFishState(s, 7, 0);
  f.heading = 0;
  for (let i = 0; i < 300; i++) {
    const heading = f.heading;
    advanceFish(s, f, 1 / 30, i / 30);
    assert.ok(Math.abs(f.heading - heading) <= 1.5 / 30 + 1e-9);
    assert.ok(fishHabitat(s, f.x, f.z));
  }
});
test("individual body size controls required water clearance", () => {
  const s = pool();
  s.water.fill(1.8);
  assert.ok(fishHabitat(s, 0, 0, 0.7));
  assert.equal(fishHabitat(s, 0, 0, 1.15), null);
});

test("stranded fish seek nearby water rather than stay on land", () => {
  const s = pool();
  for (let z = 0; z < 81; z++)
    for (let x = 0; x < 81; x++) s.water[z * 81 + x] = x >= 40 ? 4 : 0;
  const f = createFishState(pool(), -2, 0);
  f.heading = 0;
  for (let i = 0; i < 420; i++) advanceFish(s, f, 1 / 30, i / 30);
  assert.notEqual(f.mode, "dead");
  assert.ok(f.x > 0);
  assert.ok(f.airTime < 15);
});
test("15 seconds without water kills a fish; death fades irreversibly", () => {
  const s = pool(),
    f = createFishState(s, 0, 0);
  s.water.fill(0);
  for (let i = 0; i < 449; i++) advanceFish(s, f, 1 / 30, i / 30);
  assert.notEqual(f.mode, "dead");
  advanceFish(s, f, 1 / 30, 15);
  assert.equal(f.mode, "dead");
  s.water.fill(4);
  advanceFish(s, f, 0.1, 16);
  assert.equal(f.mode, "dead");
  assert.ok(f.fade < 1);
  for (let i = 0; i < 90; i++) advanceFish(s, f, 1 / 30, 16 + i / 30);
  assert.equal(f.fade, 0);
});
test("shallow water permits paddling and gill coverage resets the survival timer", () => {
  const s = pool(),
    f = createFishState(s, 0, 0);
  s.water.fill(0.1);
  for (let i = 0; i < 300; i++) advanceFish(s, f, 1 / 30, i / 30);
  assert.ok(f.airTime > 9);
  s.water.fill(0.8);
  const x = f.x,
    z = f.z;
  for (let i = 0; i < 300; i++) advanceFish(s, f, 1 / 30, 10 + i / 30);
  assert.equal(f.mode, "shallow");
  assert.equal(f.airTime, 0);
  assert.ok(Math.hypot(f.x - x, f.z - z) > 0.5);
});
test("cruising has forward progress, social response and bottom foraging bouts", () => {
  const s = new SandSimulation(101, 100, () => 0);
  s.water.fill(5);
  const a = createFishState(s, 0, 0),
    b = createFishState(s, 0, 5, 1);
  a.heading = 0;
  b.heading = 0;
  let foraged = false,
    shoaled = false;
  for (let i = 0; i < 900; i++) {
    advanceFish(s, a, 1 / 30, i / 30, [a, b]);
    advanceFish(s, b, 1 / 30, i / 30, [a, b]);
    foraged ||= a.behavior === "foraging";
    shoaled ||= a.social === "shoaling";
    if (i === 149) assert.ok(Math.hypot(a.x, a.z) > 3);
  }
  assert.ok(foraged);
  assert.ok(shoaled);
  assert.ok(fishHabitat(s, a.x, a.z));
});
