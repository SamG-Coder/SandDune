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
// Survival is a gameplay rule: local water covering the gills is the oxygen proxy.
export const FISH_SURVIVAL_SECONDS = 15;
export const FISH_FADE_SECONDS = 3;
export function gillsSubmerged(s, fish) {
  const size = fish.size ?? 1;
  for (const offset of [-0.35, 0, 0.35]) {
    if (
      sampleWater(
        s,
        fish.x + Math.cos(fish.heading) * offset * size,
        fish.z + Math.sin(fish.heading) * offset * size,
      ) <
      0.65 * size
    )
      return false;
  }
  return true;
}
function seekWater(s, fish, dt, time) {
  const size = fish.size ?? 1,
    edge = s.size / 2 - FISH_RADIUS * size;
  const depth = sampleWater(s, fish.x, fish.z),
    bed = s.sample(fish.x, fish.z);
  fish.mode = depth > 0.12 * size ? "shallow" : "stranded";
  fish.searchTime = (fish.searchTime ?? 0) - dt;
  if (fish.searchTime <= 0) {
    fish.searchTime = 0.5;
    let best = -Infinity,
      target = fish.heading + Math.sin(time + fish.phase) * 0.7;
    // Bounded local search: prefer nearby water, then deeper water and downhill routes.
    for (const radius of [1, 2, 4, 7, 10])
      for (let k = 0; k < 24; k++) {
        const a = (k * Math.PI) / 12,
          x = fish.x + Math.cos(a) * radius,
          z = fish.z + Math.sin(a) * radius;
        if (Math.abs(x) > edge || Math.abs(z) > edge) continue;
        const water = sampleWater(s, x, z),
          rise = s.sample(x, z) - bed;
        const score =
          (water > 0.12 * size ? 8 : 0) +
          Math.min(water, 3) * 2 -
          radius * 0.3 -
          Math.max(0, rise) * 3 -
          0.1 * Math.abs(angleDelta(a, fish.heading));
        if (score > best) {
          best = score;
          target = a;
        }
      }
    fish.escapeHeading = target;
  }
  const change = clamp(
    angleDelta(fish.escapeHeading ?? fish.heading, fish.heading),
    -2 * dt,
    2 * dt,
  );
  fish.heading += change;
  fish.turn = change / dt;
  const pulse = Math.pow(Math.max(0, Math.sin(time * 7 + fish.phase)), 4);
  fish.effort = pulse;
  const speed = fish.mode === "shallow" ? 0.8 * size : 2.8 * size * pulse;
  const x = clamp(fish.x + Math.cos(fish.heading) * speed * dt, -edge, edge);
  const z = clamp(fish.z + Math.sin(fish.heading) * speed * dt, -edge, edge);
  // Wriggle along the ground; do not jump up steep sand ledges.
  if (s.sample(x, z) - bed <= Math.hypot(x - fish.x, z - fish.z) * 0.9 + 0.01) {
    fish.x = x;
    fish.z = z;
  }
  const targetY =
    s.sample(fish.x, fish.z) +
    0.3 * size +
    (fish.mode === "stranded" ? pulse * 0.1 * size : 0);
  fish.y += (targetY - fish.y) * Math.min(1, dt * 10);
}
export function advanceFish(s, fish, dt, time, peers = []) {
  if (dt <= 0) return;
  dt = Math.min(dt, 0.1);
  if (fish.mode === "dead") {
    fish.fade = Math.max(0, (fish.fade ?? 1) - dt / FISH_FADE_SECONDS);
    return;
  }
  const size = fish.size ?? 1;
  const bed = s.sample(fish.x, fish.z);
  const here = fishHabitat(s, fish.x, fish.z, size);
  if (fish.mode === "falling") {
    // Integrate gravity until actual contact; no teleport from the emitter.
    fish.y += fish.velocityY * dt - 4.905 * dt * dt;
    fish.velocityY -= 9.81 * dt;
    const landing = here ? here.ceiling : bed + 0.3 * size;
    if (fish.y > landing) {
      fish.airTime = (fish.airTime ?? 0) + dt;
      return;
    }
    fish.y = landing;
    fish.velocityY = 0;
    fish.mode = here ? "swimming" : "stranded";
  }
  const oxygen = !!here || gillsSubmerged(s, fish);
  fish.airTime = oxygen ? 0 : (fish.airTime ?? 0) + dt;
  if (fish.airTime >= FISH_SURVIVAL_SECONDS - 1e-8) {
    fish.mode = "dead";
    fish.swimming = false;
    fish.fade = 1;
    fish.effort = 0;
    return;
  }
  if (!here) {
    fish.swimming = false;
    seekWater(s, fish, dt, time);
    return;
  }
  fish.swimming = true;
  fish.mode = "swimming";
  fish.hunger = Math.min(1, (fish.hunger ?? 0.6) + dt * 0.025);
  fish.activityTime = (fish.activityTime ?? 0) - dt;
  const goalDistance = Number.isFinite(fish.goalX)
    ? Math.hypot(fish.goalX - fish.x, fish.goalZ - fish.z)
    : 0;
  if (
    fish.activityTime <= 0 ||
    (goalDistance < 0.7 && fish.behavior !== "foraging")
  ) {
    fish.activityIndex = (fish.activityIndex ?? 0) + 1;
    fish.behavior = fish.hunger > 0.8 ? "foraging" : "cruising";
    fish.activityTime =
      fish.behavior === "foraging"
        ? 2.5
        : 7 + 2 * Math.sin(fish.phase + fish.activityIndex);
    const direction =
      fish.heading + Math.sin(fish.phase + fish.activityIndex * 2.4) * 0.7;
    fish.goalX = fish.x + Math.cos(direction) * 10 * size;
    fish.goalZ = fish.z + Math.sin(direction) * 10 * size;
  }
  const foraging = fish.behavior === "foraging";
  const speed =
    fish.speed *
    (foraging ? 0.12 : 0.85 + 0.15 * Math.sin(time * 0.9 + fish.phase));
  fish.decision -= dt;
  if (fish.decision <= 0) {
    fish.decision = 0.18;
    let desired = Math.atan2(fish.goalZ - fish.z, fish.goalX - fish.x);
    let repelX = 0,
      repelZ = 0,
      groupX = 0,
      groupZ = 0,
      alignX = 0,
      alignZ = 0,
      count = 0;
    for (const other of peers) {
      if (other === fish || !other.swimming) continue;
      const dx = other.x - fish.x,
        dz = other.z - fish.z,
        d = Math.hypot(dx, dz);
      if (d < 2.5 * size && d > 0.001) {
        repelX -= dx / (d * d);
        repelZ -= dz / (d * d);
      }
      if (d > 0 && d < 9 * size) {
        groupX += dx;
        groupZ += dz;
        alignX += Math.cos(other.heading);
        alignZ += Math.sin(other.heading);
        count++;
      }
    }
    if (count && !foraging) {
      const groupDistance = Math.hypot(groupX / count, groupZ / count);
      desired = Math.atan2(
        Math.sin(desired) +
          (alignZ / count) * 0.4 +
          (groupDistance > 4 ? (groupZ / count) * 0.1 : 0),
        Math.cos(desired) +
          (alignX / count) * 0.4 +
          (groupDistance > 4 ? (groupX / count) * 0.1 : 0),
      );
      fish.social = "shoaling";
    } else fish.social = "alone";
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
        if (Math.abs(turn) > 0.4) {
          // Keep the escape destination after turning, instead of circling back.
          fish.goalX = fish.x + Math.cos(a) * 8 * size;
          fish.goalZ = fish.z + Math.sin(a) * 8 * size;
        }
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
    (foraging ? habitat.floor + 0.08 : (habitat.floor + habitat.ceiling) / 2) +
    Math.sin(time * 0.7 + fish.phase) *
      Math.min(0.15, (habitat.ceiling - habitat.floor) * 0.25);
  if (foraging && fish.y < habitat.floor + 0.35)
    fish.hunger = Math.max(0, fish.hunger - dt * 0.18);
  fish.y = clamp(
    fish.y + (target - fish.y) * Math.min(1, dt * 2),
    habitat.floor,
    habitat.ceiling,
  );
}
