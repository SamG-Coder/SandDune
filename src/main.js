import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createEnclosure } from "./enclosure.js";
import { createWater } from "./water.js";
import { createFishSystem } from "./fish.js";
import { sampleWater } from "./fish-habitat.js";
import {
  windVector,
  QUALITY,
  chooseAdaptiveQuality,
  SandSimulation,
} from "./terrain.js";
import {
  terrainVertex,
  terrainFragment,
  skyVertex,
  skyFragment,
  particleVertex,
  particleFragment,
} from "./shaders.js";
import "./style.css";
const $ = (id) => document.getElementById(id);
const state = {
  wind: 12,
  direction: 65,
  sun: 24,
  haze: 0,
  paused: matchMedia("(prefers-reduced-motion: reduce)").matches,
  quality: "auto",
  tool: "dig",
  radius: 3.2,
  tapFlow: 1,
};
const simulation = new SandSimulation();
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
} catch (error) {
  $("loading").hidden = true;
  $("error").hidden = false;
  $("error").textContent =
    "WebGL 2 is unavailable. Enable hardware acceleration and reload.";
  throw error;
}
let shaderErrors = 0;
renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
  shaderErrors++;
  console.error(
    gl.getProgramInfoLog(program),
    gl.getShaderInfoLog(vertex),
    gl.getShaderInfoLog(fragment),
  );
  $("loading").hidden = true;
  $("error").hidden = false;
  $("error").textContent =
    "The graphics driver could not compile the sand shaders.";
};
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.domElement.setAttribute(
  "aria-label",
  "Interactive sand. Drag to dig, right-drag to orbit, scroll to zoom.",
);
renderer.domElement.tabIndex = 0;
$("world").prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(49, 1, 0.2, 1900);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 10;
controls.maxDistance = 850;
controls.minPolarAngle = 0.2;
controls.maxPolarAngle = Math.PI * 0.48;
controls.mouseButtons = {
  LEFT: null,
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.ROTATE,
};
controls.touches.ONE = null;
controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
function resetView() {
  const fit = Math.max(1, 1.15 / (innerWidth / innerHeight));
  camera.position.set(160 * fit, 6 + 134 * fit, 195 * fit);
  controls.target.set(0, 6, 0);
  controls.update();
}
resetView();
const floatLinear = renderer.extensions.has("OES_texture_float_linear");
const shaderDefines = floatLinear ? { FLOAT_LINEAR: 1 } : {};
function heightTexture(data, n) {
  const t = new THREE.DataTexture(data, n, n, THREE.RedFormat, THREE.FloatType);
  t.minFilter = t.magFilter = floatLinear
    ? THREE.LinearFilter
    : THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}
const sandTexture = heightTexture(simulation.height, simulation.resolution);
const moistureTexture = heightTexture(
  simulation.moisture,
  simulation.resolution,
);
const waterTexture = heightTexture(simulation.water, simulation.resolution);
function uploadFields() {
  sandTexture.needsUpdate = true;
  moistureTexture.needsUpdate = true;
  waterTexture.needsUpdate = true;
}
const uniforms = {
  uMoisture: { value: moistureTexture },
  uWater: { value: waterTexture },
  uWaterTool: { value: 0 },
  uElapsed: { value: 0 },
  uPourPoint: { value: new THREE.Vector3() },
  uSandHeight: { value: sandTexture },
  uSandResolution: { value: simulation.resolution },
  uTime: { value: 0 },
  uDrift: { value: new THREE.Vector2() },
  uWind: { value: 12 },
  uWindDirection: { value: new THREE.Vector2() },
  uSun: { value: new THREE.Vector3() },
  uSand: { value: new THREE.Color("#c3a477") },
  uFog: { value: new THREE.Color("#c6b6a0") },
  uHaze: { value: 0 },
  uShadows: { value: 1 },
  uPixelRatio: { value: 1 },
  uBrush: { value: new THREE.Vector3(0, 0, -1) },
};
const terrainMaterial = new THREE.ShaderMaterial({
  uniforms,
  defines: shaderDefines,
  vertexShader: terrainVertex,
  fragmentShader: terrainFragment,
});
let terrain;
function makeTerrain(segments) {
  const geometry = new THREE.PlaneGeometry(160, 160, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  if (terrain) {
    terrain.geometry.dispose();
    terrain.geometry = geometry;
  } else {
    terrain = new THREE.Mesh(geometry, terrainMaterial);
    terrain.frustumCulled = false;
    scene.add(terrain);
  }
}
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(1, 24, 12),
  new THREE.ShaderMaterial({
    uniforms,
    defines: shaderDefines,
    vertexShader: skyVertex,
    fragmentShader: skyFragment,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  }),
);
sky.frustumCulled = false;
sky.renderOrder = -10;
scene.add(sky);
const enclosure = createEnclosure(renderer, scene, uniforms, shaderDefines);
const waterDisplay = createWater(scene, uniforms, shaderDefines);
const fishSystem = createFishSystem(scene, simulation);
const particleGeometry = new THREE.BufferGeometry(),
  positions = new Float32Array(QUALITY.high.particles * 3),
  seeds = new Float32Array(QUALITY.high.particles * 4);
