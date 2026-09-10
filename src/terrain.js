export const WORLD_SIZE = 1400;
export const SAND_SIZE = 160;
export const SAND_RESOLUTION = 193;
function hash(x, z) {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
function noise(x, z) {
  const ix = Math.floor(x),
    iz = Math.floor(z);
  let fx = x - ix,
    fz = z - iz;
  fx = fx * fx * (3 - 2 * fx);
  fz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz),
    b = hash(ix + 1, iz),
    c = hash(ix, iz + 1),
    d = hash(ix + 1, iz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
// Individual asymmetric drifts replace the repeating sinusoidal ridgeline.
const dunes = [
  [-38, -12, 8, 32, 53, -0.5],
  [62, -60, 13, 42, 76, 0.3],
  [-105, -104, 19, 46, 94, -0.32],
  [7, -185, 23, 59, 108, 0.18],
  [155, -205, 20, 55, 98, -0.43],
  [-236, -241, 27, 72, 134, 0.27],
  [-75, -358, 32, 78, 136, -0.1],
  [140, -425, 37, 88, 180, 0.2],
  [323, -305, 30, 85, 139, -0.27],
  [-365, -438, 31, 74, 152, 0.21],
  [-202, 73, 20, 53, 112, -0.28],
  [165, 125, 22, 65, 95, 0.4],
  [365, 55, 32, 78, 165, -0.3],
  [-353, 244, 29, 94, 143, 0.15],
  [-86, 281, 26, 66, 111, -0.32],
  [160, 398, 32, 90, 181, 0.22],
];
export function terrainHeight(x, z) {
  let h =
    -3 +
    2.5 * noise(x * 0.011, z * 0.011) +
    1.2 * noise(x * 0.033 + 16, z * 0.033 + 7);
  for (const [cx, cz, height, width, length, rotation] of dunes) {
    const dx = x - cx,
      dz = z - cz,
      c = Math.cos(rotation),
      s = Math.sin(rotation),
      v = (dz * c - dx * s) / length;
    if (Math.abs(v) > 2.3) continue;
    const u = dx * c + dz * s + width * 0.38 * v * v,
      w = u < 0 ? width : width * 0.48,
      q = u / w;
    if (Math.abs(q) > 3.5) continue;
    h += height * Math.exp(-q * q - v * v * v * v * 0.8);
  }
  return h;
}
export const QUALITY = {
  low: { segments: 192, particles: 1600, pixelRatio: 1, shadows: 0 },
  medium: { segments: 256, particles: 4200, pixelRatio: 1.3, shadows: 1 },
  high: { segments: 320, particles: 8000, pixelRatio: 1.65, shadows: 1 },
};
export function chooseAdaptiveQuality(fps, current) {
  if (fps < 36) return current === "high" ? "medium" : "low";
  if (fps > 57 && current === "low") return "medium";
  return current;
}
export function windVector(degrees) {
  const a = (degrees * Math.PI) / 180;
  return [Math.cos(a), Math.sin(a)];
}
export class SandSimulation {
  constructor(
    resolution = SAND_RESOLUTION,
    size = SAND_SIZE,
    heightAt = terrainHeight,
  ) {
    this.resolution = resolution;
    this.size = size;
    this.cell = size / (resolution - 1);
    this.base = new Float32Array(resolution * resolution);
    this.height = new Float32Array(resolution * resolution);
    this.change = new Float32Array(resolution * resolution);
    this.weights = new Float32Array(resolution * resolution);
    this.moisture = new Float32Array(resolution * resolution);
    this.water = new Float32Array(resolution * resolution);
    this.waterChange = new Float32Array(resolution * resolution);
    this.moistureChange = new Float32Array(resolution * resolution);
    this.flowX = new Float32Array(resolution * resolution);
    this.flowZ = new Float32Array(resolution * resolution);
    this.waterCapacity = 0.55;
    this.hasWater = false;
    for (let z = 0; z < resolution; z++)
      for (let x = 0; x < resolution; x++) {
        // Boundary vertices represent half cells; corners represent quarter cells.
        this.weights[z * resolution + x] =
          (x === 0 || x === resolution - 1 ? 0.5 : 1) *
          (z === 0 || z === resolution - 1 ? 0.5 : 1);
        this.base[z * resolution + x] = heightAt(
          x * this.cell - size / 2,
          z * this.cell - size / 2,
        );
      }
    this.height.set(this.base);
    this.version = 0;
    this.bedrock = -8;
  }
  sample(x, z) {
    const n = this.resolution,
      gx = (x + this.size / 2) / this.cell,
      gz = (z + this.size / 2) / this.cell;
    if (gx < 0 || gz < 0 || gx > n - 1 || gz > n - 1) return this.bedrock;
    const ix = Math.min(n - 2, Math.floor(gx)),
      iz = Math.min(n - 2, Math.floor(gz)),
      fx = gx - ix,
      fz = gz - iz,
      i = iz * n + ix,
      h = this.height;
    return (
      h[i] * (1 - fx) * (1 - fz) +
      h[i + 1] * fx * (1 - fz) +
      h[i + n] * (1 - fx) * fz +
      h[i + n + 1] * fx * fz
    );
  }
  brush(x, z, radius, amount, mode = "dig") {
    if (
      ![x, z, radius, amount].every(Number.isFinite) ||
      radius <= 0 ||
      amount <= 0
    )
      return false;
    if (Math.abs(x) > this.size / 2 || Math.abs(z) > this.size / 2)
      return false;
    const n = this.resolution,
      cell = this.cell,
      minX = Math.max(0, Math.floor((x - radius * 1.8 + this.size / 2) / cell)),
      maxX = Math.min(
        n - 1,
        Math.ceil((x + radius * 1.8 + this.size / 2) / cell),
      ),
      minZ = Math.max(0, Math.floor((z - radius * 1.8 + this.size / 2) / cell)),
      maxZ = Math.min(
        n - 1,
        Math.ceil((z + radius * 1.8 + this.size / 2) / cell),
      );
    const entries = [];
    let coreSum = 0,
      rimSum = 0;
    for (let j = minZ; j <= maxZ; j++)
      for (let i = minX; i <= maxX; i++) {
        const r =
          Math.hypot(
            i * cell - this.size / 2 - x,
            j * cell - this.size / 2 - z,
          ) / radius;
        if (r > 1.8) continue;
        const core = Math.max(0, 1 - r * r) ** 2,
          rim = r > 0.85 ? Math.max(0, 1 - ((r - 1.23) / 0.55) ** 2) ** 2 : 0;
        entries.push([j * n + i, core, rim]);
        coreSum += core * this.weights[j * n + i];
        rimSum += rim * this.weights[j * n + i];
      }
    if (mode === "water") {
      for (const [i, core] of entries) this.water[i] += amount * core;
      this.hasWater = true;
    } else if (mode === "smooth") {
      let correction = 0;
      for (const e of entries) {
        const [i, core] = e;
        const x = i % n,
          z = Math.floor(i / n);
        let sum = 0,
          count = 0;
        if (x > 0) {
          sum += this.height[i - 1];
          count++;
        }
        if (x < n - 1) {
          sum += this.height[i + 1];
          count++;
        }
        if (z > 0) {
          sum += this.height[i - n];
          count++;
        }
        if (z < n - 1) {
          sum += this.height[i + n];
          count++;
        }
        const average = sum / count;
        e[3] = (average - this.height[i]) * core * Math.min(amount * 3, 0.45);
        correction += e[3] * this.weights[i];
      }
      for (const [i, core, , change] of entries)
        this.height[i] +=
          change - (correction * core) / Math.max(coreSum, 1e-6);
    } else if (mode === "pour") {
      for (const [i, core] of entries) this.height[i] += amount * core;
    } else {
      let displaced = 0;
      for (const [i, core] of entries) {
        const removed = Math.min(
          amount * core,
          Math.max(0, this.height[i] - this.bedrock),
        );
        this.height[i] -= removed;
        displaced += removed * this.weights[i];
      }
      for (const [i, , rim] of entries)
        this.height[i] += (displaced * rim) / Math.max(rimSum, 1e-6);
    }
    this.version++;
    return true;
  }
  step(dt, wind, direction) {
    if (this.hasWater) this.stepWater(dt, wind, direction);
    const n = this.resolution,
      h = this.height,
      change = this.change,
      cell = this.cell;
    const [wx, wz] = windVector(direction);
    change.fill(0);
    this.moistureChange.fill(0);
    const repose = cell * 0.62,
      relaxation = Math.min(dt * 3.5, 0.18),
      transport = Math.max(0, wind - 3) * 0.014 * dt;
    for (let z = 0; z < n; z++)
      for (let x = 0; x < n; x++) {
        const i = z * n + x;
        if (x < n - 1)
          this.transferPair(i, i + 1, wx, transport, repose, relaxation);
        if (z < n - 1)
          this.transferPair(i, i + n, wz, transport, repose, relaxation);
        if (z < n - 1 && x < n - 1)
          this.transferPair(
            i,
            i + n + 1,
            0,
            0,
            repose * Math.SQRT2,
            relaxation * 0.5,
          );
        if (z < n - 1 && x > 0)
          this.transferPair(
            i,
            i + n - 1,
            0,
            0,
            repose * Math.SQRT2,
            relaxation * 0.5,
          );
      }
    for (let i = 0; i < h.length; i++) {
      h[i] += change[i] / this.weights[i];
      if (this.hasWater) {
        this.moisture[i] = Math.max(
          0,
          this.moisture[i] + this.moistureChange[i] / this.weights[i],
        );
        if (this.moisture[i] > this.waterCapacity) {
          this.water[i] += this.moisture[i] - this.waterCapacity;
          this.moisture[i] = this.waterCapacity;
        }
      }
    }
    this.version++;
  }
  transferPair(a, b, direction, transport, repose, relaxation) {
    if (this.hasWater && this.moisture[a] + this.moisture[b] > 0.00001) {
      const wet = Math.min(
        1,
        (this.moisture[a] + this.moisture[b]) / (2 * this.waterCapacity),
      );
      const mud = Math.max(0, Math.min(1, (wet - 0.65) / 0.3));
      // Damp grains gain capillary cohesion; saturation produces a lower-yield slurry.
      repose *= (1 + Math.sin(wet * Math.PI) * 1.1) * (1 - mud) + 0.28 * mud;
      relaxation *= 1 - mud * 0.55;
      transport *= Math.pow(1 - wet, 3);
    }
    const difference = this.height[a] - this.height[b],
      slump =
        Math.sign(difference) *
        Math.max(0, Math.abs(difference) - repose) *
        relaxation;
    // Upwind finite-volume advection actually translates deposits downwind.
    // Limiting each donor to 1/8 of its available depth prevents negative sand
    // thickness even when all eight neighbours receive material in one step.
    const donor = direction >= 0 ? a : b;
    let flux =
      transport *
        direction *
        Math.max(0, this.height[donor] - this.bedrock) *
        0.24 +
      difference * transport * 0.48 +
      slump;
    flux *= Math.min(this.weights[a], this.weights[b]);
    flux = Math.min(
      Math.max(
        flux,
        (-Math.max(0, this.height[b] - this.bedrock) * this.weights[b]) / 8,
      ),
      (Math.max(0, this.height[a] - this.bedrock) * this.weights[a]) / 8,
    );
    this.change[a] -= flux;
    this.change[b] += flux;
    if (this.hasWater && flux !== 0) {
      const source = flux > 0 ? a : b;
      const carried =
        (flux * this.moisture[source]) /
        Math.max(0.01, this.height[source] - this.bedrock);
      this.moistureChange[a] -= carried;
      this.moistureChange[b] += carried;
    }
  }
  stepWater(dt, wind = 0, direction = 0) {
    const n = this.resolution,
      capacity = this.waterCapacity;
    const [windX, windZ] = windVector(direction);
    // Artistic surface stress, bounded to the UI range. Only exposed liquid is
    // driven; the existing donor limits and closed walls still conserve volume.
    const windStress = 0.00035 * Math.min(40, Math.max(0, wind)) ** 2;
    this.waterChange.fill(0);
    this.moistureChange.fill(0);
    for (let i = 0; i < this.water.length; i++) {
      const absorbed = Math.max(
        0,
        Math.min(this.water[i], capacity - this.moisture[i], dt * 0.18),
      );
      this.water[i] -= absorbed;
      this.moisture[i] += absorbed;
    }
    const pair = (a, b, velocity, windComponent) => {
      const headA = this.height[a] + this.water[a],
        headB = this.height[b] + this.water[b];
      const weight = Math.min(this.weights[a], this.weights[b]);
      // Persistent face flux provides momentum, unlike a viscous height blur.
      // Hydrostatic reconstruction keeps dry uphill faces from pulling water out
      // of a resting pool; donor limits keep fast fronts positive and conservative.
      const faceDepth = Math.max(
        0,
        Math.max(headA, headB) - Math.max(this.height[a], this.height[b]),
      );
      let rate =
        velocity[a] * Math.pow(0.985, dt * 30) +
        ((9.81 * faceDepth * (headA - headB)) / (this.cell * this.cell)) *
          dt *
          weight;
      rate +=
        ((windStress * windComponent * Math.min(faceDepth, 0.5)) / this.cell) *
        dt *
        weight;
      let flow = rate * dt;
      flow = Math.min(
        Math.max(flow, (-this.water[b] * this.weights[b]) / 4),
        (this.water[a] * this.weights[a]) / 4,
      );
      velocity[a] = flow / dt;
      this.waterChange[a] -= flow;
      this.waterChange[b] += flow;
      let seep = (this.moisture[a] - this.moisture[b]) * dt * 0.18 * weight;
      seep = Math.min(
        Math.max(seep, (-this.moisture[b] * this.weights[b]) / 4),
        (this.moisture[a] * this.weights[a]) / 4,
      );
      this.moistureChange[a] -= seep;
      this.moistureChange[b] += seep;
    };
    for (let z = 0; z < n; z++)
      for (let x = 0; x < n; x++) {
        const i = z * n + x;
        if (x < n - 1) pair(i, i + 1, this.flowX, windX);
        if (z < n - 1) pair(i, i + n, this.flowZ, windZ);
      }
    for (let i = 0; i < this.water.length; i++) {
      this.water[i] = Math.max(
        0,
        this.water[i] + this.waterChange[i] / this.weights[i],
      );
      this.moisture[i] = Math.max(
        0,
        this.moisture[i] + this.moistureChange[i] / this.weights[i],
      );
      if (this.moisture[i] > capacity) {
        this.water[i] += this.moisture[i] - capacity;
        this.moisture[i] = capacity;
      }
    }
  }
  waterVolume() {
    let sum = 0;
    for (let i = 0; i < this.water.length; i++)
      sum += (this.water[i] + this.moisture[i]) * this.weights[i];
    return sum * this.cell ** 2;
  }
  reset() {
    this.height.set(this.base);
    this.moisture.fill(0);
    this.water.fill(0);
    this.hasWater = false;
    this.flowX.fill(0);
    this.flowZ.fill(0);
    this.version++;
  }
  volume() {
    let sum = 0;
    for (let i = 0; i < this.height.length; i++)
      sum += (this.height[i] - this.bedrock) * this.weights[i];
    return sum * this.cell ** 2;
  }
}
