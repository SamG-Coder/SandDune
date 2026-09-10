# Sand

**[Open the simulation](https://samg-coder.github.io/SandDune/)** · **[Actions](https://github.com/SamG-Coder/SandDune/actions)**

An interactive Three.js sand surface. Dig trenches, push sand into their rims, pour piles, and watch gravity settle unstable slopes while wind transports and redeposits material. The interface consists of a compact tool strip and optional wind/light controls.

## Use

- **Dig:** drag to displace sand into the edges of a trench. Removed volume is deposited in the surrounding rim.
- **Pour:** hold or drag to add sand. High piles avalanche down their sides.
- **Smooth:** redistribute nearby sand without changing its total volume.
- **Orbit:** drag to move the camera. Right-drag also orbits while a sand tool is selected.
- Scroll or pinch to zoom. Touch-drag sculpts; two fingers rotate and zoom.
- **Size** changes the brush radius. **Reset sand** restores the initial surface; **Reset view** restores the camera.
- Open **Wind & light** to adjust speed, direction, sunlight, rendering quality, or pause.
- Keys **1–4** select tools, **Space** pauses/resumes physics, **R** resets the view, and **H** hides/restores controls. Form fields retain their normal keyboard behaviour.
- Reduced-motion preferences start the simulation paused. You can still sculpt and resume explicitly.

## Material behaviour

The active 160 × 160 world-unit patch stores **37,249 height cells**. A fixed 30 Hz finite-volume update changes actual surface heights. Rendering, camera clearance, and pointer picking read this same state. It persists when the pointer is released; it is not an animated normal-map illusion.

**Gravity and angle of repose.** Sand transfers between eight neighbouring cells only when a slope exceeds its repose threshold. Cardinal slopes use a rise/run threshold of 0.62 (about 32°); diagonal thresholds scale with distance. A stable pile stops flowing when wind is off. Pairwise transfers conserve volume, and donor limits prevent removing more material than a cell contains.

**Wind transport.** Upwind advection moves sand in the chosen direction. A diffusive transport term softens sharp disturbances as erosion and deposition progress. Changing wind direction reverses transport. Wind below the model's entrainment threshold does not move the resting surface. This is an artistic, accelerated transport model; the km/h control is not meteorologically calibrated.

**Direct interaction.** Digging removes available material from the brush core and deposits that exact amount in its rim. Pouring intentionally introduces new sand. Smoothing redistributes existing material. A fixed underlying floor prevents unlimited digging. The outer cells exchange no mass, so sand remains inside the simulated patch.

**Rendering.** Irregular, individually placed asymmetric drifts replace a periodic dune pattern. The central height field is uploaded as a small float texture only when it changes. The terrain vertex shader displaces a dense central mesh; the fragment shader shades the resulting slopes and subtle grain detail. Distant terrain is static. Windborne visual grains use a separate GPU-animated points batch. Those grains visualize transport already handled by the height-field solver, rather than adding a second source of material.

## Performance

| Quality | Mesh segments per side | Wind particles | Maximum pixel ratio | Terrain shadows |
| --- | ---: | ---: | ---: | --- |
| Low | 256 | 1,600 | 1.00 | Off |
| Balanced | 352 | 4,200 | 1.30 | On |
| High | 448 | 8,000 | 1.65 | On |

- Three draw calls: terrain, sky, and airborne sand. The brush outline is shaded directly on the terrain.
- Hardware float-texture filtering is used when available, with a manual bilinear fallback.
- The framebuffer is capped at approximately 2.8 million pixels.
- Adaptive quality lowers a tier when sustained FPS falls below 36 and can recover from Low to Balanced above 57, with a cooldown to limit repeated changes.
- The physics resolution is independent of graphics quality, so changing quality preserves sculpted details and sand state.
- Hidden tabs stop simulation and rendering. Graphics context recovery is handled.
- `sandDiagnostics()` reports current rendering and simulation statistics. The development server also exposes `sandTest` for regression tests; that mutable test hook is absent from production builds.

An initial local benchmark measured approximately **1.7 ms per simulation step** for 37,249 cells, averaged over 300 steps. This measures only CPU physics on the development machine, not full-frame performance or a guarantee for other devices. The on-screen FPS counter measures the actual browser.

## Limits

This is a real-time height-field approximation of dry sand, not a discrete-element simulation of every grain. It models persistent deformation, mass transfer, wind transport, finite depth, and slope collapse. It does not model overhangs, buried objects, cohesion from moisture, or grain-level friction and collision. Physics runs only inside the central patch; the wider desert provides a static backdrop. A physically calibrated sediment model or arbitrary 3D granular volumes would require a different solver and a larger compute budget.

## Run and test

Requires Node.js 24 and a WebGL 2 browser with hardware acceleration recommended.

```sh
npm ci
npm run dev
```

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run build
npm run preview
```

The unit suite checks mass conservation, repose settling, stable rest, downwind movement and reversal, finite depth, smoothing, reset, sampling, and GLSL syntax. The browser suite checks actual WebGL shader compilation, mouse-driven deformation, pouring, camera movement, reset, mobile layout, reduced motion, and quality changes. Screenshots from browser tests are saved locally under `.artifacts/` and are ignored by Git.

## Public deployment

GitHub Actions installs locked dependencies, runs the physics and browser suites, builds with Vite, and deploys `dist/` to GitHub Pages on pushes to `main`. Pull requests validate without deploying. Assets use relative URLs for the `/SandDune/` project path. No deployment credentials are stored in the repository.

## References

- [Three.js ShaderMaterial](https://threejs.org/docs/pages/ShaderMaterial.html)
- [Three.js DataTexture](https://threejs.org/docs/pages/DataTexture.html)
- [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html)
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

MIT licensed. Dependencies retain their own licenses.
