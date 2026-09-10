// Fish collisions use the live simulated liquid depth, never the decorative waves.
export const FISH_RADIUS = 1.7;
export const FISH_HALF_HEIGHT = 0.78;
const footprintCache = new WeakMap();
function footprint(s, size = 1) {
  if (!footprintCache.has(s)) footprintCache.set(s, new Map());
  const cache = footprintCache.get(s);
  if (cache.has(size)) return cache.get(size);
  const radius = FISH_RADIUS * size;
  const points = [],
    step = Math.min(0.35, s.cell * 0.5);
  for (let z = -radius; z <= radius; z += step)
    for (let x = -radius; x <= radius; x += step)
      if (x * x + z * z <= radius * radius) points.push([x, z]);
  for (let k = 0; k < 32; k++)
    points.push([
      Math.cos((k * Math.PI) / 16) * radius,
      Math.sin((k * Math.PI) / 16) * radius,
    ]);
  cache.set(size, points);
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
export function fishHabitat(s, x, z, size = 1) {
  if (!Number.isFinite(x + z)) return null;
  let floor = -Infinity,
    ceiling = Infinity;
  // Include body interior and the entire fin envelope, not just the centre.
  for (const [dx, dz] of footprint(s, size)) {
    const px = x + dx,
      pz = z + dz;
    const d = sampleWater(s, px, pz);
    if (d < 2 * FISH_HALF_HEIGHT * size + 0.4) return null;
    const bed = s.sample(px, pz);
    floor = Math.max(floor, bed + FISH_HALF_HEIGHT * size + 0.2);
    ceiling = Math.min(ceiling, bed + d - FISH_HALF_HEIGHT * size - 0.2);
  }
  return floor <= ceiling ? { floor, ceiling } : null;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export function createFishState(s, x, z, id = 0, size = 1) {
  const habitat = fishHabitat(s, x, z, size);
  if (!habitat) return null;
  return {
    x,
    z,
    size,
    y: (habitat.floor + habitat.ceiling) / 2,
    heading: id * 2.399,
    phase: id * 1.7,
    swimming: true,
    mode: "swimming",
    speed: 1.2 + 0.35 * Math.sin(id * 7.1),
    turn: 0,
    decision: 0,
  };
}
export function createDropState(s, x, z, id, size = 1) {
  const edge = s.size / 2 - FISH_RADIUS * size;
  x = clamp(x, -edge, edge);
  z = clamp(z, -edge, edge);
  return {
    x,
    z,
    size,
    y: s.sample(x, z) + sampleWater(s, x, z) + 10,
    heading: id * 2.399,
    phase: id * 1.7,
    swimming: false,
    mode: "falling",
    velocityY: 0,
    speed: 1.2 + 0.35 * Math.sin(id * 7.1),
    turn: 0,
    decision: 0,
  };
}
export function advanceFish(s, fish, dt, time, peers = []) {
  if (dt <= 0) return;
  dt = Math.min(dt, 0.1);
  const size = fish.size ?? 1;
  const bed = s.sample(fish.x, fish.z);
  const here = fishHabitat(s, fish.x, fish.z, size);
  if (fish.mode === "falling") {
    // Integrate gravity until actual contact; no teleport from the emitter.
    fish.y += fish.velocityY * dt - 4.905 * dt * dt;
    fish.velocityY -= 9.81 * dt;
    const landing = here ? here.ceiling : bed + 0.3 * size;
    if (fish.y > landing) return;
    fish.y = landing;
    fish.velocityY = 0;
    fish.mode = here ? "swimming" : "stranded";
  }
  if (!here) {
    fish.swimming = false;
    fish.mode = "stranded";
    // Keep stranded fish at their landing location; flooding can rescue them.
    fish.y += (bed + 0.3 * size - fish.y) * Math.min(1, dt * 8);
    return;
  }
  fish.swimming = true;
  fish.mode = "swimming";
  const speed = fish.speed * (0.8 + 0.2 * Math.sin(time * 0.9 + fish.phase));
  fish.decision -= dt;
  if (fish.decision <= 0) {
    fish.decision = 0.18;
    let desired = fish.heading + Math.sin(time * 0.5 + fish.phase) * 0.5;
    let repelX = 0,
      repelZ = 0;
    for (const other of peers) {
      if (other === fish || !other.swimming) continue;
      const dx = fish.x - other.x,
        dz = fish.z - other.z,
        d = Math.hypot(dx, dz);
      if (d < 3 * size && d > 0.001) {
        repelX += dx / (d * d);
        repelZ += dz / (d * d);
      }
    }
    if (Math.hypot(repelX, repelZ) > 0.15)
      desired = Math.atan2(
        Math.sin(desired) + repelZ,
        Math.cos(desired) + repelX,
      );
    // Probe ahead before the shoreline, then rotate towards an escape heading.
    for (const turn of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, Math.PI]) {
      const a = desired + turn;
      if (
        fishHabitat(
          s,
          fish.x + Math.cos(a) * 1.1 * size,
          fish.z + Math.sin(a) * 1.1 * size,
          size,
        )
      ) {
        fish.targetHeading = a;
        break;
      }
    }
  }
  const change = clamp(
    angleDelta(fish.targetHeading ?? fish.heading, fish.heading),
    -1.5 * dt,
    1.5 * dt,
  );
  fish.heading += change;
  fish.turn = change / dt;
  const distance = speed * dt;
  const x = fish.x + Math.cos(fish.heading) * distance,
    z = fish.z + Math.sin(fish.heading) * distance;
  const next = fishHabitat(s, x, z, size);
  if (next) {
    fish.x = x;
    fish.z = z;
  }
  const habitat = next || here;
  const target =
    (habitat.floor + habitat.ceiling) / 2 +
    Math.sin(time * 0.7 + fish.phase) *
      Math.min(0.15, (habitat.ceiling - habitat.floor) * 0.25);
  fish.y = clamp(
    fish.y + (target - fish.y) * Math.min(1, dt * 2),
    habitat.floor,
    habitat.ceiling,
  );
}