let rng = 7091;
const random = () => {
  rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
  return rng / 4294967296;
};
for (let i = 0; i < QUALITY.high.particles; i++) {
  positions[i * 3] = (random() - 0.5) * 200;
  positions[i * 3 + 2] = (random() - 0.5) * 200;
  for (let j = 0; j < 4; j++) seeds[i * 4 + j] = random();
}
particleGeometry.setAttribute(
  "position",
  new THREE.BufferAttribute(positions, 3),
);
particleGeometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
const particles = new THREE.Points(
  particleGeometry,
  new THREE.ShaderMaterial({
    uniforms,
    defines: shaderDefines,
    vertexShader: particleVertex,
    fragmentShader: particleFragment,
    transparent: true,
    depthWrite: false,
  }),
);
particles.frustumCulled = false;
scene.add(particles);
let activeQuality = "",
  qualityCooldown = 0;
function resize() {
  const w = innerWidth,
    h = innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const ratio = Math.min(
    devicePixelRatio || 1,
    QUALITY[activeQuality || "medium"].pixelRatio,
    Math.sqrt(2800000 / (w * h)),
  );
  renderer.setPixelRatio(ratio);
  uniforms.uPixelRatio.value = ratio;
  renderer.setSize(w, h);
}
function applyQuality(level) {
  if (level === activeQuality) return;
  activeQuality = level;
  makeTerrain(QUALITY[level].segments);
  waterDisplay.setResolution(QUALITY[level].segments);
  particleGeometry.setDrawRange(0, QUALITY[level].particles);
  uniforms.uShadows.value = QUALITY[level].shadows;
  enclosure.setQuality(level);
  resize();
}
applyQuality(innerWidth < 760 ? "low" : "medium");
addEventListener("resize", resize);
function syncAtmosphere() {
  uniforms.uWind.value = state.wind;
  uniforms.uWindDirection.value.set(...windVector(state.direction));
  uniforms.uHaze.value = Math.max(0, state.wind - 20) / 32;
  const elevation = THREE.MathUtils.degToRad(state.sun);
  uniforms.uSun.value
    .set(
      -Math.cos(elevation) * 0.91,
      Math.sin(elevation),
      Math.cos(elevation) * 0.41,
    )
    .normalize();
  enclosure.updateSun(uniforms.uSun.value);
  uniforms.uFog.value.set(state.sun > 40 ? "#c6c5b9" : "#c6b6a0");
  for (const name of ["wind", "direction", "sun"]) {
    $(name).value = state[name];
    $(name + "-value").textContent =
      state[name] + (name === "wind" ? " km/h" : "°");
  }
}
syncAtmosphere();
for (const name of ["wind", "direction", "sun"])
  $(name).addEventListener("input", (event) => {
    state[name] = Number(event.target.value);
    syncAtmosphere();
  });
