// Fish collisions use the live simulated liquid depth, never the decorative waves.
export const FISH_RADIUS = 1.7;
export const FISH_HALF_HEIGHT = 0.78;
const footprintCache = new WeakMap();
function footprint(s) {
  if (footprintCache.has(s)) return footprintCache.get(s);
  const points = [],
    step = Math.min(0.35, s.cell * 0.5);
  for (let z = -FISH_RADIUS; z <= FISH_RADIUS; z += step)
    for (let x = -FISH_RADIUS; x <= FISH_RADIUS; x += step)
      if (x * x + z * z <= FISH_RADIUS * FISH_RADIUS) points.push([x, z]);
  for (let k = 0; k < 32; k++)
    points.push([
      Math.cos((k * Math.PI) / 16) * FISH_RADIUS,
      Math.sin((k * Math.PI) / 16) * FISH_RADIUS,
    ]);
  footprintCache.set(s, points);
  return points;
}
export function sampleWater(s, x, z) {
  const half = s.size / 2;
  if (Math.abs(x) > half || Math.abs(z) > half) return 0;
  const n = s.resolution,
    gx = (x + half) / s.cell,
    gz = (z + half) / s.cell;
  const ix = Math.min(n - 2, Math.floor(gx)),
    iz = Math.min(n - 2, Math.floor(gz));
  const fx = gx - ix,
    fz = gz - iz,
    i = iz * n + ix;
  return (
    (s.water[i] * (1 - fx) + s.water[i + 1] * fx) * (1 - fz) +
    (s.water[i + n] * (1 - fx) + s.water[i + n + 1] * fx) * fz
  );
}
export function fishHabitat(s, x, z) {
  if (!Number.isFinite(x + z)) return null;
  let floor = -Infinity,
    ceiling = Infinity;
  // Include body interior and the entire fin envelope, not just the centre.
  for (const [dx, dz] of footprint(s)) {
    const px = x + dx,
      pz = z + dz;
    const d = sampleWater(s, px, pz);
    if (d < 2 * FISH_HALF_HEIGHT + 0.4) return null;
    const bed = s.sample(px, pz);
    floor = Math.max(floor, bed + FISH_HALF_HEIGHT + 0.2);
    ceiling = Math.min(ceiling, bed + d - FISH_HALF_HEIGHT - 0.2);
  }
  return floor <= ceiling ? { floor, ceiling } : null;
}
export function createFishState(s, x, z, id = 0) {
  const habitat = fishHabitat(s, x, z);
  if (!habitat) return null;
  return {
    x,
    z,
    y: (habitat.floor + habitat.ceiling) / 2,
    heading: id * 2.399,
    phase: id * 1.7,
    swimming: true,
  };
}
export function advanceFish(s, fish, dt, time) {
  const here = fishHabitat(s, fish.x, fish.z);
  if (!here) {
    fish.swimming = false;
    fish.y = s.sample(fish.x, fish.z) + 0.3;
    return;
  }
  fish.swimming = true;
  const steps = Math.max(1, Math.ceil((dt * 1.5) / 0.15)),
    step = Math.min(dt, 0.25) / steps;
  for (let n = 0; n < steps; n++) {
    const intended =
      fish.heading + Math.sin(time * 0.65 + fish.phase) * step * 0.45;
    let moved = false;
    for (const turn of [0, 0.35, -0.35, 0.75, -0.75, 1.3, -1.3, Math.PI]) {
      const angle = intended + turn,
        x = fish.x + Math.cos(angle) * step * 1.5,
        z = fish.z + Math.sin(angle) * step * 1.5;
      if (fishHabitat(s, x, z)) {
        fish.x = x;
        fish.z = z;
        fish.heading = angle;
        moved = true;
        break;
      }
    }
    if (!moved) break;
  }
  const habitat = fishHabitat(s, fish.x, fish.z);
  const target =
    (habitat.floor + habitat.ceiling) / 2 +
    Math.sin(time * 0.7 + fish.phase) *
      Math.min(0.15, (habitat.ceiling - habitat.floor) * 0.25);
  fish.y = Math.max(
    habitat.floor,
    Math.min(habitat.ceiling, fish.y + (target - fish.y) * Math.min(1, dt * 2)),
  );
}
