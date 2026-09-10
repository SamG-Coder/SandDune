// Keep this function and the GLSL height field in shaders.js mathematically identical.
// CPU evaluation is only for camera clearance; terrain animation runs on the GPU.
export function terrainHeight(x, z, driftX = 0, driftZ = 0) {
  x -= driftX * 0.018; z -= driftZ * 0.018;
  const warp = 18 * Math.sin(z * 0.013) + 10 * Math.sin(z * 0.027 + x * 0.004);
  const phase = (x + warp) * 0.027 + z * 0.008;
  const s = Math.sin(phase);
  const ridge = 1 - Math.sqrt(s * s + 0.003);
  const amplitude = 28 + 9 * Math.sin(z * 0.009 + x * 0.005);
  return ridge * ridge * amplitude + 5 * Math.sin(z * 0.019 + x * 0.011)
    + 3 * Math.sin(x * 0.008 - z * 0.013) - 8;
}

export const QUALITY = {
  low: { segments: 160, particles: 2200, pixelRatio: 1, shadows: 0 },
  medium: { segments: 256, particles: 5500, pixelRatio: 1.35, shadows: 1 },
  high: { segments: 384, particles: 11000, pixelRatio: 1.75, shadows: 1 },
};

export function chooseAdaptiveQuality(fps, current) {
  if (fps < 36) return current === 'high' ? 'medium' : 'low';
  if (fps > 57 && current === 'low') return 'medium';
  return current;
}

export function windVector(degrees) {
  const a = degrees * Math.PI / 180;
  return [Math.cos(a), Math.sin(a)];
}
