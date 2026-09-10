import test from "node:test";
import assert from "node:assert/strict";
import { SandSimulation } from "../src/terrain.js";
const flat = () => new SandSimulation(41, 20, () => 0);
test("water brush adds water without creating or removing sand", () => {
  const s = flat(),
    v = s.volume();
  s.brush(0, 0, 3, 1, "water");
  assert.equal(s.volume(), v);
  assert.ok(s.waterVolume() > 0);
  assert.ok(s.hasWater);
});
test("water spreads before absorption, leaving damp sand and thin puddles", () => {
  const s = flat();
  s.brush(0, 0, 3, 4, "water");
  const volume = s.waterVolume();
  for (let i = 0; i < 90; i++) s.step(1 / 30, 0, 0);
  const center = 20 * 41 + 20;
  assert.ok(s.moisture[center] > 0.05);
  assert.ok(s.water.some((v) => v > 0.05));
  assert.ok(Math.max(...s.water) < 0.2);
  assert.ok(s.moisture[20 * 41 + 30] > 0);
  assert.ok(Math.abs(s.waterVolume() - volume) < 0.003);
});
test("water flows downhill while water and sediment mass are conserved", () => {
  const s = new SandSimulation(41, 20, (x) => x * 0.15);
  s.brush(4, 0, 2, 3, "water");
  const water = s.waterVolume(),
    sand = s.volume();
  for (let i = 0; i < 180; i++) s.step(1 / 30, 0, 0);
  let moment = 0,
    mass = 0;
  for (let z = 0; z < 41; z++)
    for (let x = 0; x < 41; x++) {
      const i = z * 41 + x,
        v = (s.water[i] + s.moisture[i]) * s.weights[i];
      moment += v * (x * 0.5 - 10);
      mass += v;
    }
  assert.ok(moment / mass < 3.9);
  assert.ok(Math.abs(s.waterVolume() - water) < 0.004);
  assert.ok(Math.abs(s.volume() - sand) < 0.004);
  assert.ok(s.water.every((v) => Number.isFinite(v) && v >= 0));
  assert.ok(
    s.moisture.every((v) => Number.isFinite(v) && v >= 0 && v <= 0.551),
  );
});
test("partly wet sand holds a slope that dry sand cannot hold", () => {
  const dry = flat(),
    wet = flat();
  for (const s of [dry, wet]) s.brush(0, 0, 3, 2, "pour");
  wet.moisture.fill(wet.waterCapacity * 0.45);
  wet.hasWater = true;
  for (let i = 0; i < 180; i++) {
    dry.step(1 / 30, 0, 0);
    wet.step(1 / 30, 0, 0);
  }
  assert.ok(wet.sample(0, 0) > dry.sample(0, 0) + 0.03);
});
test("saturated sand relaxes into a flatter muddy surface than damp sand", () => {
  const damp = flat(),
    mud = flat();
  for (const s of [damp, mud]) {
    s.brush(0, 0, 3, 2, "pour");
    s.hasWater = true;
  }
  damp.moisture.fill(damp.waterCapacity * 0.45);
  mud.moisture.fill(mud.waterCapacity);
  for (let i = 0; i < 300; i++) {
    damp.step(1 / 30, 0, 0);
    mud.step(1 / 30, 0, 0);
  }
  assert.ok(mud.sample(0, 0) < damp.sample(0, 0) - 0.1);
});
test("water is conserved at a glass corner and reset clears both water stores", () => {
  const s = flat();
  s.brush(10, 10, 3, 4, "water");
  const volume = s.waterVolume();
  for (let i = 0; i < 240; i++) s.step(1 / 30, 35, 65);
  assert.ok(Math.abs(s.waterVolume() - volume) < 0.003);
  s.reset();
  assert.equal(s.waterVolume(), 0);
  assert.equal(s.hasWater, false);
  assert.ok(s.moisture.every((v) => v === 0));
});
