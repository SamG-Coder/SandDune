# Sand

Local Three.js sandbox. Public publishing is disabled; the repository remote has been removed.

An interactive sand surface inside an open glass box. Dig trenches, push sand into their rims, pour piles, and watch gravity settle unstable slopes while wind transports and redeposits material. The interface consists of a compact tool strip and optional wind/light controls.

## Use

- **Dig:** drag to displace sand into the edges of a trench. Removed volume is deposited in the surrounding rim.
- **Pour:** hold or drag to add sand. High piles avalanche down their sides.
- **Smooth:** redistribute nearby sand without changing its total volume.
- **Water:** hold to pour. Water runs downhill and soaks into the sand; continued pouring leaves pools above the saturated material.
- **Tap flow:** sets the pouring rate from 0–1000% (10×); 100% preserves the original water behaviour. This control appears when Water is selected.
- **Fish:** click sufficiently deep, wide water to place a flowing-fin goldfish. Press **6** to select it. Up to eight fish share the Blender model and textures. They swim only where their body and fins fit beneath the simulated water surface and above the sand, and turn away from shorelines, sand barriers, and glass walls. If the water becomes too shallow, they stop swimming until it returns. Reset sand also clears fish.
- **Orbit:** drag to move the camera. Right-drag also orbits while a sand tool is selected.
- Scroll or pinch to zoom. Touch-drag sculpts; two fingers rotate and zoom.
- **Size** changes the brush radius. **Reset sand** restores the initial surface; **Reset view** restores the camera.
- Open **Wind & light** to adjust speed, direction, sunlight, rendering quality, or pause.
- Keys **1–4** select the original tools, **5** selects Water, **Space** pauses/resumes physics, **R** resets the view, and **H** hides/restores controls. Reset sand also clears water and moisture. Form fields retain their normal keyboard behaviour.
- Reduced-motion preferences start the simulation paused. You can still sculpt and resume explicitly.

## Material behaviour

The active 160 × 160 world-unit patch stores **37,249 height cells**. A fixed 30 Hz finite-volume update changes actual surface heights. Rendering, camera clearance, and pointer picking read this same state. It persists when the pointer is released; it is not an animated normal-map illusion.

**Gravity and angle of repose.** Sand transfers between eight neighbouring cells only when a slope exceeds its repose threshold. Cardinal slopes use a rise/run threshold of 0.62 (about 32°); diagonal thresholds scale with distance. A stable pile stops flowing when wind is off. Pairwise transfers conserve volume, and donor limits prevent removing more material than a cell contains.

**Wind transport.** Upwind advection moves sand in the chosen direction. A diffusive transport term softens sharp disturbances as erosion and deposition progress. Changing wind direction reverses transport. Wind below the model's entrainment threshold does not move the resting surface. This is an artistic, accelerated transport model; the km/h control is not meteorologically calibrated.

**Direct interaction.** Digging removes available material from the brush core and deposits that exact amount in its rim. Pouring intentionally introduces new sand. Smoothing redistributes existing material. A fixed underlying floor prevents unlimited digging. All cells, including edges and corners, can be edited and can exchange sand with their neighbours. Glass walls prevent transfer outside the box. Digging at a wall removes the edge sand and deposits it inside the box; unstable edge piles slump inward. Half-cell edge weights and quarter-cell corner weights keep the volume calculation correct.

**Rendering.** Irregular, individually placed asymmetric drifts replace a periodic dune pattern. The central height field is uploaded as a small float texture only when it changes. The terrain vertex shader displaces a dense central mesh; the fragment shader shades the resulting slopes and subtle grain detail. The sand mesh ends exactly at the inner glass faces. Live cross-section meshes show the depth of the sand through the walls, and a solid rounded base sits underneath. There is no surrounding desert. Windborne visual grains use a separate GPU-animated points batch. Those grains visualize transport already handled by the height-field solver, rather than adding a second source of material.

## Water and wet sand

Wind also drives exposed surface water. A bounded stress term adds momentum in the selected wind direction, with stronger forcing at higher speeds. Gravity, donor limits, and the glass boundaries continue to govern the resulting flow and conserve water volume. Visible ripples align with the wind, grow stronger, and move faster as wind increases; their pixel filtering preserves smooth highlights. This is an artistic coupling, not a meteorologically calibrated wave model.

Free surface water and absorbed moisture are separate fields. A conservative pipe-flow approximation stores momentum across neighbouring cells, accelerates water under gravity, and limits outgoing flux to the available volume. Water spreads before it absorbs, pools in depressions, and remains inside the glass walls. Moisture moves with displaced sediment. Damp sand gains cohesion; saturation lowers the yield slope for a muddy slump and suppresses wind transport. These are artistic material responses rather than calibrated soil mechanics.

