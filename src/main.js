import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { terrainHeight, windVector, QUALITY, chooseAdaptiveQuality } from './terrain.js';
import { terrainVertex, terrainFragment, skyVertex, skyFragment, particleVertex, particleFragment } from './shaders.js';
import './style.css';

const $ = (id) => document.getElementById(id);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const state = { wind: 12, direction: 65, sun: 16, haze: 0.08, paused: reducedMotion, quality: 'auto' };
const presets = {
  golden: { wind: 12, direction: 65, sun: 16, haze: 0.08 },
  day: { wind: 8, direction: 90, sun: 58, haze: 0.02 },
  storm: { wind: 36, direction: 35, sun: 11, haze: 0.82 },
};
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (error) {
  $('loading').hidden = true;
  $('error').hidden = false;
  $('error').textContent = 'This desert needs WebGL 2. Enable hardware acceleration in your browser, then reload the page. ' + error.message;
  throw error;
}
renderer.setClearColor(0xb99a72);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.domElement.setAttribute('aria-label', 'Three-dimensional dunes with animated windblown sand. Drag to orbit and scroll to zoom.');
renderer.domElement.setAttribute('role', 'img');
renderer.domElement.tabIndex = 0;
$('world').prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(53, 1, 0.3, 2400);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.enablePan = false;
controls.minDistance = 25;
controls.maxDistance = 260;
controls.minPolarAngle = 0.3;
controls.maxPolarAngle = Math.PI * 0.49;
controls.autoRotateSpeed = 0.28;
controls.zoomSpeed = 0.65;
function resetView() {
  camera.position.set(95, 40, 125);
  controls.target.set(-30, 8, -55);
  controls.update();
}
resetView();
const uniforms = {
  uTime: { value: 0 }, uDrift: { value: new THREE.Vector2() },
  uWind: { value: state.wind }, uWindDirection: { value: new THREE.Vector2() },
  uSun: { value: new THREE.Vector3() }, uSand: { value: new THREE.Color('#ddba80') },
  uFog: { value: new THREE.Color() }, uHaze: { value: state.haze },
  uShadows: { value: 1 }, uPixelRatio: { value: 1 },
};
const terrainMaterial = new THREE.ShaderMaterial({ uniforms, vertexShader: terrainVertex, fragmentShader: terrainFragment });
let terrain;
function makeTerrain(segments) {
  const geometry = new THREE.PlaneGeometry(1900, 1900, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  // Nonuniform grid: concentrate triangles where the camera can see fine crests.
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i) / 950, z = positions.getZ(i) / 950;
    positions.setXYZ(i, Math.sign(x) * Math.pow(Math.abs(x), 1.65) * 950, 0, Math.sign(z) * Math.pow(Math.abs(z), 1.65) * 950);
  }
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1400);
  if (terrain) { terrain.geometry.dispose(); terrain.geometry = geometry; }
  else { terrain = new THREE.Mesh(geometry, terrainMaterial); terrain.frustumCulled = false; scene.add(terrain); }
}
const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.ShaderMaterial({
  uniforms, vertexShader: skyVertex, fragmentShader: skyFragment, side: THREE.BackSide, depthWrite: false, depthTest: false,
}));
sky.frustumCulled = false;
sky.renderOrder = -10;
scene.add(sky);

// Static seed buffers; no particle positions or terrain buffers are uploaded per frame.
const particlesGeometry = new THREE.BufferGeometry();
const positions = new Float32Array(QUALITY.high.particles * 3);
const seeds = new Float32Array(QUALITY.high.particles * 4);
let rng = 7091;
const random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
for (let i = 0; i < QUALITY.high.particles; i++) {
  positions[i * 3] = (random() - 0.5) * 480;
  positions[i * 3 + 2] = (random() - 0.5) * 480;
  for (let j = 0; j < 4; j++) seeds[i * 4 + j] = random();
}
particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
particlesGeometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
const particles = new THREE.Points(particlesGeometry, new THREE.ShaderMaterial({
  uniforms, vertexShader: particleVertex, fragmentShader: particleFragment,
  transparent: true, depthWrite: false, blending: THREE.NormalBlending,
}));
particles.frustumCulled = false;
scene.add(particles);
let activeQuality = '';
function applyQuality(level) {
  if (level === activeQuality) return;
  activeQuality = level;
  const setting = QUALITY[level];
  makeTerrain(setting.segments);
  particlesGeometry.setDrawRange(0, setting.particles);
  uniforms.uShadows.value = setting.shadows;
  resize();
}
function resize() {
  const width = $('world').clientWidth, height = $('world').clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  // Also cap total framebuffer area on very large / high-DPI displays.
  const pixelRatio = Math.min(window.devicePixelRatio || 1, QUALITY[activeQuality || 'medium'].pixelRatio, Math.sqrt(3_600_000 / (width * height)));
  renderer.setPixelRatio(pixelRatio);
  uniforms.uPixelRatio.value = pixelRatio;
  renderer.setSize(width, height);
}
applyQuality(window.innerWidth < 760 ? 'low' : 'medium');
window.addEventListener('resize', resize);