$("quality").addEventListener("change", (event) => {
  state.quality = event.target.value;
  applyQuality(state.quality === "auto" ? "medium" : state.quality);
  qualityCooldown = 0;
});
function syncPause() {
  $("pause").textContent = state.paused ? "Resume" : "Pause";
  $("pause").setAttribute("aria-pressed", String(state.paused));
}
$("pause").addEventListener("click", () => {
  state.paused = !state.paused;
  syncPause();
});
syncPause();
$("reset").addEventListener("click", resetView);
$("clear").addEventListener("click", () => {
  simulation.reset();
  fishSystem.reset();
  uploadFields();
});
$("brush").addEventListener("input", (event) => {
  state.radius = Number(event.target.value);
});
$("fish-limit").addEventListener("input", (event) => {
  fishSystem.setLimit(event.target.value);
});
function setTool(tool) {
  $("fish-controls").hidden = tool !== "fish";
  $("brush").hidden = tool === "fish";
  document.querySelector('label[for="brush"]').hidden = tool === "fish";
  $("tap-controls").hidden = tool !== "water";
  state.tool = tool;
  uniforms.uWaterTool.value = tool === "water" ? 1 : 0;
  document
    .querySelectorAll("[data-tool]")
    .forEach((button) =>
      button.setAttribute("aria-pressed", String(button.dataset.tool === tool)),
    );
  controls.mouseButtons.LEFT = tool === "orbit" ? THREE.MOUSE.ROTATE : null;
  controls.touches.ONE = tool === "orbit" ? THREE.TOUCH.ROTATE : null;
  renderer.domElement.style.cursor = tool === "orbit" ? "grab" : "crosshair";
  $("hint").textContent =
    tool === "fish"
      ? "Hold to drop goldfish · Fish need deep water to swim"
      : tool === "orbit"
        ? "Drag to orbit · Scroll / pinch to zoom"
        : tool === "water"
          ? "Hold to pour water · Right-drag to orbit · Scroll / pinch to zoom"
          : "Drag to move sand · Right-drag to orbit · Scroll / pinch to zoom";
  if (tool === "orbit") uniforms.uBrush.value.z = -1;
}
document
  .querySelectorAll("[data-tool]")
  .forEach((button) =>
    button.addEventListener("click", () => setTool(button.dataset.tool)),
  );