The liquid uses a separate physical transmission material with water's 1.333 refractive index, depth-dependent optical thickness, subtle animated ripples, and studio reflections. The darker wet sediment is beneath the clear liquid. Both glass and water use screen-space transmission, so nested transparent surfaces have the usual raster-rendering limitations. A GPU points batch shows the pouring stream. Water fields and flow buffers are allocated once, and water updates are skipped until water is introduced.

## Glass construction

Four glass slabs have physical thickness, an index of refraction of 1.5, subtle absorption, reflections from a generated studio environment, and narrow polished edges. Balanced and High use physical transmission/refraction. Low uses simpler reflective transparency to avoid the extra refraction render pass. The starting camera fits the whole container and can orbit or zoom inside. The brush remains anchored while held so digging deeper does not slide the cursor away from a wall.

## Performance

The original goldfish was authored and rendered in Blender, with a 2K scale atlas, modelled eyes and gills, fine fin rays, and fin/body morph targets. The editable source is `art-assets/goldfish/goldfish.blend`; `tools/build-goldfish.py` regenerates it and `public/models/goldfish.glb`. The GLB is approximately 6 MB and loads asynchronously. Each fish uses seven material batches and shares geometry and textures with the others. Fin membranes render in the opaque refraction capture so they remain aligned with the body beneath the water. Swimming collision checks sample the live water field across the fish's full footprint, including small dry pockets; they do not use decorative wave heights as navigable water.

| Quality  | Mesh segments per side | Wind particles | Maximum pixel ratio | Terrain shadows |
| -------- | ---------------------: | -------------: | ------------------: | --------------- |
| Low      |                    192 |          1,600 |                1.00 | Off             |
| Balanced |                    256 |          4,200 |                1.30 | On              |
| High     |                    320 |          8,000 |                1.65 | On              |

- The glass box adds wall, base, floor, cross-section, and edge draws. Balanced currently renders 16 draw calls including its refraction pass; Low uses simpler glass. The brush outline is shaded directly on the terrain.
- Hardware float-texture filtering is used when available, with a manual bilinear fallback.
- The framebuffer is capped at approximately 2.8 million pixels.
- Adaptive quality lowers a tier when sustained FPS falls below 36 and can recover from Low to Balanced above 57, with a cooldown to limit repeated changes.
- The physics resolution is independent of graphics quality, so changing quality preserves sculpted details and sand state.
- Hidden tabs stop simulation and rendering. Graphics context recovery is handled.
- `sandDiagnostics()` reports current rendering and simulation statistics. The development server also exposes `sandTest` for regression tests; that mutable test hook is absent from production builds.

The on-screen FPS counter measures the actual browser. Graphics performance depends on the GPU, viewport, and glass quality; browser tests using a software renderer are correctness checks rather than hardware GPU benchmarks.

## Limits

This is a real-time height-field approximation, not a discrete-element simulation of every grain. It models persistent deformation, mass transfer, wind transport, finite depth, slope collapse, and simplified moisture cohesion. Water is a shallow surface-flow approximation, without full 3D splashes, overturning waves, evaporation, or sediment suspension. It does not model overhangs, buried objects, or grain-level friction and collision. Physics fills the glass box. Sand cannot pass through the side walls. A physically calibrated sediment model or arbitrary 3D granular volumes would require a different solver and a larger compute budget.

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

The unit suite checks mass conservation, repose settling, stable rest, downwind movement and reversal, finite depth, smoothing, reset, sampling, edge/corner digging, wall-pile collapse, weighted volume conservation, and GLSL syntax. The browser suite checks actual WebGL shader compilation, mouse-driven deformation, pouring, camera movement, reset, mobile layout, reduced motion, quality changes, and actual mouse-driven digging against a glass wall. Screenshots from browser tests are saved locally under `.artifacts/` and are ignored by Git.

## Publishing status

The user deleted the public repository. This checkout has no remote and must not be pushed or published without renewed authorization. The existing workflow remains available for a future authorized repository; no deployment credentials are stored in the project. All attribution uses SamG-Coder.

## References

- [Three.js ShaderMaterial](https://threejs.org/docs/pages/ShaderMaterial.html)
- [Three.js DataTexture](https://threejs.org/docs/pages/DataTexture.html)
- [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html)
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

MIT licensed. Dependencies retain their own licenses.