function syncAtmosphere() {
  uniforms.uWind.value = state.wind;
  uniforms.uWindDirection.value.set(...windVector(state.direction));
  uniforms.uHaze.value = state.haze;
  const elevation = THREE.MathUtils.degToRad(state.sun);
  uniforms.uSun.value.set(-Math.cos(elevation) * 0.83, Math.sin(elevation), -Math.cos(elevation) * 0.56).normalize();
  uniforms.uFog.value.set(state.sun > 35 ? '#cfcebc' : '#d9b88c');
  uniforms.uFog.value.lerp(new THREE.Color('#bda17c'), state.haze * 0.6);
  for (const name of ['wind', 'direction', 'sun']) {
    const input = $(name);
    input.value = state[name];
    input.style.setProperty('--fill', `${(state[name] - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100}%`);
    $(name + '-value').textContent = state[name] + (name === 'wind' ? ' km/h' : '°');
  }
}
syncAtmosphere();
for (const name of ['wind', 'direction', 'sun']) {
  $(name).addEventListener('input', (event) => {
    state[name] = Number(event.target.value);
    if (name === 'wind') state.haze = Math.max(0.02, (state.wind - 15) / 30);
    document.querySelectorAll('[data-preset]').forEach(button => button.setAttribute('aria-pressed', 'false'));
    syncAtmosphere();
  });
}
document.querySelectorAll('[data-preset]').forEach(button => {
  button.addEventListener('click', () => {
    Object.assign(state, presets[button.dataset.preset]);
    document.querySelectorAll('[data-preset]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    syncAtmosphere();
  });
});
$('quality').addEventListener('change', (event) => {
  state.quality = event.target.value;
  applyQuality(state.quality === 'auto' ? 'medium' : state.quality);
  qualityCooldown = 0;
});
$('orbit').addEventListener('change', () => { controls.autoRotate = $('orbit').checked; });
function updatePause() {
  $('pause').setAttribute('aria-pressed', String(state.paused));
  $('pause').innerHTML = state.paused ? '▷ <span>Resume wind</span>' : 'Ⅱ <span>Pause wind</span>';
}
$('pause').addEventListener('click', () => { state.paused = !state.paused; updatePause(); });
updatePause();
$('reset').addEventListener('click', resetView);
$('collapse').addEventListener('click', () => {
  const collapsed = $('settings').hidden = !$('settings').hidden;
  document.querySelector('.controls').classList.toggle('collapsed', collapsed);
  $('collapse').textContent = collapsed ? '+' : '−';
  $('collapse').setAttribute('aria-expanded', String(!collapsed));
  $('collapse').setAttribute('aria-label', collapsed ? 'Expand atmosphere controls' : 'Collapse atmosphere controls');
});
function toggleUI() {
  const hidden = document.body.classList.toggle('clean');
  document.querySelectorAll('.interface').forEach(element => { element.inert = hidden; });
  $('show-ui').hidden = !hidden;
  (hidden ? $('show-ui') : $('hide-ui')).focus();
}
$('hide-ui').addEventListener('click', toggleUI);
$('show-ui').addEventListener('click', toggleUI);
window.addEventListener('keydown', (event) => {
  if (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
  if (event.code === 'KeyH') toggleUI();
  if (event.target.tagName === 'BUTTON') return;
  if (event.code === 'Space') { event.preventDefault(); state.paused = !state.paused; updatePause(); }
  if (event.code === 'KeyR') resetView();
});

let lastTime = 0, sampleTime = 0, sampleFrames = 0, qualityCooldown = 0;
let frameHandle = 0, contextLost = false, started = false;
function frame(now) {
  if (document.hidden || contextLost) return;
  const delta = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 0;
  const rawDelta = lastTime ? (now - lastTime) / 1000 : 0;
  lastTime = now;
  if (!state.paused) {
    uniforms.uTime.value += delta;
    // Integrate drift so changing wind direction/speed never jumps the whole terrain.
    const gust = 1 + 0.22 * Math.sin(uniforms.uTime.value * 0.65) + 0.1 * Math.sin(uniforms.uTime.value * 1.7);
    uniforms.uDrift.value.addScaledVector(uniforms.uWindDirection.value, delta * state.wind * 0.20 * gust);
  }
  controls.update(delta);
  const ground = terrainHeight(camera.position.x, camera.position.z, uniforms.uDrift.value.x, uniforms.uDrift.value.y);
  camera.position.y = Math.max(camera.position.y, ground + 3.5);
  renderer.render(scene, camera);
  if (!started) { started = true; $('loading').hidden = true; }
  sampleTime += rawDelta; sampleFrames++; qualityCooldown += rawDelta;
  if (sampleTime >= 2) {
    const fps = Math.round(sampleFrames / sampleTime);
    $('stats').textContent = `${fps} FPS · ${activeQuality.toUpperCase()} · ${renderer.info.render.calls} DRAWS`;
    if (state.quality === 'auto' && qualityCooldown > 10) {
      const next = chooseAdaptiveQuality(fps, activeQuality);
      if (next !== activeQuality) { applyQuality(next); qualityCooldown = 0; }
    }
    sampleTime = 0; sampleFrames = 0;
  }
  frameHandle = requestAnimationFrame(frame);
}
function resumeFrames() {
  cancelAnimationFrame(frameHandle);
  lastTime = 0; sampleTime = 0; sampleFrames = 0;
  if (!document.hidden && !contextLost) frameHandle = requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', resumeFrames);
renderer.domElement.addEventListener('webglcontextlost', (event) => {
  event.preventDefault(); contextLost = true; cancelAnimationFrame(frameHandle);
  $('error').textContent = 'The graphics connection was interrupted. Waiting for your browser to restore it…';
  $('error').hidden = false;
});
renderer.domElement.addEventListener('webglcontextrestored', () => { contextLost = false; $('error').hidden = true; resumeFrames(); });

// Small read-only diagnostics surface for reproducible performance measurements.
window.sandDiagnostics = () => ({
  quality: activeQuality, drawCalls: renderer.info.render.calls,
  triangles: renderer.info.render.triangles, particles: particlesGeometry.drawRange.count,
  pixelRatio: renderer.getPixelRatio(), paused: state.paused,
  wind: state.wind, direction: state.direction, sun: state.sun,
  drift: uniforms.uDrift.value.toArray(), camera: camera.position.toArray(),
});

// Optional page-scoped agent access; ordinary browsers need no extension or polyfill.
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
  const register = (tool) => {
    try { Promise.resolve(document.modelContext.registerTool(tool, { signal: lifecycle.signal })).catch(console.warn); }
    catch (error) { console.warn('Optional desert tool registration failed', error); }
  };
  register({
    name: 'read_desert', title: 'Read desert conditions',
    description: 'Read current wind, sunlight, and renderer statistics.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true }, execute: () => window.sandDiagnostics(),
  });
  register({
    name: 'set_desert_atmosphere', title: 'Set desert atmosphere',
    description: 'Apply Golden hour, High sun, or Sandstorm to the visible desert.',
    inputSchema: { type: 'object', properties: { preset: { type: 'string', enum: ['golden', 'day', 'storm'] } }, required: ['preset'], additionalProperties: false },
    annotations: { readOnlyHint: false },
    execute: (input) => {
      if (!input || typeof input !== 'object' || !Object.hasOwn(presets, input.preset) || Object.keys(input).some(key => key !== 'preset')) throw new Error('Expected one preset: golden, day, or storm.');
      document.querySelector(`[data-preset="${input.preset}"]`).click();
      return window.sandDiagnostics();
    },
  });
}
resumeFrames();