setTool("dig");
$("tap-flow").addEventListener("input", (event) => {
  state.tapFlow = Number(event.target.value);
  $("tap-flow-value").textContent = Math.round(state.tapFlow * 100) + "%";
});
function toggleUI() {
  const hidden = document.body.classList.toggle("clean");
  document.querySelectorAll(".interface").forEach((el) => {
    el.inert = hidden;
  });
  $("show-ui").hidden = !hidden;
  (hidden ? $("show-ui") : $("hide-ui")).focus();
}
$("hide-ui").addEventListener("click", toggleUI);
$("show-ui").addEventListener("click", toggleUI);
addEventListener("keydown", (event) => {
  if (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
  if (event.code === "KeyH") toggleUI();
  if (/Digit[1-6]/.test(event.code))
    setTool(
      ["dig", "pour", "smooth", "orbit", "water", "fish"][
        Number(event.code.slice(-1)) - 1
      ],
    );
  if (event.target.tagName === "BUTTON") return;
  if (event.code === "Space") {
    event.preventDefault();
    state.paused = !state.paused;
    syncPause();
  }
  if (event.code === "KeyR") resetView();
});
const pointer = new THREE.Vector2(),
  raycaster = new THREE.Raycaster();
let pointerInside = false,
  droppingFish = false,
  fishDropTime = 0,
  painting = false,
  strokePlaneY = null,
  lastStroke = null,
  pointerCount = 0;
const activePointers = new Set();
function readPointer(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    (-(event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  pointerInside = true;
}
function pickSand() {
  raycaster.setFromCamera(pointer, camera);
  const ray = raycaster.ray;
  const heightAt = (x, z) =>
    simulation.sample(x, z) +
    (state.tool === "fish" ? sampleWater(simulation, x, z) : 0);
  // Keep a held brush anchored as the surface moves underneath it. Recasting
  // against each deeper trench would slide the brush away from the glass.
  if (painting && strokePlaneY !== null && Math.abs(ray.direction.y) > 1e-6) {
    const distance = (strokePlaneY - ray.origin.y) / ray.direction.y;
    if (distance < 0) return null;
    const hit = ray.at(distance, new THREE.Vector3());
    if (Math.max(Math.abs(hit.x), Math.abs(hit.z)) > simulation.size / 2)
      return null;
    hit.y = simulation.sample(hit.x, hit.z);
    return hit;
  }
  let previous = 0.2;
  for (let t = 1; t < 1200; t += Math.max(0.6, t * 0.012)) {
    const p = ray.at(t, new THREE.Vector3());
    if (p.y < heightAt(p.x, p.z)) {
      let lo = previous,
        hi = t;
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2,
          q = ray.at(mid, new THREE.Vector3());
        if (q.y < heightAt(q.x, q.z)) hi = mid;
        else lo = mid;
      }
      const hit = ray.at((lo + hi) / 2, new THREE.Vector3());
      return Math.max(Math.abs(hit.x), Math.abs(hit.z)) <= simulation.size / 2
        ? hit
        : null;
    }
    previous = t;
  }
  return null;
}
renderer.domElement.addEventListener("pointerdown", (event) => {
  activePointers.add(event.pointerId);
  pointerCount = activePointers.size;
  readPointer(event);
  if (pointerCount > 1) {
    droppingFish = false;
    painting = false;
    lastStroke = null;
    return;
  }
  if (event.button === 0 && state.tool !== "orbit") {
    const hit = pickSand();
    if (state.tool === "fish") {
      $("hint").textContent = hit
        ? fishSystem.add(hit.x, hit.z)
        : "Point inside the glass box to drop fish.";
      droppingFish = !!hit;
      fishDropTime = 0;
      renderer.domElement.setPointerCapture(event.pointerId);
      painting = false;
      lastStroke = null;
      return;
    }
    strokePlaneY = hit?.y ?? null;
    painting = !!hit;
    lastStroke = null;
    renderer.domElement.setPointerCapture(event.pointerId);
  }
});
renderer.domElement.addEventListener("pointermove", readPointer);
function finishPointer(event) {
  droppingFish = false;
  if (event.type === "pointerup" && painting && !lastStroke) {
    const hit = pickSand();
    if (hit) {
      simulation.brush(
        hit.x,
        hit.z,
        state.radius,
        0.2 * (state.tool === "water" ? state.tapFlow : 1),
        state.tool,
      );
      uploadFields();
    }
  }
  activePointers.delete(event.pointerId);
  pointerCount = activePointers.size;
  painting = false;
  strokePlaneY = null;
  lastStroke = null;
}
renderer.domElement.addEventListener("pointerup", finishPointer);
renderer.domElement.addEventListener("pointercancel", finishPointer);
renderer.domElement.addEventListener("lostpointercapture", finishPointer);
renderer.domElement.addEventListener("pointerleave", () => {
  if (!painting) pointerInside = false;
});
addEventListener("blur", () => {
  droppingFish = false;
  painting = false;
  lastStroke = null;
  activePointers.clear();
});
let lastTime = 0,
  sampleTime = 0,
  sampleFrames = 0,
  accumulator = 0,
  frameHandle = 0,
  started = false,
  contextLost = false;
function frame(now) {
  if (document.hidden || contextLost) return;
  const rawDelta = lastTime ? (now - lastTime) / 1000 : 0,
    delta = Math.min(rawDelta, 0.05);
  lastTime = now;
  uniforms.uElapsed.value += delta;
  controls.update(delta);
  camera.position.y = Math.max(
    camera.position.y,
    simulation.sample(camera.position.x, camera.position.z) + 1.8,
  );
  camera.updateMatrixWorld();
  const hit = pointerInside && state.tool !== "orbit" ? pickSand() : null;
  if (hit) uniforms.uBrush.value.set(hit.x, hit.z, state.radius);
  else uniforms.uBrush.value.z = -1;
  if (droppingFish && state.tool === "fish") {
    fishDropTime += delta;
    if (fishDropTime >= 0.32 && hit) {
      fishDropTime = 0;
      $("hint").textContent = fishSystem.add(hit.x, hit.z);
    }
  } else droppingFish = false;
  $("fish-count").textContent =
    `${fishSystem.fish.length} / ${fishSystem.limit}`;
  if (painting && hit) {
    const start = lastStroke || hit,
      distance = Math.hypot(hit.x - start.x, hit.z - start.z),
      steps = Math.min(
        32,
        Math.max(1, Math.ceil(distance / (state.radius * 0.25))),
      );
    for (let i = 1; i <= steps; i++)
      simulation.brush(
        THREE.MathUtils.lerp(start.x, hit.x, i / steps),
        THREE.MathUtils.lerp(start.z, hit.z, i / steps),
        state.radius,
        (delta * 3.8 * (state.tool === "water" ? state.tapFlow : 1)) / steps,
        state.tool,
      );
    lastStroke = hit.clone();
    uploadFields();
  } else lastStroke = null;
  if (!state.paused) {
    uniforms.uTime.value += delta;
    uniforms.uDrift.value.addScaledVector(
      uniforms.uWindDirection.value,
      delta *
        state.wind *
        0.23 *
        (1 + 0.15 * Math.sin(uniforms.uTime.value * 0.7)),
    );
    accumulator += delta;
    while (accumulator >= 1 / 30) {
      simulation.step(1 / 30, state.wind, state.direction);
      accumulator -= 1 / 30;
      uploadFields();
    }
  }
  waterDisplay.mesh.visible = simulation.hasWater;
  fishSystem.update(state.paused ? 0 : delta);
  waterDisplay.stream.visible =
    painting && !!hit && state.tool === "water" && state.tapFlow > 0;
  if (hit) uniforms.uPourPoint.value.copy(hit);
  renderer.render(scene, camera);
  if (!started) {
    started = true;
    $("loading").hidden = true;
  }
  sampleTime += rawDelta;
  sampleFrames++;
  qualityCooldown += rawDelta;
  if (sampleTime > 2) {
    const fps = Math.round(sampleFrames / sampleTime);
    $("stats").textContent = fps + " fps";
    if (state.quality === "auto" && qualityCooldown > 12) {
      const next = chooseAdaptiveQuality(fps, activeQuality);
      if (next !== activeQuality) {
        applyQuality(next);
        qualityCooldown = 0;
      }
    }
    sampleTime = 0;
    sampleFrames = 0;
  }
  frameHandle = requestAnimationFrame(frame);
}
function resume() {
  cancelAnimationFrame(frameHandle);
  lastTime = 0;
  sampleTime = 0;
  sampleFrames = 0;
  if (!document.hidden && !contextLost)
    frameHandle = requestAnimationFrame(frame);
}
document.addEventListener("visibilitychange", () => {
  painting = false;
  activePointers.clear();
  resume();
});
renderer.domElement.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  contextLost = true;
  cancelAnimationFrame(frameHandle);
  $("error").textContent = "Waiting for the graphics connection to recover…";
  $("error").hidden = false;
});
renderer.domElement.addEventListener("webglcontextrestored", () => {
  contextLost = false;
  enclosure.restoreEnvironment();
  uploadFields();
  $("error").hidden = true;
  resume();
});
window.sandDiagnostics = () => ({
  ready: started,
  glassWalls: enclosure.walls.length,
  quality: activeQuality,
  drawCalls: renderer.info.render.calls,
  triangles: renderer.info.render.triangles,
  particles: particleGeometry.drawRange.count,
  pixelRatio: renderer.getPixelRatio(),
  paused: state.paused,
  tool: state.tool,
  wind: state.wind,
  direction: state.direction,
  shaderErrors,
  floatLinear,
  simulationVersion: simulation.version,
  volume: simulation.volume(),
  waterVolume: simulation.waterVolume(),
  tapFlow: state.tapFlow,
  fish: fishSystem.diagnostics(),
  maxWetness: simulation.hasWater
    ? Math.max(...simulation.moisture) / simulation.waterCapacity
    : 0,
  centerHeight: simulation.sample(0, 0),
  brush: uniforms.uBrush.value.toArray(),
});
// Development-only inspection for tests; production exposes read-only metrics above.
if (import.meta.env.DEV)
  window.sandTest = {
    fishSystem,
    simulation,
    state,
    setTool,
    camera,
    pickSand,
    projectSand(x, z) {
      const projected = new THREE.Vector3(
        x,
        simulation.sample(x, z),
        z,
      ).project(camera);
      return {
        x: ((projected.x + 1) / 2) * innerWidth,
        y: ((1 - projected.y) / 2) * innerHeight,
      };
    },
  };
resume();
