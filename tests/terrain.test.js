import test from 'node:test';
import assert from 'node:assert/strict';
import { terrainHeight, chooseAdaptiveQuality, windVector, QUALITY } from '../src/terrain.js';

test('the complete rendered terrain stays finite and inside its conservative bounds', () => {
  for (const drift of [0, 100, 10000]) {
    for (let x = -950; x <= 950; x += 19) {
      for (let z = -950; z <= 950; z += 19) {
        const height = terrainHeight(x, z, drift, -drift);
        assert.ok(Number.isFinite(height) && height > -20 && height < 40, `Invalid height at ${x},${z}: ${height}`);
      }
    }
  }
});

test('wind drift translates the landform without changing its shape', () => {
  for (const [x, z] of [[0, 0], [120, -50], [-435, 234]]) {
    assert.ok(Math.abs(terrainHeight(x, z, 250, -110) - terrainHeight(x - 4.5, z + 1.98)) < 1e-10);
  }
});

test('camera clearance field has no height discontinuities at dune crests', () => {
  for (let x = -200; x < 200; x += 0.2) {
    assert.ok(Math.abs(terrainHeight(x + 0.001, 37) - terrainHeight(x, 37)) < 0.005);
  }
});

test('wind direction wraps continuously and keeps speed constant', () => {
  for (let degrees = 0; degrees <= 360; degrees++) {
    const [x, z] = windVector(degrees);
    assert.ok(Math.abs(Math.hypot(x, z) - 1) < 1e-12);
  }
  assert.ok(Math.abs(windVector(0)[0] - windVector(360)[0]) < 1e-12);
  assert.ok(Math.abs(windVector(90)[0]) < 1e-12);
  assert.equal(windVector(90)[1], 1);
});

test('adaptive quality steps down under load and avoids oscillating near thresholds', () => {
  assert.equal(chooseAdaptiveQuality(24, 'high'), 'medium');
  assert.equal(chooseAdaptiveQuality(24, 'medium'), 'low');
  assert.equal(chooseAdaptiveQuality(24, 'low'), 'low');
  assert.equal(chooseAdaptiveQuality(48, 'low'), 'low');
  assert.equal(chooseAdaptiveQuality(48, 'medium'), 'medium');
  assert.equal(chooseAdaptiveQuality(60, 'low'), 'medium');
  assert.equal(chooseAdaptiveQuality(60, 'medium'), 'medium');
  assert.ok(QUALITY.low.particles < QUALITY.medium.particles && QUALITY.medium.particles < QUALITY.high.particles);
});
