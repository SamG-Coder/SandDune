import test from 'node:test';
import assert from 'node:assert/strict';
import tokenize from 'glsl-tokenizer/string.js';
import parse from 'glsl-parser/direct.js';
import * as shaders from '../src/shaders.js';
import { terrainHeight } from '../src/terrain.js';

for (const name of ['terrainVertex', 'terrainFragment', 'skyVertex', 'skyFragment', 'particleVertex', 'particleFragment']) {
  test(`${name} has valid GLSL syntax`, () => {
    // Three.js resolves its own shader chunks at runtime. Parse the authored source.
    const source = shaders[name].replace(/^\s*#include.*$/gm, '');
    assert.equal(parse(tokenize(source)).type, 'stmtlist');
  });
}

test('GPU terrain constants and CPU camera clearance agree at representative points', () => {
  // Evaluate the scalar arithmetic from the actual GLSL height function, avoiding a
  // third hand-maintained copy of the terrain. The source is local trusted code.
  const body = shaders.terrainGLSL.match(/float terrain\(vec2 p\) \{([\s\S]*?)\n\}/)[1]
    .replace('p -= uDrift * 0.018;', 'p = { x: p.x - uDrift.x * 0.018, y: p.y - uDrift.y * 0.018 };')
    .replace(/\bfloat\b/g, 'const')
    .replace(/\b(sin|sqrt)\(/g, 'Math.$1(');
  const gpuHeight = new Function('p', 'uDrift', body);
  for (let i = 0; i < 200; i++) {
    const x = Math.sin(i * 7.13) * 950, z = Math.cos(i * 3.83) * 950;
    const dx = i * 4.1, dz = -i * 2.8;
    assert.ok(Math.abs(gpuHeight({ x, y: z }, { x: dx, y: dz }) - terrainHeight(x, z, dx, dz)) < 1e-9);
  }
});
