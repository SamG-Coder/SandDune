# SAND / Emulation

A real-time, wind-shaped desert built with Three.js and GLSL. Sculpted dune crests, moving sand ripples, fine airborne grains, and soft atmospheric light, with a small interface for exploring the conditions.

**[Explore the desert](https://samg-coder.github.io/SandDune/)** · **[Build and deployment](https://github.com/SamG-Coder/SandDune/actions)**

## Run locally

Requires Node.js 24 and a browser with WebGL 2 and hardware acceleration.

```sh
npm ci
npm run dev
```

```sh
npm test       # terrain, wind, adaptive quality, and shader syntax checks
npm run build # production static files in dist/
npm run preview
```

## Explore

- Drag / touch-drag to orbit. Scroll / pinch to move closer or farther away.
- Change wind speed (0–40 km/h), wind direction, and sun elevation.
- Try **Golden hour**, **High sun**, and **Sandstorm**.
- Enable **Slow camera orbit** for an unattended view.
- **Space** pauses wind; **R** resets the camera; **H** hides or restores controls. Keyboard shortcuts work outside form fields. Buttons and sliders are keyboard accessible.
- **Adaptive** rendering starts at Balanced on desktop and Low on narrow screens. You can also choose a fixed quality.
- The wind starts paused when the operating system requests reduced motion. Hidden tabs stop rendering.

## How the sand works

This is a visual emulation, not a granular physics or erosion solver. The speed readout controls an artistic mapping of wind to visible transport; it is not a calibrated meteorological simulation. The displayed coordinates are evocative, not a claim that the terrain reproduces that real location.

### 1. Dune geometry

A deterministic height field produces wandering ridgelines and rounded troughs. The vertex shader evaluates the field and its gradient on a nonuniform grid, concentrating vertices in the central area explored by the camera. Dunes move very slowly with integrated wind displacement. A matching CPU function keeps the camera above the current ground.

### 2. Surface detail

Wind advects procedural ripples and a thin sand veil in the fragment shader. Ripples perturb the lighting normal rather than adding geometry. Screen-space derivatives fade them when they become too small to resolve, preventing distant moiré. Fine grain, broad grazing response, warm illumination, and cooler ambient shading give the surface its powdery finish. No texture downloads or Blender baking are required.

### 3. Airborne sand

One points draw call animates fixed seed buffers entirely on the GPU. Grains wrap around a bounded field, follow the dune height, and hop in gusts. Soft alpha edges and depth testing integrate them with the ground. Wind displacement is integrated, so adjusting speed or direction does not teleport the terrain.

### 4. Light and atmosphere

A sky shader provides the horizon gradient, sun disc, and dusty glow. Exponential aerial perspective merges distant dunes into the horizon. Balanced and High use a bounded six-sample height-field visibility estimate for soft dune shadows. This approximate method can miss distant occluders; it avoids a separate dynamic shadow-map pass. Low uses local normal-based lighting only.

## Performance design

| Quality | Terrain segments per side | Terrain triangles | Sand particles | Maximum pixel ratio | Height-field shadows |
| --- | ---: | ---: | ---: | ---: | --- |
| Low | 160 | 51,200 | 2,200 | 1.00 | No |
| Balanced | 256 | 131,072 | 5,500 | 1.35 | Yes |
| High | 384 | 294,912 | 11,000 | 1.75 | Yes |

- **Three draw calls:** sky, terrain, and particles. No full-screen postprocessing chain and no per-frame geometry uploads.
- **Framebuffer cap:** at most approximately 3.6 million pixels, in addition to the quality and device pixel-ratio limits.
- **Adaptive quality:** after a ten-second cooldown, sustained sampling below 36 FPS reduces one tier. Low can recover to Balanced above 57 FPS. High is an explicit choice.
- **Lifecycle:** animation stops in hidden tabs, frame delta is clamped on resumption, and context-loss recovery is handled.
- **Zero terrain textures:** sand detail lives in the shaders. Fonts use Google Fonts with local sans-serif fallbacks.
- Inspect live metrics in the footer or call `sandDiagnostics()` in the browser console. FPS is measured locally; no universal 60 FPS claim is made.

The most expensive stage is fragment shading at high resolutions. Lower pixel ratio or disable the height-field shadows before increasing mesh density. For a substantially larger freely explorable world, replace the bounded grid with camera-centered LOD rings and introduce world-origin rebasing. For physically accumulated sand, add a height-field erosion/transport compute stage; increasing particle count alone will not produce dune physics.

## Deployment

The public repository uses GitHub Pages with GitHub Actions as its source. Each push to `main` installs locked dependencies, runs tests, builds with Vite, uploads `dist`, and deploys to Pages. Pull requests run validation and build without deploying. All asset paths are relative, so the build works under the `/SandDune/` project path.

The workflow uses read-only repository permission during build. Only the deployment job receives Pages write and OIDC permissions. No deployment tokens or secrets are stored in the project.

## Sources and implementation references

- [Three.js ShaderMaterial](https://threejs.org/docs/pages/ShaderMaterial.html): custom GLSL materials and uniform updates.
- [Three.js BufferGeometry](https://threejs.org/docs/pages/BufferGeometry.html): reusable vertex and particle buffers.
- [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html): pixel ratio, rendering statistics, tone mapping, and WebGL behavior.
- [GitHub custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages): artifact-based build and deployment.

MIT licensed. Three.js and the build toolchain retain their respective licenses.
